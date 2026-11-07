import { useState } from "react";
import { signedMoney } from "../../api";
import { COLORS } from "../../components/Charts";
import type { Experiment } from "../../types";
import { st, t } from "../../i18n";

export function ExperimentVisual({ experiment }: { experiment: Experiment }) {
  const [metric, setMetric] = useState<"tokens" | "latency">("tokens");
  const scores = experiment.scores.filter((score) => score.samples > 0);
  if (!scores.length)
    return (
      <div className="experiment-visual-empty">
        {t("Profit and model cost appear after the first match settles.")}
      </div>
    );
  const costs = scores.map((score) =>
    metric === "tokens"
      ? (score.total_tokens ?? 0) / (score.samples * experiment.config.rounds)
      : (score.average_duration_ms ?? 0) / 1000,
  );
  const maxCost = Math.max(1, ...costs);
  const hasCost = costs.some((cost) => cost > 0);
  const low = Math.min(0, ...scores.map((score) => score.average_profit));
  const high = Math.max(100, ...scores.map((score) => score.average_profit));
  const x = (value: number) => 72 + (value / maxCost) * 440;
  const y = (value: number) => 205 - ((value - low) / (high - low)) * 165;
  return (
    <div className="experiment-visual">
      <div className="visual-heading">
        <div>
          <h3>{t("Is the profit worth the cost?")}</h3>
          <p>
            {hasCost
              ? t("Further up and left means higher average profit at lower cost per round.")
              : t("Rule strategies use no model tokens, so compare profit first.")}
          </p>
        </div>
        <div className="segmented">
          <button
            className={metric === "tokens" ? "active" : ""}
            onClick={() => setMetric("tokens")}
          >
            Token
          </button>
          <button
            className={metric === "latency" ? "active" : ""}
            onClick={() => setMetric("latency")}
          >
            {t("Latency")}
          </button>
        </div>
      </div>
      {hasCost ? (
        <svg
          viewBox="0 0 580 255"
          role="img"
          aria-label={
            metric === "tokens"
              ? t("Average profit vs. tokens per round")
              : t("Average profit vs. latency per round")
          }
        >
          {[0, 0.5, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1="72"
                x2="530"
                y1={y(low + (high - low) * ratio)}
                y2={y(low + (high - low) * ratio)}
                stroke="#e6ece6"
                strokeDasharray="4 4"
              />
              <text
                x="64"
                y={y(low + (high - low) * ratio) + 4}
                textAnchor="end"
                className="chart-label"
              >
                {signedMoney(Math.round(low + (high - low) * ratio))}
              </text>
              <text
                x={x(maxCost * ratio)}
                y="228"
                textAnchor="middle"
                className="chart-label"
              >
                {Math.round(maxCost * ratio).toLocaleString()}
              </text>
            </g>
          ))}
          <text x="295" y="249" textAnchor="middle" className="chart-label">
            {metric === "tokens"
              ? t("Average tokens per store-round")
              : t("Average seconds per store-round")}
          </text>
          {scores.map((score, index) => (
            <g key={score.strategy_id}>
              <circle
                cx={x(costs[index])}
                cy={y(score.average_profit)}
                r="8"
                fill={COLORS[score.color]}
                stroke="white"
                strokeWidth="3"
              >
                <title>
                  {st(score.name)}: {signedMoney(score.average_profit)},{" "}
                  {costs[index].toFixed(1)}{" "}
                  {metric === "tokens" ? "tokens" : t("s")}
                </title>
              </circle>
              <text
                x={x(costs[index])}
                y={y(score.average_profit) - 13 - index * 12}
                textAnchor="middle"
                fill={COLORS[score.color]}
                fontSize="11"
              >
                {index + 1}
              </text>
            </g>
          ))}
        </svg>
      ) : (
        <div className="profit-comparison-bars">
          {scores.map((score) => (
            <div key={score.strategy_id}>
              <span>{st(score.name)}</span>
              <div>
                <i
                  style={{
                    width: `${(Math.abs(score.average_profit) / Math.max(...scores.map((item) => Math.abs(item.average_profit)), 1)) * 100}%`,
                    background: COLORS[score.color],
                  }}
                />
              </div>
              <strong>{signedMoney(score.average_profit)}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="experiment-visual-cards">
        {scores.map((score, index) => (
          <article
            key={score.strategy_id}
            style={{ borderTopColor: COLORS[score.color] }}
          >
            <strong>
              {index + 1}. {st(score.name)}
            </strong>
            <b>{signedMoney(score.average_profit)}</b>
            <small>
              {t("Average net profit · {count} matches", { count: score.samples })}
            </small>
            <div>
              <span>
                {t("Win rate")} <b>{score.win_rate}%</b>
              </span>
              <span>
                {t("Stock-outs")} <b>{score.stockout_rate}%</b>
              </span>
            </div>
            <p>
              {score.confidence_interval
                ? t("95% CI of the mean: {low} to {high}", {
                    low: signedMoney(score.confidence_interval[0]),
                    high: signedMoney(score.confidence_interval[1]),
                  })
                : t("Not enough samples for a confidence interval yet")}
            </p>
          </article>
        ))}
      </div>
      <p className="experiment-visual-note">
        {t(
          "Profit comes from simulated settlement and is shown separately from cost. Judge whether a capability helps from paired intervals and independent validation.",
        )}
      </p>
    </div>
  );
}
