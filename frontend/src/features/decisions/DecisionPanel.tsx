import {
  ArrowRight,
  Check,
  ChevronRight,
  Layers3,
  Package,
  Sparkles,
  Workflow,
  Ban,
} from "lucide-react";
import { useState } from "react";
import { money } from "../../api";
import { Avatar, Empty } from "../../components/ui";
import type { Decision } from "../../types";
import { st, t } from "../../i18n";
import { WorkflowTracePanel } from "./WorkflowTracePanel";

const PRODUCT_NAMES: Record<string, string> = {
  coffee: "Cold brew coffee",
  oats: "Oat breakfast",
  bar: "Energy bar",
};
const TOOL_NAMES: Record<string, string> = {
  inspect_store: "Inspect store books",
  observe_market: "Observe market and rivals",
  review_history: "Review past performance",
};

export function DecisionPanel({ decisions }: { decisions: Decision[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  if (!decisions.length) return <Empty title={t("Waiting for the first round of decisions")} />;
  const decision =
    decisions.find((item) => item.merchant_id === selected) || decisions[0];
  return (
    <div className="decision-layout">
      <aside className="decision-merchants">
        {decisions.map((item) => (
          <button
            key={item.id}
            className={decision.id === item.id ? "selected" : ""}
            onClick={() => setSelected(item.merchant_id)}
          >
            <Avatar name={st(item.name)} color={item.color} small />
            <span>
              {st(item.name)}
              <small>{item.mode === "llm" ? "LLM Agent" : t("Rule engine")}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </aside>
      <div className="decision-detail">
        <div className="decision-title">
          <div>
            <span className="eyebrow">
              DECISION TRACE / ROUND{" "}
              {decision.round_number.toString().padStart(2, "0")}
            </span>
            <h3>{t("{name}'s decision", { name: st(decision.name) })}</h3>
            {decision.model_config?.model && (
              <span className="model-tag">
                {decision.model_config.model} ·{" "}
                {decision.trace?.workflow === "adaptive"
                  ? t("Adaptive planning")
                  : decision.trace?.workflow === "reviewed"
                    ? t("Projection and review")
                    : t("Standard decision")}
              </span>
            )}
          </div>
          <span className="trace-duration">
            {decision.duration_ms} ms ·{" "}
            {decision.input_tokens + decision.output_tokens} tokens
          </span>
        </div>
        <div className="workflow-line">
          {decision.stages.map((stage, index) => (
            <div key={`${stage.node}-${index}`}>
              <span>
                <Check size={13} />
              </span>
              <b>{st(stage.label)}</b>
              {index < decision.stages.length - 1 && <ArrowRight size={16} />}
            </div>
          ))}
        </div>
        <div className="decision-summary">
          <Sparkles size={18} />
          <p>{decision.plan.summary}</p>
        </div>
        <WorkflowTracePanel trace={decision.trace || {}} />
        <div className="section-heading small">
          <h3>{t("Business plan")}</h3>
          <span>
            {t("Marketing")} <b>¥{money(decision.plan.marketing_budget)}</b>
          </span>
        </div>
        <div className="decision-actions">
          {decision.plan.products.map((product) => (
            <div key={product.product_id}>
              <Package size={18} />
              <strong>{t(PRODUCT_NAMES[product.product_id])}</strong>
              <span>
                {t("Set price")}
                <b>¥{money(product.price)}</b>
              </span>
              <span>
                {t("Planned restock")}
                <b>{t("{count} units", { count: product.purchase_quantity })}</b>
              </span>
            </div>
          ))}
        </div>
        {(decision.mode === "llm" || decision.tools.length > 0) && <>
        <div className="section-heading small">
          <h3>
            {decision.mode === "llm"
              ? t("Model tool calls")
              : t("Rule data reads")}
            <span className="number-chip">{decision.tools.filter((tool) => tool.executed !== false).length}</span>
          </h3>
          <Workflow size={16} />
        </div>
        <div className="tool-list">
          {decision.tools.map((tool, index) => (
            <details key={`${tool.name}-${index}`}>
              <summary>
                <span className="tool-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {tool.executed === false ? <Ban size={14} /> : <Check size={14} />}
                <strong>{TOOL_NAMES[tool.name] ? t(TOOL_NAMES[tool.name]) : tool.name}</strong>
                {tool.executed === false && (
                  <span>{t("Blocked by budget · not run")}</span>
                )}
                <code>{tool.name}()</code>
                <ChevronRight size={15} />
              </summary>
              <pre>
                {typeof tool.result === "string"
                  ? tool.result
                  : JSON.stringify(tool.result, null, 2)}
              </pre>
            </details>
          ))}
        </div>
        </>}
        <div className="agent-memory">
          <span>
            <Layers3 size={15} />
            {t("Agent memory")}
          </span>
          <p>{decision.plan.memory}</p>
        </div>
        <details className="context-data">
          <summary>
            {t("Decision context")}
            <ChevronRight size={14} />
          </summary>
          <pre>{JSON.stringify(decision.observation, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}
