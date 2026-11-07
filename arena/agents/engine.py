import json
import sqlite3
import time
from pathlib import Path
from typing import TypedDict

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

from arena.agents.approval import ApprovalRequired
from arena.agents.context import decision_context, market_facts, store_facts
from arena.agents.middleware import bounded_tools, budgeted_execution, tool_budget
from arena.agents.providers import build_model, is_deepseek
from arena.agents.structured import parse_model_response, role_call
from arena.agents.tool_records import tool_records
from arena.domain.models import CandidatePlans, Decision, PlanReview, ProductAction, RoutingPlan
from arena.domain.procurement import POLICY
from arena.domain.simulation import budget_plan, simulate_plan
from arena.infrastructure.events import emit
from arena.infrastructure.storage_permissions import prepare_sqlite_files
from arena.locales import language_of, language_scope, localize, localize_event, localize_schema, tr


class AgentState(TypedDict, total=False):
    observation: dict
    strategy: dict
    mode: str
    decision: dict
    tools: list[dict]
    stages: list[dict]
    input_tokens: int
    output_tokens: int
    started_at: float
    duration_ms: int
    model_config: dict
    workflow: str
    thread_id: str
    candidates: list[dict]
    evaluations: list[dict]
    reviews: list[dict]
    revisions: int
    iterations: list[dict]
    routing: dict
    projection: dict
    negotiation: dict
    human_action: str
    human_response: dict
    human_revisions: int
    evidence: dict
    market: dict
    auto_revisions: int


