import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api, money } from "../../api";
import { Button, useToast } from "../../components/ui";
import type { Approval, Arena, Decision } from "../../types";
import { PRODUCTS } from "../arena/sceneState";
import { st, t } from "../../i18n";

function ApprovalCard({
  approval,
  arenaId,
  onUpdate,
}: {
  approval: Approval;
  arenaId: number;
  onUpdate: (arena: Arena) => void;
}) {
  const [plan, setPlan] = useState<Decision["plan"]>(
    structuredClone(approval.proposal.plan),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const send = async (action: "approve" | "modify" | "reject") => {
    setBusy(true);
    try {
      onUpdate(
        await api<Arena>(`/arenas/${arenaId}/approvals/${approval.id}`, {
          method: "POST",
          body: JSON.stringify({
            action,
            version: approval.version,
            reason,
            ...(action === "modify" ? { plan } : {}),
          }),
        }),
      );
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="approval-card">
      <div className="section-heading small">
        <h3>
          <ShieldCheck size={18} />
          {t("{name} needs your decision", { name: st(approval.name) })}
        </h3>
        <span>{t("Round {round}", { round: approval.round_number })}</span>
      </div>
      <p>{approval.proposal.plan.summary}</p>
      <p className="muted">
        {t("Planned spend ¥{spend} · cash on hand ¥{cash}", {
          spend: money(approval.proposal.spend),
          cash: money(approval.proposal.cash),
        })}
      </p>
      <details>
        <summary>{t("Edit this round's plan")}</summary>
        <div className="approval-edit">
          {plan.products.map((action, index) => (
            <div key={action.product_id}>
              <strong>
                {t(PRODUCTS[action.product_id])}
              </strong>
              <label>
                {t("Price (¥)")}
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.01"
                  aria-label={t("{product} approval price", {
                    product: action.product_id,
                  })}
                  value={action.price / 100}
                  onChange={(event) =>
                    setPlan({
                      ...plan,
                      products: plan.products.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              price: Math.round(+event.target.value * 100),
                            }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <label>
                {t("Restock")}
                <input
                  type="number"
                  min="0"
                  max="250"
                  aria-label={t("{product} approval restock", {
                    product: action.product_id,
                  })}
                  value={action.purchase_quantity}
                  onChange={(event) =>
                    setPlan({
                      ...plan,
                      products: plan.products.map((item, i) =>
                        i === index
                          ? { ...item, purchase_quantity: +event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
            </div>
          ))}
          <label>
            {t("Marketing budget (¥)")}
            <input
              type="number"
              min="0"
              max="300"
              step="1"
              value={plan.marketing_budget / 100}
              onChange={(event) =>
                setPlan({
                  ...plan,
                  marketing_budget: Math.round(+event.target.value * 100),
                })
              }
            />
          </label>
        </div>
      </details>
      <label className="field">
        {t("Reviewer note")}
        <input
          value={reason}
          maxLength={400}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("When rejecting, say what should change")}
        />
      </label>
      <div className="heading-actions">
        <Button busy={busy} onClick={() => send("approve")}>
          {t("Approve and continue")}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => send("modify")}
        >
          {t("Apply edits and continue")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => send("reject")}>
          {t("Reject and replan")}
        </Button>
      </div>
    </article>
  );
}
export function ApprovalPanel({
  arena,
  onUpdate,
}: {
  arena: Arena;
  onUpdate: (arena: Arena) => void;
}) {
  return (
    <div className="approval-list">
      {arena.approvals?.map((item) => (
        <ApprovalCard
          key={`${item.id}-${item.version}`}
          approval={item}
          arenaId={arena.id}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
