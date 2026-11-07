import type { DecisionEvent, HistoryPoint, Merchant } from "../../types";
import { st, t } from "../../i18n";

export const ACTIONS: Record<string, string> = {
  observe: "Observing market",
  route: "Planning actions",
  decide: "Drafting plan",
  simulate: "Comparing plans",
  review: "Checking risk",
  approval: "Awaiting approval",
  negotiate: "Negotiating supply",
  commit_plan: "Awaiting settlement",
  settle: "Settled",
};
export const TOOLS: Record<string, string> = {
  inspect_store: "Checking stock",
  observe_market: "Checking market",
  review_history: "Reviewing history",
  evaluate_plan: "Projecting plan",
  recall_experience: "Recalling experience",
};
export const PRODUCTS = { coffee: "Coffee", oats: "Oats", bar: "Energy bar" };

// A replay has one cursor for the entire market. No merchant can see a later event.
export function storeAtEvent(
  before: Merchant,
  after: Merchant,
  events: DecisionEvent[],
): Merchant {
  const settlement = events.find(
    (event) => event.node === "settle" && event.status === "completed",
  );
  if (!settlement) return before;
  const settled = settlement.payload.merchant ?? after;
  return { ...settled, procurement: settled.procurement ?? after.procurement };
}

export function actionLabel(event?: DecisionEvent): string {
  if (!event) return t("Waiting for this round");
  if (event.status === "failed") return t("Interrupted");
  if (event.status === "skipped") return t("Moving on");
  if (event.payload.tool)
    return TOOLS[event.payload.tool]
      ? t(TOOLS[event.payload.tool])
      : event.payload.tool;
  return ACTIONS[event.node] ? t(ACTIONS[event.node]) : st(event.label);
}

export interface Highlight {
  round: number;
  label: string;
  kind: "lead" | "loss" | "market";
}
export function highlights(history: HistoryPoint[]): Highlight[] {
  const result: Highlight[] = [];
  for (let index = 1; index < history.length; index++) {
    const point = history[index];
    const previous = history[index - 1];
    const leader = [...point.merchants].sort((a, b) => b.profit - a.profit)[0];
    const oldLeader = [...previous.merchants].sort(
      (a, b) => b.profit - a.profit,
    )[0];
    if (index > 1 && leader.id !== oldLeader.id)
      result.push({ round: point.round, label: t("Lead change"), kind: "lead" });
    else if (
      point.merchants.some(
        (store) =>
          store.profit <
          previous.merchants.find((old) => old.id === store.id)!.profit,
      )
    ) {
      result.push({ round: point.round, label: t("Round loss"), kind: "loss" });
    } else if (point.event !== previous.event)
      result.push({
        round: point.round,
        label: st(point.event),
        kind: "market",
      });
  }
  return result;
}
