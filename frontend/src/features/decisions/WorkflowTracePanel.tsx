import { CheckCircle2, RotateCcw } from "lucide-react";
import { money, signedMoney } from "../../api";
import type { WorkflowTrace } from "../../types";
import { PRODUCTS } from "../arena/sceneState";
import { st, t } from "../../i18n";

const MESSAGE_ACTIONS: Record<string, string> = {
  rfq: "Request for quote",
  offer: "Offer",
  accept: "Accept",
  reject: "Reject",
};

export function WorkflowTracePanel({ trace }: { trace: WorkflowTrace }) {
  if (
    !trace.candidates?.length &&
    !trace.negotiation?.messages?.length &&
    !trace.memory?.length
  )
    return null;
  const selected = [...(trace.candidates || [])].sort(
    (a, b) => b.score - a.score,
  )[0]?.index;
  const product = (id: string) =>
    id in PRODUCTS ? t(PRODUCTS[id as keyof typeof PRODUCTS]) : id;
  return (
    <section className="planning-trace">
      {!!trace.candidates?.length && (
        <>
          <div className="section-heading small">
            <h3>{t("Candidate projections")}</h3>
            <span>{t("Three demand scenarios · forecasts")}</span>
          </div>
          {!!trace.candidates?.length && (
            <p className="candidate-explanation">
              {t(
                "Ranks by base and low-demand profit while penalizing budget and cash risk. After a human edit, the submitted plan is what counts.",
              )}
            </p>
          )}
          <div className="projection-list">
            {trace.candidates?.map((candidate) => (
              <article
                key={candidate.index}
                className={
                  selected === candidate.index
                    ? "projection-card selected"
                    : "projection-card"
                }
              >
                <div className="section-heading small">
                  <h4>{t("Plan {index}", { index: candidate.index + 1 })}</h4>
                  {selected === candidate.index && (
                    <span className="positive">
                      <CheckCircle2 size={13} />
                      {t("Recommended")}
                    </span>
                  )}
                </div>
                <p>{candidate.summary}</p>
                {candidate.plan && (
                  <div className="candidate-actions">
                    {candidate.plan.products.map((item) => (
                      <span key={item.product_id}>
                        {product(item.product_id)}{" "}
                        {t("¥{price} / restock {count}", {
                          price: money(item.price),
                          count: item.purchase_quantity,
                        })}
                      </span>
                    ))}
                    <span>
                      {t("Marketing ¥{amount}", {
                        amount: money(candidate.plan.marketing_budget),
                      })}
                    </span>
                  </div>
                )}
                <div className="projection-metrics">
                  <span>
                    {t("Base-case net profit")}
                    <strong>{signedMoney(candidate.expected_profit)}</strong>
                  </span>
                  <span>
                    {t("Lowest cash")}
                    <strong>¥{money(candidate.worst_cash)}</strong>
                  </span>
                </div>
                <details>
                  <summary>{t("Scenario details")}</summary>
                  {candidate.supply_assumption && (
                    <p>{st(candidate.supply_assumption)}</p>
                  )}
                  <div className="scenario-projections">
                    {candidate.scenarios.map((scenario) => (
                      <div key={scenario.name}>
                        <b>{st(scenario.name)}</b>
                        <span>{t("Profit {amount}", { amount: signedMoney(scenario.profit) })}</span>
                        <span>{t("Sold {count} units", { count: scenario.sold })}</span>
                        <span>{t("{count} units left", { count: scenario.inventory })}</span>
                      </div>
                    ))}
                  </div>
                </details>
                {candidate.risks.length > 0 && (
                  <p className="negative">
                    {candidate.risks.map(st).join(t("; "))}
                  </p>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {!!trace.reviews?.length && (
        <>
          <div className="section-heading small">
            <h3>{t("Independent review")}</h3>
            <span>
              <RotateCcw size={13} />
              {t("{count} revisions", { count: trace.revisions || 0 })}
            </span>
          </div>
          <div className="review-list">
            {trace.reviews?.map((review, index) => (
              <article key={index}>
                <span className={review.approved ? "positive" : "negative"}>
                  {review.approved ? t("Approved") : t("Sent back for revision")}
                </span>
                <div>
                  <p>{st(review.reason)}</p>
                  {review.issues.length > 0 && (
                    <small>{review.issues.map(st).join(t("; "))}</small>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {(trace.iterations?.length || 0) > 1 && (
        <details className="context-data">
          <summary>{t("Revision history")}</summary>
          {trace.iterations?.map((iteration) => (
            <div className="revision-history" key={iteration.revision}>
              <b>{t("Version {number}", { number: iteration.revision + 1 })}</b>
              {iteration.candidates.map((candidate) => (
                <p key={candidate.index}>
                  {t("Plan {index}", { index: candidate.index + 1 })} ·{" "}
                  {candidate.summary} · {t("projected")}{" "}
                  {signedMoney(candidate.expected_profit)}
                  {candidate.risks.length
                    ? ` · ${candidate.risks.map(st).join(t("; "))}`
                    : ""}
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
      {!!trace.negotiation?.messages?.length && (
        <section className="negotiation-panel">
          <div className="section-heading small">
            <h3>{t("Supplier negotiation")}</h3>
            <span>{t("Independent buyer and seller · up to three rounds")}</span>
          </div>
          {trace.negotiation.messages.map((session) => {
            const contract = trace.negotiation?.contracts?.find((item) => item.product_id === session.product_id);
            const outcome = !session.agreed
              ? t("No deal reached")
              : !contract
                ? t("Price agreed")
                : contract.status === "pending_allocation"
                  ? t("Price agreed · awaiting allocation")
                  : contract.quantity === 0
                    ? t("Nothing received · no supply available")
                    : contract.status === "fulfilled"
                      ? t("{count} units delivered", { count: contract.quantity })
                      : t("{count} units reserved", { count: contract.quantity });
            return (
            <details key={session.product_id}>
              <summary>
                {product(session.product_id)}{" "}
                · {outcome}
              </summary>
              <div className="negotiation-messages">
                {session.messages.map((message, i) => (
                  <div
                    key={i}
                    className={`negotiation-message ${message.sender}`}
                  >
                    <b>{message.sender === "supplier" ? t("Supplier") : t("Buyer")}</b>
                    <span>
                      {MESSAGE_ACTIONS[message.action]
                        ? t(MESSAGE_ACTIONS[message.action])
                        : message.action}{" "}
                      · {t("{count} units", { count: message.quantity })}
                      {message.unit_price
                        ? ` · ${t("¥{price}/unit", { price: money(message.unit_price) })}`
                        : ""}
                    </span>
                    <p>{st(message.reason)}</p>
                  </div>
                ))}
              </div>
            </details>
            );
          })}
          <div className="contract-list">
            {trace.negotiation.contracts?.map((contract) => (
              <p key={contract.product_id}>
                <strong>
                  {product(contract.product_id)}
                </strong>{" "}
                {contract.status === "pending_allocation"
                  ? t("Awaiting allocation of {count} units", {
                      count: contract.requested_quantity,
                    })
                  : t(
                      contract.status === "fulfilled"
                        ? "Received {got}/{asked} units"
                        : "Reserved {got}/{asked} units",
                      { got: contract.quantity, asked: contract.requested_quantity },
                    )}{" "}
                ·{" "}
                {t(
                  contract.quantity > 0 &&
                    contract.status !== "pending_allocation"
                    ? "Unit cost ¥{price}"
                    : "Quote ¥{price}",
                  { price: money(contract.unit_price) },
                )}{" "}
                ·{" "}
                {t("Market reference ¥{price}", {
                  price: money(contract.reference_price),
                })}
              </p>
            ))}
          </div>
        </section>
      )}
      {!!trace.memory?.length && (
        <section className="experience-panel">
          <div className="section-heading small">
            <h3>{t("Experience recalled this round")}</h3>
            <span>{t("Settled facts from this store")}</span>
          </div>
          {trace.memory.map((memory) => (
            <details key={memory.evidence_id}>
              <summary>
                {t("Evidence #{id} · round {round} · actual profit {profit}", {
                  id: memory.evidence_id,
                  round: memory.round,
                  profit: signedMoney(memory.outcome.profit),
                })}
              </summary>
              <p>{memory.lesson}</p>
              <p>
                {t("Sold {sold} · stocked-out products {missed}", {
                  sold: memory.outcome.sold,
                  missed: memory.outcome.missed,
                })}{" "}
                ·{" "}
                {memory.outcome.prediction_error === null
                  ? t("No forecast recorded at the time")
                  : t("Forecast error {amount}", {
                      amount: signedMoney(memory.outcome.prediction_error),
                    })}
              </p>
              <p>{memory.action.summary}</p>
            </details>
          ))}
        </section>
      )}
    </section>
  );
}