def rule_decision(observation, strategy):
    merchant = observation["store"]
    market = observation["market"]
    competitors = observation["competitors"]
    language = language_of(observation)
    actions = []
    if merchant["bankrupt"]:
        return Decision(
            products=[
                ProductAction(product_id=item["product_id"], price=item["price"], purchase_quantity=0)
                for item in merchant["inventory"]
            ],
            marketing_budget=0,
            summary=tr("rule.bankrupt_summary", language),
            memory=merchant["memory"] or tr("rule.bankrupt_memory", language),
        )
    for product in market["products"]:
        stock = next(item for item in merchant["inventory"] if item["product_id"] == product["id"])
        expected_sales = product["demand"] / observation["merchant_count"]
        price = round(product["cost"] * (1 + strategy["margin"]))
        if strategy["approach"] == "discount" and competitors:
            competitor_prices = [
                next(item["price"] for item in rival["prices"] if item["product_id"] == product["id"])
                for rival in competitors
            ]
            price = max(round(product["cost"] * 1.3), min(price, min(competitor_prices) - 50))
        if strategy["approach"] == "adaptive":
            previous_sales = (
                observation["history"][-1]["sold"] / len(market["products"])
                if observation["history"]
                else expected_sales
            )
            price *= 0.9 if stock["quantity"] > expected_sales * 1.6 else 1.06
            if product["supply"] < product["demand"] * 0.7:
                price *= 1.12
            expected_sales = expected_sales * 0.6 + previous_sales * 0.4
        if observation["remaining_rounds"] <= 2 and stock["quantity"] > expected_sales:
            price *= 0.88
        desired_stock = round(expected_sales * strategy["stock_days"])
        reserve = market["rent"] * 2
        quantity = min(250, max(0, desired_stock - stock["quantity"]))
        if merchant["cash"] < reserve:
            quantity = 0
        actions.append(
            ProductAction(
                product_id=product["id"], price=max(100, min(10000, round(price))), purchase_quantity=quantity
            )
        )
    marketing = min(strategy["marketing_budget"], max(0, (merchant["cash"] - market["rent"] * 2) // 10))
    total_purchase = sum(item.purchase_quantity for item in actions)
    event = localize_event(market["event"], language)["name"]
    summary = tr(
        "rule.summary." + strategy["approach"],
        language,
        event=event,
        total=total_purchase,
        marketing=f"{marketing / 100:.0f}",
    )
    memory = tr("rule.memory", language, round=market["round"], event=event, profit=f"{merchant['profit'] / 100:.2f}")
    return Decision(products=actions, marketing_budget=marketing, summary=summary, memory=memory)


def build_tools(observation):
    language = language_of(observation)

    @tool(description=tr("tool.inspect_store", language))
    def inspect_store() -> dict:
        return store_facts(observation["store"], language)

    @tool(description=tr("tool.observe_market", language))
    def observe_market() -> dict:
        return {
            "market": market_facts(observation["market"], language),
            "competitors": observation["competitors"],
            "remaining_rounds": observation["remaining_rounds"],
        }

    @tool(description=tr("tool.review_history", language))
    def review_history() -> list[dict]:
        return observation["history"]

    @tool(description=tr("tool.evaluate_plan", language))
    def evaluate_plan(products: list[dict], marketing_budget: int) -> dict:
        placeholder = tr("tool.projection_placeholder", language)
        return simulate_plan(
            observation,
            {"products": products, "marketing_budget": marketing_budget, "summary": placeholder, "memory": placeholder},
        )

    @tool(description=tr("tool.recall_experience", language))
    def recall_experience() -> list[dict]:
        return observation.get("experiences", [])

    return [inspect_store, observe_market, review_history, evaluate_plan, recall_experience]


class AgentEngine:
    def __init__(self, directory: Path, settings_provider):
        self.settings_provider = settings_provider
        prepare_sqlite_files(directory)
        self.connection = sqlite3.connect(directory / "checkpoints.sqlite", check_same_thread=False, timeout=15)
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.checkpointer = SqliteSaver(
            self.connection,
            serde=JsonPlusSerializer(
                allowed_msgpack_modules=[
                    (module, name)
                    for module in ["arena.models", "arena.domain.models"]
                    for name in [
                        "Decision",
                        "ProductAction",
                        "CandidatePlans",
                        "PlanReview",
                        "RoutingPlan",
                        "NegotiationAction",
                    ]
                ]
            ),
        )
        self.approvals = None
        self.negotiator = None
        graph = StateGraph(AgentState)
        for name in ["observe", "route", "decide", "simulate", "review", "approval", "negotiate", "commit_plan"]:
            graph.add_node(name, self.tracked(name))
        graph.add_edge(START, "observe")
        graph.add_edge("observe", "route")
        graph.add_edge("route", "decide")
        graph.add_conditional_edges(
            "decide", self.after_decision, {"simulate": "simulate", "commit_plan": "commit_plan"}
        )
        graph.add_conditional_edges("simulate", self.after_simulate, {"review": "review", "approval": "approval"})
        graph.add_conditional_edges("review", self.after_review, {"decide": "decide", "approval": "approval"})
        graph.add_conditional_edges(
            "approval",
            lambda state: "decide" if state.get("human_action") == "reject" else "negotiate",
            {"decide": "decide", "negotiate": "negotiate"},
        )
        graph.add_edge("negotiate", "commit_plan")
        graph.add_edge("commit_plan", END)
        self.graph = graph.compile(checkpointer=self.checkpointer)

    def tracked(self, name):
        labels = {
            "observe": "观察经营环境",
            "route": "规划目标与行动",
            "decide": "生成经营方案",
            "simulate": "比较候选方案",
            "review": "独立风险审核",
            "approval": "检查人工审批条件",
            "negotiate": "供应商协商",
            "commit_plan": "提交经营方案",
        }

        def execute(state):
            started = time.monotonic()
            emit(name, "started", labels[name], revision=state.get("revisions", 0))
            try:
                result = getattr(self, name)(state)
            except Exception as error:
                emit(name, "failed", labels[name] + "中断", error_type=type(error).__name__)
                raise
            payload = {
                key: result[key]
                for key in [
                    "routing",
                    "decision",
                    "candidates",
                    "evaluations",
                    "reviews",
                    "negotiation",
                    "human_action",
                    "evidence",
                    "market",
                ]
                if key in result
            }
            skipped = (
                name == "approval"
                and result.get("human_action") == "not_required"
                or name == "negotiate"
                and not state["observation"].get("agent_options", {}).get("negotiation")
            )
            label = (
                "本轮无需人工审批"
                if name == "approval" and skipped
                else "本轮未启用供应商协商"
                if skipped
                else labels[name] + "完成"
            )
            emit(
                name,
                "skipped" if skipped else "completed",
                label,
                duration_ms=round((time.monotonic() - started) * 1000),
                **payload,
            )
            return result

        return execute

    def route(self, state):
        obs = state["observation"]
        language = language_of(obs)
        risky = (
            obs["market"]["event"]["type"] == "scarcity"
            or obs["store"]["cash"] < obs["market"]["rent"] * 6
            or any(item["quantity"] == 0 for item in obs["store"]["inventory"])
        )
        routing = {
            "objective": tr("routing.objective", language),
            "reason": tr("routing.risky" if risky else "routing.stable", language),
            "tools": ["observe_market", "evaluate_plan"] if risky else ["inspect_store"],
            "review_required": risky,
        }
        if obs.get("experiences"):
            routing["tools"].append("recall_experience")
        inputs = outputs = 0
        if state.get("workflow") == "adaptive" and state["mode"] == "llm" and not obs["store"]["bankrupt"]:
            routing, inputs, outputs = role_call(
                self.settings_provider(state.get("model_config")),
                RoutingPlan,
                tr("prompt.routing", language),
                {
                    "store": store_facts(obs["store"], language),
                    "market": market_facts(obs["market"], language),
                    "remaining_rounds": obs["remaining_rounds"],
                    "memory_mode": obs.get("agent_options", {}).get("memory", "recent"),
                    "tool_budget": obs.get("agent_options", {}).get("tool_budget", 6),
                },
                state["thread_id"] + "/routing",
                self.checkpointer,
                "route",
                language,
            )
            routing["review_required"] = risky or routing["review_required"]
        routing["tools"] = list(dict.fromkeys(routing["tools"]))[: obs.get("agent_options", {}).get("tool_budget", 6)]
        if obs.get("agent_options", {}).get("memory") != "episodic":
            routing["tools"] = [name for name in routing["tools"] if name != "recall_experience"]
        if state["mode"] == "rule" or obs["store"]["bankrupt"]:
            routing["tools"] = []
            routing["reason"] = tr("routing.rule" if state["mode"] == "rule" else "routing.bankrupt", language)
        return {
            "routing": routing,
            "input_tokens": state["input_tokens"] + inputs,
            "output_tokens": state["output_tokens"] + outputs,
            "stages": state["stages"]
            + [{"node": "route", "label": localize("目标与行动规划", language), "status": "completed"}],
        }

    def observe(self, state):
        obs = state["observation"]
        return {
            "tools": [],
            "market": obs["market"],
            "evidence": {
                "cash": obs["store"]["cash"],
                "inventory": obs["store"]["inventory"],
                "market_event": obs["market"]["event"]["name"],
                "experiences": obs.get("experiences", []),
            },
            "stages": [{"node": "observe", "label": localize("观察市场", language_of(obs)), "status": "completed"}],
            "input_tokens": 0,
            "output_tokens": 0,
            "reviews": [],
            "revisions": 0,
            "auto_revisions": 0,
            "iterations": [],
        }

    def decide(self, state):
        reviewed = (
            state.get("workflow") == "reviewed"
            or state.get("workflow") == "adaptive"
            and (state["routing"]["review_required"] or state.get("revisions", 0) > 0)
        ) and not state["observation"]["store"]["bankrupt"]
        language = language_of(state["observation"])
        if state["mode"] == "rule" or state["observation"]["store"]["bankrupt"]:
            decision = rule_decision(state["observation"], state["strategy"])
            if state.get("human_revisions", 0):
                scale = 0.75 ** state["human_revisions"]
                decision = decision.model_copy(
                    update={
                        "products": [
                            item.model_copy(update={"purchase_quantity": round(item.purchase_quantity * scale)})
                            for item in decision.products
                        ],
                        "marketing_budget": round(decision.marketing_budget * scale),
                        "summary": tr("rule.human_scaled", language) + decision.summary[:320],
                    }
                )
            if state["observation"].get("experiences"):
                recent = state["observation"]["experiences"][0]
                if recent["outcome"]["missed"]:
                    decision = decision.model_copy(
                        update={
                            "products": [
                                action.model_copy(
                                    update={"purchase_quantity": min(250, round(action.purchase_quantity * 1.08))}
                                )
                                for action in decision.products
                            ],
                            "summary": decision.summary[:280]
                            + tr("rule.experience_restock", language, round=recent["round"]),
                        }
                    )
            candidates = [decision.model_dump()]
            if reviewed:
                conservative = decision.model_copy(
                    update={
                        "products": [
                            item.model_copy(update={"purchase_quantity": item.purchase_quantity // 2})
                            for item in decision.products
                        ],
                        "marketing_budget": decision.marketing_budget // 2,
                        "summary": tr("rule.conservative", language),
                    }
                )
                candidates = [budget_plan(state["observation"], item.model_dump()) for item in [decision, conservative]]
            return {
                "decision": decision.model_dump(),
                "input_tokens": state["input_tokens"],
                "output_tokens": state["output_tokens"],
                "candidates": candidates,
                "stages": state["stages"]
                + [{"node": "decide", "label": localize("生成经营决策", language), "status": "completed"}],
            }
        settings = self.settings_provider(state.get("model_config"))
        native_json = is_deepseek(settings)
        schema = CandidatePlans if reviewed else Decision
        model = build_model(settings, json_mode=native_json)
        feedback = (
            json.dumps(state["reviews"][-1], ensure_ascii=False)
            if state.get("reviews")
            else tr("prompt.first_plan", language)
        )
        tools = build_tools(state["observation"])[:4] if reviewed else build_tools(state["observation"])[:3]
        if state["observation"].get("agent_options", {}).get("memory") == "episodic":
            tools.append(build_tools(state["observation"])[4])
        if state.get("workflow") == "adaptive":
            tools = [item for item in tools if item.name in state["routing"]["tools"]]
        agent = create_agent(
            model=model,
            tools=tools,
            response_format=None if native_json else ToolStrategy(schema, handle_errors=False),
            middleware=[bounded_tools, budgeted_execution],
            system_prompt=(
                tr("prompt.decide", language)
                + tr(
                    "prompt.supply_shared"
                    if state["observation"].get("supply_policy") == POLICY
                    else "prompt.supply_rotating",
                    language,
                )
                + tr("prompt.summary_rules", language)
                + state["strategy"]["prompt"]
                + tr("prompt.known_facts", language)
                + json.dumps(
                    {"routing": state.get("routing", {}), **decision_context(state["observation"], language)},
                    ensure_ascii=False,
                )
                + (tr("prompt.two_candidates", language) if reviewed else "")
                + (
                    tr("prompt.json_final", language)
                    + json.dumps(localize_schema(schema.model_json_schema(), language), ensure_ascii=False)
                    if native_json
                    else ""
                )
            ),
            checkpointer=self.checkpointer,
        )
        agent_config = {
            "configurable": {"thread_id": state["thread_id"] + f"/planner-{state.get('revisions', 0)}"},
            "recursion_limit": settings["max_steps"],
        }
        saved = agent.get_state(agent_config)
        if saved.values and not saved.next:
            response = saved.values
        else:
            remaining = max(
                0, state["observation"].get("agent_options", {}).get("tool_budget", 6) - len(state["tools"])
            )
            budget_token = tool_budget.set(remaining)
            try:
                response = agent.invoke(
                    None
                    if saved.values
                    else {"messages": [{"role": "user", "content": tr("prompt.submit", language) + feedback}]},
                    agent_config,
                )
            finally:
                tool_budget.reset(budget_token)
        inputs = outputs = 0
        tools = list(state["tools"])
        pending = {}
        for message in response["messages"]:
            if isinstance(message, AIMessage):
                usage = message.usage_metadata or {}
                inputs += usage.get("input_tokens", 0)
                outputs += usage.get("output_tokens", 0)
                for call in message.tool_calls:
                    pending[call["id"]] = call
            elif isinstance(message, ToolMessage) and message.name not in ("Decision", "CandidatePlans"):
                call = pending[message.tool_call_id]
                tools.append({"name": call["name"], "arguments": call["args"], "result": message.content})
        structured = (
            parse_model_response(schema, response["messages"][-1].content, "decide")
            if native_json
            else response["structured_response"]
        )
        candidates = [item.model_dump() for item in structured.candidates] if reviewed else [structured.model_dump()]
        return {
            "decision": candidates[0],
            "candidates": candidates,
            "tools": tool_records(tools),
            "input_tokens": state["input_tokens"] + inputs,
            "output_tokens": state["output_tokens"] + outputs,
            "stages": state["stages"]
            + [{"node": "decide", "label": localize("生成经营决策", language), "status": "completed"}],
        }

    def after_decision(self, state):
        return "simulate" if not state["observation"]["store"]["bankrupt"] else "commit_plan"

    def simulate(self, state):
        results = [
            {"index": index, "summary": plan["summary"], "plan": plan, **simulate_plan(state["observation"], plan)}
            for index, plan in enumerate(state["candidates"])
        ]
        selected = max(results, key=lambda item: item["score"])
        return {
            "evaluations": results,
            "decision": state["candidates"][selected["index"]],
            "projection": selected,
            "iterations": state.get("iterations", [])
            + [{"revision": state["revisions"], "candidates": results, "selected_index": selected["index"]}],
            "stages": state["stages"]
            + [
                {
                    "node": "simulate",
                    "label": localize("多情景试算", language_of(state["observation"])),
                    "status": "completed",
                }
            ],
        }

    def after_simulate(self, state):
        return (
            "review"
            if state.get("workflow") == "reviewed"
            or state.get("workflow") == "adaptive"
            and (state.get("routing", {}).get("review_required") or state["projection"]["risks"])
            else "approval"
        )

    def review(self, state):
        chosen = max(state["evaluations"], key=lambda item: item["score"])
        language = language_of(state["observation"])
        inputs = outputs = 0
        if state["mode"] == "llm":
            settings = self.settings_provider(state.get("model_config"))
            native_json = is_deepseek(settings)
            reviewer = create_agent(
                model=build_model(settings, json_mode=native_json),
                response_format=None if native_json else ToolStrategy(PlanReview, handle_errors=False),
                system_prompt=tr("prompt.reviewer", language)
                + (
                    tr("prompt.json_only", language)
                    + json.dumps(localize_schema(PlanReview.model_json_schema(), language), ensure_ascii=False)
                    if native_json
                    else ""
                ),
                checkpointer=self.checkpointer,
            )
            config = {
                "configurable": {"thread_id": state["thread_id"] + f"/reviewer-{state['revisions']}"},
                "recursion_limit": settings["max_steps"],
            }
            saved = reviewer.get_state(config)
            if saved.values and not saved.next:
                response = saved.values
            else:
                emit("review", "model_started", "等待审核模型响应", model=settings["model"])
                response = reviewer.invoke(
                    None
                    if saved.values
                    else {
                        "messages": [
                            {
                                "role": "user",
                                "content": json.dumps(
                                    {
                                        "store": store_facts(state["observation"]["store"], language),
                                        "market": market_facts(state["observation"]["market"], language),
                                        "plan": state["decision"],
                                        "projection": chosen,
                                    },
                                    ensure_ascii=False,
                                ),
                            }
                        ]
                    },
                    config,
                )
            review = (
                parse_model_response(PlanReview, response["messages"][-1].content, "review")
                if native_json
                else response["structured_response"]
            ).model_dump()
            for message in response["messages"]:
                if isinstance(message, AIMessage):
                    usage = message.usage_metadata or {}
                    inputs += usage.get("input_tokens", 0)
                    outputs += usage.get("output_tokens", 0)
            if not (saved.values and not saved.next):
                emit(
                    "review",
                    "model_completed",
                    "审核模型已响应",
                    model=settings["model"],
                    input_tokens=inputs,
                    output_tokens=outputs,
                )
        else:
            review = {"approved": not chosen["risks"], "reason": tr("review.rule_reason", language), "issues": []}
        if chosen["risks"]:
            review["approved"] = False
            review["issues"] = chosen["risks"] + review["issues"]
        auto_revisions = state.get("auto_revisions", max(0, state["revisions"] - state.get("human_revisions", 0)))
        if not review["approved"] and auto_revisions >= 2:
            raise ValueError(
                tr(
                    "review.failed_twice",
                    language,
                    reason=review["reason"],
                    issues=tr("list.separator", language).join(review["issues"]),
                )
            )
        return {
            "reviews": state["reviews"] + [review],
            "revisions": state["revisions"] + (0 if review["approved"] else 1),
            "auto_revisions": auto_revisions + (0 if review["approved"] else 1),
            "input_tokens": state["input_tokens"] + inputs,
            "output_tokens": state["output_tokens"] + outputs,
            "stages": state["stages"]
            + [
                {
                    "node": "review",
                    "label": localize("风险审核通过" if review["approved"] else "退回修订", language),
                    "status": "completed",
                }
            ],
        }

    def after_review(self, state):
        return "approval" if state["reviews"][-1]["approved"] else "decide"

    def approval(self, state):
        return self.approvals.gate(state) if self.approvals else {"human_action": "not_required"}

    def negotiate(self, state):
        if state["observation"].get("agent_options", {}).get("negotiation") and self.negotiator:
            result = self.negotiator.run(state)
            return {
                "negotiation": result,
                "input_tokens": state["input_tokens"] + result["input_tokens"],
                "output_tokens": state["output_tokens"] + result["output_tokens"],
            }
        return {"negotiation": {}}

    def commit_plan(self, state):
        Decision.model_validate(state["decision"])
        projection = simulate_plan(state["observation"], state["decision"])
        return {
            "stages": state["stages"]
            + [
                {
                    "node": "commit_plan",
                    "label": localize("提交经营方案", language_of(state["observation"])),
                    "status": "completed",
                }
            ],
            "projection": projection,
            "duration_ms": max(0, round((time.time() - state["started_at"]) * 1000)),
        }

    def run(
        self, arena_id, round_number, merchant_id, observation, strategy, mode, model_config=None, workflow="direct"
    ):
        config = {"configurable": {"thread_id": f"arena-{arena_id}/round-{round_number}/merchant-{merchant_id}"}}
        checkpoint = self.graph.get_state(config)
        if checkpoint.values.get("decision") and not checkpoint.next:
            state = checkpoint.values
        else:
            initial = {
                "observation": observation,
                "strategy": strategy,
                "mode": mode,
                "started_at": time.time(),
                "model_config": model_config or {},
                "workflow": workflow,
                "thread_id": config["configurable"]["thread_id"],
            }
            if checkpoint.values and "thread_id" not in checkpoint.values:
                self.graph.update_state(
                    config, {**initial, "input_tokens": 0, "output_tokens": 0, "reviews": [], "revisions": 0}
                )
            resume = None
            if checkpoint.interrupts and self.approvals:
                with self.approvals.db.connect() as conn:
                    row = conn.execute(
                        "SELECT response FROM approvals WHERE arena_id=? AND merchant_id=? AND round_number=? AND state='resolved'",
                        (arena_id, merchant_id, round_number),
                    ).fetchone()
                if row:
                    resume = Command(resume=json.loads(row["response"]))
                else:
                    raise ApprovalRequired()
            token = tool_budget.set(observation.get("agent_options", {}).get("tool_budget", 6))
            try:
                with language_scope(language_of(observation)):
                    state = self.graph.invoke(
                        resume if resume else None if checkpoint.values else initial, {**config, "recursion_limit": 60}
                    )
            finally:
                tool_budget.reset(token)
            if state.get("__interrupt__"):
                raise ApprovalRequired()
        return {
            "plan": state["decision"],
            "observation": observation,
            "tools": state["tools"],
            "stages": state["stages"],
            "input_tokens": state["input_tokens"],
            "output_tokens": state["output_tokens"],
            "duration_ms": state["duration_ms"],
            "model_config": state.get("model_config", {}),
            "trace": {
                "workflow": workflow,
                "candidates": state.get("evaluations", []),
                "reviews": state.get("reviews", []),
                "revisions": state.get("revisions", 0),
                "iterations": state.get("iterations", []),
                "routing": state.get("routing", {}),
                "projection": state.get("projection", {}),
                "negotiation": state.get("negotiation", {}),
                "memory": observation.get("experiences", []),
                "human_response": state.get("human_response"),
            },
        }

    def close(self):
        self.connection.close()
