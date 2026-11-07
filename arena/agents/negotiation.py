"""Bounded bilateral negotiation with private supplier goals and fenced reservations."""

import hashlib
import json

from arena.agents.structured import role_call
from arena.domain.models import NegotiationAction
from arena.domain.procurement import POLICY
from arena.execution.context import current_job
from arena.execution.tasks import TaskStore
from arena.infrastructure.database import encode
from arena.infrastructure.events import emit
from arena.locales import language_of, tr


def supplier_terms(arena_id, round_number, product, language="zh"):
    # Private supplier cost differs by product/round; it is never passed to the buyer.
    salt = int(hashlib.sha256(f"{round_number}/{product['id']}".encode()).hexdigest()[:8], 16)
    return {
        "id": "wholesale",
        "name": tr("negotiation.supplier_name", language),
        "opening": round(product["cost"] * 1.03),
        "floor": round(product["cost"] * (0.89 + salt % 5 / 100)),
        "capacity": product["supply"],
    }


class Negotiator:
    def __init__(self, database, settings_provider, checkpointer):
        self.db, self.settings_provider, self.checkpointer = database, settings_provider, checkpointer

    def run(self, state, job=None):
        job = job or current_job.get()
        obs = state["observation"]
        arena_id, number, merchant_id = obs["arena_id"], obs["market"]["round"], obs["store"]["id"]
        shared = obs.get("supply_policy") == POLICY
        language = language_of(obs)
        allocation_notice = tr("prompt.allocation_notice", language) if shared else ""
        with self.db.connect() as conn:
            saved = conn.execute(
                "SELECT result FROM negotiation_sessions WHERE arena_id=? AND round_number=? AND merchant_id=?",
                (arena_id, number, merchant_id),
            ).fetchone()
        if saved:
            return json.loads(saved["result"])
        messages, contracts = [], []
        inputs = outputs = 0
        remaining_cash = max(0, obs["store"]["cash"] - obs["market"]["rent"] - state["decision"]["marketing_budget"])
        actions = {item["product_id"]: item for item in state["decision"]["products"]}
        for product in obs["market"]["products"]:
            action = actions[product["id"]]
            terms = supplier_terms(arena_id, number, product, language)
            quantity = min(action["purchase_quantity"], remaining_cash // terms["opening"])
            if shared:
                quantity = min(quantity, product["supply"])
            if quantity <= 0:
                emit("negotiate", "skipped", "本商品无采购需求、供货或可用预算，跳过谈判", product_id=product["id"])
                continue
            transcript = [
                {"sender": "buyer", "action": "rfq", "quantity": quantity, "reason": tr("negotiation.rfq", language)}
            ]
            emit("negotiate", "message", "采购方询价", product_id=product["id"], turn=0, message=transcript[0])
            current = {
                "action": "offer",
                "unit_price": terms["opening"],
                "quantity": quantity,
                "reason": tr("negotiation.opening", language),
            }
            accepted = None
            for turn in range(3):
                if state["mode"] == "llm":
                    settings = self.settings_provider(state.get("model_config"))
                    current, used_in, used_out = role_call(
                        settings,
                        NegotiationAction,
                        tr("prompt.supplier", language) + allocation_notice,
                        {
                            "private": {
                                "floor": terms["floor"],
                                "opening": terms["opening"],
                                "capacity": terms["capacity"],
                            },
                            "product": product["id"],
                            "messages": transcript,
                            "turn": turn + 1,
                        },
                        state["thread_id"] + f"/supplier-{product['id']}-{state.get('revisions', 0)}-{turn}",
                        self.checkpointer,
                        "negotiate",
                        language,
                    )
                    inputs += used_in
                    outputs += used_out
                elif turn:
                    bid = transcript[-1]
                    current = {
                        "action": "accept" if bid["unit_price"] >= terms["floor"] else "offer",
                        "unit_price": max(terms["floor"], bid["unit_price"]),
                        "quantity": quantity,
                        "reason": tr(
                            "negotiation.accept" if bid["unit_price"] >= terms["floor"] else "negotiation.cover_cost",
                            language,
                        ),
                    }
                prior = transcript[-1]
                if current["action"] == "accept":
                    if (
                        prior["action"] != "offer"
                        or current["unit_price"] != prior["unit_price"]
                        or current["quantity"] != prior["quantity"]
                    ):
                        current = {
                            **current,
                            "action": "reject",
                            "reason": tr("negotiation.accept_mismatch_supplier", language),
                        }
                if current["action"] != "reject" and current["unit_price"] < terms["floor"]:
                    current = {**current, "action": "reject", "reason": tr("negotiation.below_floor", language)}
                if current["action"] != "reject" and (current["quantity"] <= 0 or current["quantity"] > quantity):
                    current = {
                        **current,
                        "action": "reject",
                        "reason": tr("negotiation.quantity_out_of_range", language),
                    }
                transcript.append({"sender": "supplier", **current})
                emit(
                    "negotiate",
                    "message",
                    "供应商回复",
                    product_id=product["id"],
                    turn=turn + 1,
                    message=transcript[-1],
                )
                if current["action"] == "reject":
                    break
                if current["action"] == "accept":
                    accepted = current
                    break
                if state["mode"] == "llm":
                    buyer, used_in, used_out = role_call(
                        settings,
                        NegotiationAction,
                        tr("prompt.buyer", language) + allocation_notice,
                        {
                            "private": {
                                "available_cash": remaining_cash,
                                "reference_cost": product["cost"],
                                "desired_quantity": quantity,
                            },
                            "messages": transcript,
                            "turn": turn + 1,
                            "last_turn": turn == 2,
                        },
                        state["thread_id"] + f"/buyer-{product['id']}-{state.get('revisions', 0)}-{turn}",
                        self.checkpointer,
                        "negotiate",
                        language,
                    )
                    inputs += used_in
                    outputs += used_out
                else:
                    buyer = {
                        "action": "accept" if turn == 2 or current["unit_price"] <= product["cost"] * 0.96 else "offer",
                        "unit_price": current["unit_price"]
                        if turn == 2
                        else round(product["cost"] * (0.92 + turn * 0.02)),
                        "quantity": current["quantity"],
                        "reason": tr("negotiation.buyer_counter", language),
                    }
                    if buyer["action"] == "accept":
                        buyer["unit_price"] = current["unit_price"]
                if buyer["action"] == "accept" and (
                    buyer["unit_price"] != current["unit_price"] or buyer["quantity"] != current["quantity"]
                ):
                    buyer = {**buyer, "action": "reject", "reason": tr("negotiation.accept_mismatch_buyer", language)}
                if buyer["action"] != "reject" and (
                    buyer["quantity"] <= 0
                    or buyer["quantity"] > quantity
                    or buyer["unit_price"] * buyer["quantity"] > remaining_cash
                ):
                    buyer = {**buyer, "action": "reject", "reason": tr("negotiation.over_budget", language)}
                transcript.append({"sender": "buyer", **buyer})
                emit(
                    "negotiate",
                    "message",
                    "采购方回复",
                    product_id=product["id"],
                    turn=turn + 1,
                    message=transcript[-1],
                )
                if buyer["action"] == "accept":
                    accepted = buyer
                    break
                if buyer["action"] == "reject":
                    break
            messages.append({"product_id": product["id"], "messages": transcript, "agreed": accepted is not None})
            if accepted:
                amount = accepted["unit_price"] * min(quantity, accepted["quantity"])
                if accepted["unit_price"] >= terms["floor"] and amount <= remaining_cash:
                    contracts.append(
                        {
                            "product_id": product["id"],
                            "supplier_id": terms["id"],
                            "quantity": min(quantity, accepted["quantity"]),
                            "unit_price": accepted["unit_price"],
                            "reference_price": product["cost"],
                            "expires_round": number,
                        }
                    )
                    remaining_cash -= amount
        # Race-safe reservation is the authoritative acceptance. No model can allocate stock.
        with self.db.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            if job:
                TaskStore.assert_lease(conn, job)
            arena = conn.execute("SELECT current_round FROM arenas WHERE id=?", (arena_id,)).fetchone()
            if arena["current_round"] + 1 != number:
                raise ValueError(tr("negotiation.expired", language))
            existing = conn.execute(
                "SELECT result FROM negotiation_sessions WHERE arena_id=? AND round_number=? AND merchant_id=?",
                (arena_id, number, merchant_id),
            ).fetchone()
            if existing:
                return json.loads(existing["result"])
            if shared:
                for contract in contracts:
                    contract.update(requested_quantity=contract["quantity"], status="pending_allocation")
                result = {
                    "messages": messages,
                    "contracts": contracts,
                    "input_tokens": inputs,
                    "output_tokens": outputs,
                }
                conn.execute(
                    "INSERT INTO negotiation_sessions VALUES(?,?,?,?)", (arena_id, number, merchant_id, encode(result))
                )
                return result
            for contract in contracts:
                product = next(item for item in obs["market"]["products"] if item["id"] == contract["product_id"])
                reserved = conn.execute(
                    "SELECT COALESCE(SUM(quantity),0) FROM supplier_reservations WHERE arena_id=? AND round_number=? AND product_id=? AND status='reserved'",
                    (arena_id, number, product["id"]),
                ).fetchone()[0]
                requested = contract["quantity"]
                contract["quantity"] = min(requested, max(0, product["supply"] - reserved))
                contract["requested_quantity"] = requested
                contract["status"] = "reserved" if contract["quantity"] else "unavailable"
                conn.execute(
                    "INSERT INTO supplier_reservations(arena_id,round_number,merchant_id,product_id,supplier_id,quantity,unit_price,expires_round) VALUES(?,?,?,?,?,?,?,?)",
                    (
                        arena_id,
                        number,
                        merchant_id,
                        product["id"],
                        contract["supplier_id"],
                        contract["quantity"],
                        contract["unit_price"],
                        number,
                    ),
                )
            result = {"messages": messages, "contracts": contracts, "input_tokens": inputs, "output_tokens": outputs}
            conn.execute(
                "INSERT INTO negotiation_sessions VALUES(?,?,?,?)", (arena_id, number, merchant_id, encode(result))
            )
        emit("negotiate", "reserved", "报价校验与库存预留完成", contracts=contracts)
        return result
