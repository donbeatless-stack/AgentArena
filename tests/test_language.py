"""Match language: English content end to end, Chinese matches unchanged, and the model sees one language."""

import json
import re
from pathlib import Path

from arena.domain.catalog import SCENARIOS, STRATEGIES
from arena.domain.market import conditions
from arena.locales import LABELS_EN, STRATEGIES_EN, TEXT, localize_market, localize_strategy
from tests.test_model import ModelHandler, configure

CJK = re.compile(r"[一-鿿]")
CHINESE_PROMPT_MARKERS = [
    "你在 AgentArena",
    "你是经营任务规划者",
    "你是独立的经营风险审核员",
    "你是独立供应商",
    "你代表商店采购",
    "仅返回符合以下 JSON Schema",
    "零售价，单位分",
    "查询本店现金",
    "平稳营业",
]


def english_config(**overrides):
    return {
        "name": "English market",
        "scenario": "neighborhood",
        "seed": 42,
        "total_rounds": 4,
        "merchants": [
            {"name": "Northstar Shop", "strategy_id": "balanced", "mode": "rule", "color": "violet"},
            {"name": "Orange Supply", "strategy_id": "discount", "mode": "rule", "color": "orange"},
        ],
        **overrides,
    }


def test_new_matches_default_to_english_content(client):
    created = client.post("/api/arenas", json=english_config()).json()
    assert created["language"] == "en"
    path = f"/api/arenas/{created['id']}"
    for round_number in range(2):
        response = client.post(path + "/step", json={"expected_round": round_number})
        assert response.status_code == 200, response.text
    arena = response.json()
    for decision in arena["decisions"]:
        assert not CJK.search(decision["plan"]["summary"] + decision["plan"]["memory"])
        assert not CJK.search(" ".join(stage["label"] for stage in decision["stages"]))
        assert decision["trace"]["routing"]["objective"].startswith("Grow ending net assets")
    events = client.get(path + "/timeline").json()
    assert events and not CJK.search(" ".join(event["label"] for event in events))
    assert any(event["label"] == "Round settled" for event in events)
    csv = client.get(path + "/export?format=csv").text
    assert csv.lstrip("﻿").startswith("Round,Store,Type,Product,Quantity")
    rematch = client.post(path + "/fork").json()
    assert rematch["language"] == "en" and rematch["name"] == "English market · Rematch"


def test_english_match_export_contains_no_chinese(client):
    """Catalog text (products, units, scenario, market events) is stored in the match language."""
    created = client.post("/api/arenas", json=english_config(scenario="festival", total_rounds=6)).json()
    path = f"/api/arenas/{created['id']}"
    for round_number in range(5):  # rounds 1-5 cover the normal, discount, rain and festival events
        assert client.post(path + "/step", json={"expected_round": round_number}).status_code == 200
    exported = client.get(path + "/export").json()
    events = {snapshot["market"]["event"]["type"] for snapshot in exported["snapshots"]}
    assert {"normal", "discount", "rain", "festival"} <= events
    market = exported["snapshots"][-1]["market"]
    assert market["scenario_name"] == "Weekend market"
    assert [(item["name"], item["unit"]) for item in market["products"]][0] == ("Cold brew coffee", "btl")
    timeline = client.get(path + "/timeline").json()
    assert CJK.findall(json.dumps([exported, timeline], ensure_ascii=False)) == []


def test_chinese_matches_keep_chinese_content(client, arena_config):
    created = client.post("/api/arenas", json=arena_config).json()
    assert created["language"] == "zh"
    arena = client.post(f"/api/arenas/{created['id']}/step", json={"expected_round": 0}).json()
    assert all(CJK.search(item["plan"]["summary"]) for item in arena["decisions"])
    market = arena["snapshot"]["market"]
    assert market["event"]["name"] == "平稳营业" and market["products"][0]["name"] == "冷萃咖啡"
    assert arena["snapshot"]["merchants"][0]["inventory"][0]["name"] == "冷萃咖啡"
    events = client.get(f"/api/arenas/{created['id']}/timeline").json()
    assert any(event["label"] == "经营结果已结算" for event in events)


def test_reviewed_rule_workflow_writes_english_projections(client):
    config = english_config()
    for merchant in config["merchants"]:
        merchant["workflow"] = "reviewed"
    created = client.post("/api/arenas", json=config).json()
    arena = client.post(f"/api/arenas/{created['id']}/step", json={"expected_round": 0}).json()
    candidates = [item for decision in arena["decisions"] for item in decision["trace"]["candidates"]]
    assert candidates
    assert {scenario["name"] for item in candidates for scenario in item["scenarios"]} == {
        "Low demand",
        "Base demand",
        "High demand",
    }
    texts = [item["summary"] + item["supply_assumption"] + " ".join(item["risks"]) for item in candidates]
    assert not CJK.search(" ".join(texts))


