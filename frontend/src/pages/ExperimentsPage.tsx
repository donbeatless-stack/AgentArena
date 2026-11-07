import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Beaker,
  Download,
  FlaskConical,
  Play,
  Plus,
  Trophy,
  Trash2,
} from "lucide-react";
import { api, date, money, signedMoney, useResource } from "../api";
import { AgentOptionsFields } from "../features/decisions/AgentOptionsFields";
import { ExperimentVisual } from "../features/experiments/ExperimentVisual";
import { StrategySelection } from "../features/experiments/StrategySelection";
import type {
  Catalog,
  Experiment,
  ExperimentVariant,
  Mode,
  ModelProfile,
  Strategy,
} from "../types";
import {
  Avatar,
  Button,
  Empty,
  ErrorState,
  Loading,
  Modal,
  StatusBadge,
  useToast,
} from "../components/ui";
import { locale, st, t } from "../i18n";

export function ExperimentsPage({ catalog }: { catalog: Catalog }) {
  const { data, error, reload } = useResource<Experiment[]>("/experiments");
  const strategies = useResource<Strategy[]>("/strategies");
  const profiles = useResource<ModelProfile[]>("/model-profiles");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState(() => t("Strategy comparison experiment"));
  const [scenario, setScenario] = useState("neighborhood");
  const [rounds, setRounds] = useState(12);
  const [seeds, setSeeds] = useState("11, 23, 37");
  const [strategyIds, setStrategyIds] = useState([
    "balanced",
    "discount",
    "premium",
  ]);
  const [mode, setMode] = useState<Mode>("rule");
  const [comparison, setComparison] = useState(false);
  const [split, setSplit] = useState("holdout");
  const [variants, setVariants] = useState<ExperimentVariant[]>([
    {
      name: t("Standard decision"),
      strategy_id: "balanced",
      mode: "rule",
      workflow: "direct",
      model_profile_id: "default",
    },
    {
      name: t("Projection and review"),
      strategy_id: "balanced",
      mode: "rule",
      workflow: "reviewed",
      model_profile_id: "default",
    },
  ]);
  const updateVariant = (index: number, values: Partial<ExperimentVariant>) =>
    setVariants((items) =>
      items.map((item, position) =>
        position === index ? { ...item, ...values } : item,
      ),
    );
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (!data?.some((item) => item.status === "running")) return;
    const timer = setInterval(reload, 1800);
    return () => clearInterval(timer);
  }, [data, reload]);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data || !strategies.data) return <Loading />;
  const availableStrategies = strategies.data;
  const active = data.find((item) => item.id === selected) || data[0];
  const start = async (id: number) => {
    setBusy(true);
    try {
      await api(`/experiments/${id}/run`, { method: "POST" });
      reload();
    } catch (cause) {
      toast((cause as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const open = () => {
    setName(t("Strategy comparison experiment"));
    setStrategyIds(["balanced", "discount", "premium"]);
    setCreating(true);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE RESEARCH LAB</div>
          <h1>
            {t("Strategy lab")}
            <span className="title-dot" />
          </h1>
        </div>
        <Button onClick={open}>
          <Plus size={17} />
          {t("New experiment")}
        </Button>
      </div>
      {data.length === 0 ? (
        <div className="experiment-empty">
          <div className="experiment-empty-art">
            <FlaskConical size={75} strokeWidth={1} />
            <span className="experiment-bubble bubble-one" />
            <span className="experiment-bubble bubble-two" />
          </div>
          <span className="eyebrow">OBSERVE. COMPARE. EVOLVE.</span>
          <h2>{t("Let results speak for strategies.")}</h2>
          <p>{t("Multiple seeds, rotating seats, head-to-head comparison.")}</p>
          <Button onClick={open}>
            <Beaker size={17} />
            {t("Create your first experiment")}
          </Button>
        </div>
      ) : (
        <div className="experiment-layout">
          <aside className="experiment-list">
            {data.map((item) => (
              <button
                key={item.id}
                className={active.id === item.id ? "selected" : ""}
                onClick={() => setSelected(item.id)}
              >
                <FlaskConical size={18} />
                <span>
                  <strong>{st(item.name)}</strong>
                  <small>
                    {date(item.created_at)} ·{" "}
                    {t("{done}/{total} matches done", {
                      done: item.completed,
                      total: item.arenas.length,
                    })}
                  </small>
                </span>
                <i className={`experiment-state ${item.status}`} />
              </button>
            ))}
          </aside>
          <div className="experiment-main">
            <section className="panel experiment-overview">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">
                    EXPERIMENT {String(active.id).padStart(3, "0")}
                  </span>
                  <h2>{st(active.name)}</h2>
                </div>
                <div className="heading-actions">
                  <a
                    href={`/api/experiments/${active.id}/export`}
                    download
                    className="button button-secondary"
                  >
                    <Download size={15} />
                    {t("Export")}
                  </a>
                  {active.status !== "completed" && (
                    <Button
                      busy={busy}
                      disabled={active.status === "running"}
                      onClick={() => start(active.id)}
                    >
                      <Play size={15} fill="currentColor" />
                      {active.status === "running"
                        ? t("Experiment running")
                        : t("Run experiment")}
                    </Button>
                  )}
                </div>
              </div>
              <div className="experiment-facts">
                <span>
                  {t("Market")}
                  <strong>
                    {st(
                      catalog.scenarios.find(
                        (item) => item.id === active.config.scenario,
                      )?.name,
                    )}
                  </strong>
                </span>
                <span>
                  {t("Rounds per match")}
                  <strong>{active.config.rounds}</strong>
                </span>
                <span>
                  {t("Market seeds")}
                  <strong>{active.config.seeds.join(" / ")}</strong>
                </span>
                <span>
                  {t("Decision engine")}
                  <strong>
                    {active.config.variants?.length
                      ? t("Separate variants")
                      : active.config.mode === "llm"
                        ? "LLM Agent"
                        : t("Rule engine")}
                  </strong>
                </span>
                <span>
                  {t("Data split")}
                  <strong>
                    {active.config.split === "development"
                      ? t("Development")
                      : t("Holdout validation")}
                  </strong>
                </span>
              </div>
              <div className="experiment-progress">
                <span
                  style={{
                    width: `${(active.arenas.reduce((sum, arena) => sum + arena.current_round, 0) / (active.config.rounds * active.arenas.length)) * 100}%`,
                  }}
                />
              </div>
            </section>
            <StrategySelection
              experiment={active}
              onCreated={(id) => {
                setSelected(id);
                reload();
              }}
            />
            <section className="panel experiment-scores">
              <div className="panel-heading">
                <h2>{t("Strategy performance")}</h2>
                <span>{t("{count} matches settled", { count: active.completed })}</span>
              </div>
              <ExperimentVisual experiment={active} />
              <details className="experiment-metrics-detail">
                <summary>{t("All metrics and statistics")}</summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("Strategy")}</th>
                        <th className="text-right">{t("Avg. net profit")}</th>
                        <th className="text-right">{t("Profit std. dev.")}</th>
                        <th className="text-right">{t("Win rate")}</th>
                        <th className="text-right">{t("Samples")}</th>
                        <th className="text-right">{t("95% CI of mean")}</th>
                        <th className="text-right">Token</th>
                        <th className="text-right">{t("Est. model cost")}</th>
                        <th className="text-right">{t("Time per round")}</th>
                        <th className="text-right">{t("Avg. max drawdown")}</th>
                        <th className="text-right">{t("Stock-out rate")}</th>
                        <th className="text-right">{t("Inventory turnover")}</th>
                        <th className="text-right">{t("Tool calls")}</th>
                        <th className="text-right">{t("Experiences used")}</th>
                        <th className="text-right">{t("Forecast MAE")}</th>
                        <th className="text-right">{t("Negotiation savings")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.scores.map((score, index) => (
                        <tr key={score.strategy_id}>
                          <td>
                            <span className="score-strategy">
                              <Avatar
                                name={st(score.name)}
                                color={score.color}
                                small
                              />
                              {st(score.name)}
                              {index === 0 && score.samples > 0 && (
                                <Trophy size={14} className="gold" />
                              )}
                            </span>
                            {score.model && (
                              <small className="model-tag">
                                {score.model} ·{" "}
                                {score.workflow === "adaptive"
                                  ? t("Adaptive planning")
                                  : score.workflow === "reviewed"
                                    ? t("Reviewed")
                                    : t("Standard")}
                              </small>
                            )}
                          </td>
                          <td
                            className={`text-right numeric ${score.average_profit >= 0 ? "positive" : "negative"}`}
                          >
                            {score.samples
                              ? signedMoney(score.average_profit)
                              : "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.samples
                              ? `±¥${money(score.deviation)}`
                              : "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.samples ? `${score.win_rate}%` : "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.samples}
                          </td>
                          <td className="text-right numeric">
                            {score.confidence_interval
                              ? `¥${money(score.confidence_interval[0])} ～ ¥${money(score.confidence_interval[1])}`
                              : "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.total_tokens?.toLocaleString(locale()) ?? "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.estimated_model_cost != null
                              ? `¥${score.estimated_model_cost.toFixed(4)}`
                              : "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.samples
                              ? `${((score.average_duration_ms || 0) / 1000).toFixed(2)} s`
                              : "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.samples ? `${score.average_drawdown}%` : "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.samples ? `${score.stockout_rate}%` : "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.samples
                              ? t("{count}×", { count: score.inventory_turnover ?? 0 })
                              : "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.tool_calls ?? "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.memory_references ?? "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.prediction_mae != null
                              ? `¥${money(score.prediction_mae)}`
                              : "—"}
                          </td>
                          <td className="text-right numeric">
                            {score.negotiation_savings != null
                              ? signedMoney(score.negotiation_savings)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
            {!!active.comparisons?.length && (
              <section className="panel paired-comparisons">
                <div className="panel-heading">
                  <h2>{t("Profit vs. baseline")}</h2>
                  <span>{t("Paired by seed · 95% CI of the difference")}</span>
                </div>
                {active.comparisons.map((item) => (
                  <article key={item.variant}>
                    <div>
                      <strong>{st(item.variant)}</strong>
                      <small>
                        {t("vs. {baseline} · {count} pairs", {
                          baseline: st(item.baseline),
                          count: item.samples,
                        })}
                      </small>
                    </div>
                    <b
                      className={
                        item.average_difference >= 0 ? "positive" : "negative"
                      }
                    >
                      {item.samples
                        ? signedMoney(item.average_difference)
                        : "—"}
                    </b>
                    <span>
                      {item.confidence_interval
                        ? `¥${money(item.confidence_interval[0])} ～ ¥${money(item.confidence_interval[1])}`
                        : "—"}
                    </span>
                  </article>
                ))}
              </section>
            )}
            <section className="panel">
              <div className="panel-heading">
                <h2>{t("Experiment matches")}</h2>
                <span>{t("{count} matches", { count: active.arenas.length })}</span>
              </div>
              <div className="experiment-matches">
                {active.arenas.map((arena) => (
                  <Link key={arena.id} to={`/arenas/${arena.id}`}>
                    <span className="round-tag">S{arena.seed}</span>
                    <div>
                      <strong>{st(arena.name)}</strong>
                      <small>
                        {t("Round {current}/{total}", {
                          current: arena.current_round,
                          total: arena.total_rounds,
                        })}
                      </small>
                    </div>
                    <StatusBadge status={arena.status} />
                    <span className="experiment-match-profit">
                      {arena.current_round
                        ? t("{name} leads", { name: st(arena.leader) })
                        : "—"}
                    </span>
                    <ArrowRight size={16} />
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
      <Modal
        title={t("New strategy experiment")}
        open={creating}
        onClose={() => setCreating(false)}
        wide
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              const experiment = await api<Experiment>("/experiments", {
                method: "POST",
                body: JSON.stringify({
                  name,
                  scenario,
                  rounds,
                  seeds: seeds
                    .split(/[,，\s]+/)
                    .filter(Boolean)
                    .map(Number),
                  strategy_ids: strategyIds,
                  mode,
                  split,
                  ...(comparison ? { variants, strategy_ids: [] } : {}),
                }),
              });
              await api(`/experiments/${experiment.id}/run`, {
                method: "POST",
              });
              setSelected(experiment.id);
              setCreating(false);
              reload();
            } catch (cause) {
              toast((cause as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="modal-body">
            <div className="experiment-kind">
              <button
                type="button"
                className={!comparison ? "selected" : ""}
                onClick={() => setComparison(false)}
              >
                {t("Strategy comparison")}
              </button>
              <button
                type="button"
                className={comparison ? "selected" : ""}
                onClick={() => setComparison(true)}
              >
                {t("Model and workflow comparison")}
              </button>
            </div>
            <label className="field">
              {t("Experiment name")}
              <input
                value={name}
                required
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="form-grid three">
              <label className="field">
                {t("Experiment market")}
                <select
                  value={scenario}
                  onChange={(event) => setScenario(event.target.value)}
                >
                  {catalog.scenarios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {st(item.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t("Rounds per match")}
                <input
                  type="number"
                  min={3}
                  max={30}
                  required
                  value={rounds}
                  onChange={(event) => setRounds(+event.target.value)}
                />
              </label>
              <label className="field">
                {t("Decision engine")}
                <select
                  value={mode}
                  disabled={comparison}
                  onChange={(event) => setMode(event.target.value as Mode)}
                >
                  <option value="rule">{t("Rule engine")}</option>
                  <option value="llm">LLM Agent</option>
                </select>
              </label>
            </div>
            <label className="field">
              {t("Market seeds")}
              <input
                value={seeds}
                required
                onChange={(event) => setSeeds(event.target.value)}
                placeholder="11, 23, 37"
              />
            </label>
            <label className="field">
              {t("Data split")}
              <select
                value={split}
                onChange={(event) => setSplit(event.target.value)}
              >
                <option value="holdout">{t("Holdout validation")}</option>
                <option value="development">{t("Development")}</option>
              </select>
            </label>
            {comparison ? (
              <div className="experiment-variants">
                {variants.map((variant, index) => (
                  <section className="experiment-variant" key={index}>
                    <div className="section-heading small">
                      <h3>
                        {index === 0
                          ? t("Baseline")
                          : t("Variant {number}", { number: index })}
                      </h3>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("Remove variant {number}", { number: index + 1 })}
                        disabled={variants.length <= 2}
                        onClick={() =>
                          setVariants(
                            variants.filter(
                              (_, position) => position !== index,
                            ),
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="form-grid">
                      <label className="field">
                        {t("Variant name")}
                        <input
                          aria-label={t("Variant {number} name", { number: index + 1 })}
                          required
                          maxLength={40}
                          value={variant.name}
                          onChange={(event) =>
                            updateVariant(index, { name: event.target.value })
                          }
                        />
                      </label>
                      <label className="field">
                        {t("Strategy")}
                        <select
                          aria-label={t("Variant {number} strategy", {
                            number: index + 1,
                          })}
                          value={variant.strategy_id}
                          onChange={(event) =>
                            updateVariant(index, {
                              strategy_id: event.target.value,
                            })
                          }
                        >
                          {availableStrategies.map((strategy) => (
                            <option key={strategy.id} value={strategy.id}>
                              {st(strategy.name)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        {t("Decision engine")}
                        <select
                          aria-label={t("Variant {number} engine", {
                            number: index + 1,
                          })}
                          value={variant.mode}
                          onChange={(event) =>
                            updateVariant(index, {
                              mode: event.target.value as Mode,
                            })
                          }
                        >
                          <option value="rule">{t("Rule engine")}</option>
                          <option value="llm">LLM Agent</option>
                        </select>
                      </label>
                      <label className="field">
                        {t("Decision workflow")}
                        <select
                          aria-label={t("Variant {number} workflow", {
                            number: index + 1,
                          })}
                          value={variant.workflow}
                          onChange={(event) =>
                            updateVariant(index, {
                              workflow: event.target
                                .value as ExperimentVariant["workflow"],
                            })
                          }
                        >
                          <option value="direct">
                            {variant.mode === "llm"
                              ? t("Standard decision")
                              : t("Decide by rules")}
                          </option>
                          <option value="reviewed">
                            {variant.mode === "llm"
                              ? t("Projection and review")
                              : t("Rule projection and risk check")}
                          </option>
                          <option value="adaptive">
                            {variant.mode === "llm"
                              ? t("Adaptive planning with dynamic review")
                              : t("Risk-triggered rule projection")}
                          </option>
                        </select>
                      </label>
                      {variant.mode === "llm" && (
                        <label className="field">
                          {t("Model connection")}
                          <select
                            aria-label={t("Variant {number} model", {
                              number: index + 1,
                            })}
                            value={variant.model_profile_id || "default"}
                            onChange={(event) =>
                              updateVariant(index, {
                                model_profile_id: event.target.value,
                              })
                            }
                          >
                            {profiles.data
                              ?.filter((profile) => profile.enabled)
                              .map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {st(profile.name)} · {profile.model}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <AgentOptionsFields
                      label={t("Variant {number} ", { number: index + 1 })}
                      mode={variant.mode}
                      value={variant.agent_options}
                      onChange={(agent_options) =>
                        updateVariant(index, { agent_options })
                      }
                    />
                  </section>
                ))}
                {variants.length < 4 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setVariants([
                        ...variants,
                        {
                          name: t("Variant {number}", { number: variants.length }),
                          strategy_id: "balanced",
                          mode: "rule",
                          workflow: "direct",
                          model_profile_id: "default",
                        },
                      ])
                    }
                  >
                    <Plus size={14} />
                    {t("Add variant")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="field">
                <span>
                  {t("Strategies · {count} selected", { count: strategyIds.length })}
                </span>
                <div className="strategy-checkboxes">
                  {strategies.data.map((strategy) => (
                    <label
                      key={strategy.id}
                      className={
                        strategyIds.includes(strategy.id) ? "selected" : ""
                      }
                    >
                      <input
                        type="checkbox"
                        checked={strategyIds.includes(strategy.id)}
                        onChange={(event) =>
                          setStrategyIds(
                            event.target.checked
                              ? [...strategyIds, strategy.id]
                              : strategyIds.filter((id) => id !== strategy.id),
                          )
                        }
                      />
                      <Avatar
                        name={st(strategy.name)}
                        color={strategy.color}
                        small
                      />
                      <span>{st(strategy.name)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setCreating(false)}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                !comparison &&
                (strategyIds.length < 2 || strategyIds.length > 4)
              }
              busy={busy}
            >
              <Play size={15} />
              {t("Create and run")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
