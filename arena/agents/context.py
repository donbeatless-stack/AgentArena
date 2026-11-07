"""Small business-only model inputs; omit UI labels and connection metadata."""

from arena.locales import LEGACY_LANGUAGE, PRODUCT_NAMES_EN, localize_event


def store_facts(store, language=LEGACY_LANGUAGE):
    facts = {key: store[key] for key in ("cash", "equity", "profit", "inventory", "reputation", "memory", "metrics")}
    if language == "en":
        facts["inventory"] = [
            {**item, "name": PRODUCT_NAMES_EN.get(item["product_id"], item.get("name"))} for item in store["inventory"]
        ]
    return facts


def market_facts(market, language=LEGACY_LANGUAGE):
    return {
        "round": market["round"],
        "event": localize_event(market["event"], language),
        "rent": market["rent"],
        "total_demand": market["total_demand"],
        "products": [
            {key: product[key] for key in ("id", "cost", "reference_price", "demand", "supply")}
            for product in market["products"]
        ],
    }


def decision_context(observation, language=LEGACY_LANGUAGE):
    return {
        "store": store_facts(observation["store"], language),
        "market": market_facts(observation["market"], language),
        "competitors": observation["competitors"],
        "history": observation["history"],
        "remaining_rounds": observation["remaining_rounds"],
        "experiences": observation.get("experiences", []),
        "supply_policy": observation.get("supply_policy", "sequential_v1"),
    }