def test_english_llm_match_sends_english_prompts_tools_and_schema(client, model_server):
    configure(client, model_server)
    settings = client.get("/api/settings").json()
    assert client.put("/api/settings", json={**settings, "provider": "deepseek"}).status_code == 200
    config = english_config()
    config["merchants"][0].update(
        mode="llm",
        workflow="adaptive",
        agent_options={"memory": "episodic", "negotiation": True, "tool_budget": 3},
    )
    created = client.post("/api/arenas", json=config).json()
    response = client.post(f"/api/arenas/{created['id']}/step", json={"expected_round": 0})
    assert response.status_code == 200, response.text

    prompts = [str(request["messages"][0]["content"]) for request in ModelHandler.requests]
    sent = json.dumps(ModelHandler.requests, ensure_ascii=False)
    assert any(prompt.startswith("You are the task planner") for prompt in prompts)
    assert any(prompt.startswith("You run a store in AgentArena") for prompt in prompts)
    assert any(prompt.startswith("You are an independent supplier") for prompt in prompts)
    assert any(prompt.startswith("You buy for a store") for prompt in prompts)
    assert STRATEGIES_EN["balanced"]["prompt"] in sent
    joined = "\n".join(prompts)
    assert "Retail price in cents" in joined and '"name": "Business as usual"' in joined
    assert not [marker for marker in CHINESE_PROMPT_MARKERS if marker in sent]
    descriptions = [
        tool["function"]["description"] for request in ModelHandler.requests for tool in request.get("tools", [])
    ]
    assert descriptions and not any(CJK.search(text) for text in descriptions)


def test_builtin_strategy_text_is_localized_only_when_unedited():
    balanced = next(item for item in STRATEGIES if item["id"] == "balanced")
    assert localize_strategy(balanced, "en")["prompt"] == STRATEGIES_EN["balanced"]["prompt"]
    assert localize_strategy(balanced, "zh") == balanced
    edited = {**balanced, "prompt": "My own instructions"}
    localized = localize_strategy(edited, "en")
    assert localized["prompt"] == "My own instructions" and localized["name"] == "Steady"


def test_experiments_create_matches_in_their_language(client):
    experiment = client.post(
        "/api/experiments",
        json={"name": "Language check", "strategy_ids": ["balanced", "discount"], "seeds": [5, 6], "rounds": 3},
    ).json()
    assert experiment["config"]["language"] == "en"
    arenas = [client.get(f"/api/arenas/{item['id']}").json() for item in experiment["arenas"]]
    assert {arena["language"] for arena in arenas} == {"en"}
    assert {variant["name"] for variant in experiment["config"]["variants"]} == {"Steady", "Price attack"}


def test_frontend_server_dictionary_agrees_with_backend_text():
    """The UI maps fixed server strings both ways, so its pairs must match what the backend writes."""
    source = (Path(__file__).parents[1] / "frontend/src/i18n/server.ts").read_text(encoding="utf-8")
    frontend = dict(re.findall(r'^\s*"((?:[^"\\]|\\.)*)": "((?:[^"\\]|\\.)*)",$', source, re.MULTILINE))
    pairs = {**LABELS_EN, **{text["zh"]: text["en"] for text in TEXT.values() if "{" not in text["zh"]}}
    pairs.update({item["name"]: STRATEGIES_EN[item["id"]]["name"] for item in STRATEGIES})
    shared = {zh: en.strip() for zh, en in pairs.items() if zh in frontend}
    assert len(shared) > 60
    assert {zh: frontend[zh] for zh in shared if frontend[zh] != shared[zh]} == {}
    # English matches store catalog text in English, so the Chinese UI must map every entry back.
    catalog = {}
    for scenario in SCENARIOS:
        for round_number in range(1, 8):
            chinese = conditions(scenario["id"], 1, round_number)
            english = localize_market(chinese, "en")
            catalog[chinese["scenario_name"]] = english["scenario_name"]
            catalog.update({chinese["event"][key]: english["event"][key] for key in ("name", "description", "impact")})
            for source_item, item in zip(chinese["products"], english["products"]):
                catalog.update({source_item["name"]: item["name"], source_item["unit"]: item["unit"]})
    assert len(catalog) == 3 + 5 * 3 + 3 * 2
    assert {zh: frontend.get(zh) for zh, en in catalog.items() if frontend.get(zh) != en} == {}
    reverse = [en for zh, en in frontend.items() if en in catalog.values()]
    assert len(reverse) == len(set(reverse)), "an English catalog string must map back to one Chinese string"


def test_existing_databases_migrate_matches_to_chinese(client):
    with client.app.state.database.connect() as connection:
        column = next(row for row in connection.execute("PRAGMA table_info(arenas)") if row["name"] == "language")
    assert column["dflt_value"] == "'zh'"
