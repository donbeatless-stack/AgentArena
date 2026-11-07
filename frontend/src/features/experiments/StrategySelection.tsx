import { useState } from "react";
import { api } from "../../api";
import { Button, useToast } from "../../components/ui";
import type { Experiment } from "../../types";
import { t } from "../../i18n";

export function StrategySelection({
  experiment,
  onCreated,
}: {
  experiment: Experiment;
  onCreated: (id: number) => void;
}) {
  const [seeds, setSeeds] = useState("101, 211, 307");
  const [budget, setBudget] = useState(180);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (
    experiment.config.split !== "development" ||
    experiment.status !== "completed"
  )
    return null;
  return (
    <section className="panel branch-panel">
      <h3>{t("Select a strategy and validate it independently")}</h3>
      <p>
        {t(
          "Among variants with no bankruptcies, pick the one with the highest average development profit, then compare it with the baseline on unused seeds. A development ranking is not a validation result.",
        )}
      </p>
      <div className="form-grid">
        <label className="field">
          {t("Validation seeds")}
          <input
            aria-label={t("Validation seeds")}
            value={seeds}
            onChange={(event) => setSeeds(event.target.value)}
          />
        </label>
        <label className="field">
          {t("Validation budget (store-rounds)")}
          <input
            aria-label={t("Validation budget")}
            type="number"
            min="6"
            max="600"
            value={budget}
            onChange={(event) => setBudget(+event.target.value)}
          />
        </label>
      </div>
      <Button
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await api<Experiment>(
              `/experiments/${experiment.id}/select`,
              {
                method: "POST",
                body: JSON.stringify({
                  seeds: seeds
                    .split(/[,，\s]+/)
                    .filter(Boolean)
                    .map(Number),
                  round_budget: budget,
                }),
              },
            );
            onCreated(result.id);
          } catch (error) {
            toast((error as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("Select and run validation")}
      </Button>
    </section>
  );
}
