import type { AgentOptions, Mode } from "../../types";
import { t } from "../../i18n";

export function AgentOptionsFields({
  value,
  onChange,
  label,
  mode,
}: {
  value?: AgentOptions;
  onChange: (value: AgentOptions) => void;
  label: string;
  mode: Mode;
}) {
  const options = value || {
    memory: "recent",
    negotiation: false,
    tool_budget: 6,
  };
  return (
    <div className={`agent-options-grid ${mode === "rule" ? "rule-options" : ""}`}>
      <label className="field">
        {t("Memory")}
        <select
          aria-label={t("{label} memory", { label })}
          value={options.memory}
          onChange={(event) =>
            onChange({
              ...options,
              memory: event.target.value as AgentOptions["memory"],
            })
          }
        >
          <option value="none">{t("No memory")}</option>
          <option value="recent">{t("Last five rounds")}</option>
          <option value="episodic">{t("Retrieve past experience")}</option>
        </select>
      </label>
      <label className="field">
        {mode === "llm" ? t("Supplier negotiation") : t("Rule-based bargaining")}
        <select
          aria-label={t("{label} negotiation", { label })}
          value={options.negotiation ? "on" : "off"}
          onChange={(event) =>
            onChange({ ...options, negotiation: event.target.value === "on" })
          }
        >
          <option value="off">{t("Off")}</option>
          <option value="on">{t("On")}</option>
        </select>
      </label>
      {mode === "llm" && <label className="field">
        {t("Tool call budget")}
        <input
          aria-label={t("{label} tool budget", { label })}
          type="number"
          min="1"
          max="10"
          value={options.tool_budget}
          onChange={(event) =>
            onChange({ ...options, tool_budget: +event.target.value })
          }
        />
      </label>}
    </div>
  );
}
