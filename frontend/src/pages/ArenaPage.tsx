import {
  ArrowLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CloudRain,
  Download,
  Flag,
  Layers3,
  ListOrdered,
  Package,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShoppingBag,
  SkipForward,
  TrendingUp,
  Trophy,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, money, signedMoney, useResource } from "../api";
import { st, t } from "../i18n";
import { ProfitChart } from "../components/Charts";
import { ExecutionPanel } from "../components/ExecutionPanel";
import {
  Avatar,
  Button,
  ErrorState,
  Loading,
  Metric,
  StatusBadge,
  useToast,
} from "../components/ui";
import type { Arena } from "../types";

import { StoreCard } from "../features/arena/StoreCard";
import { ApprovalPanel } from "../features/decisions/ApprovalPanel";
import { BranchPanel } from "../features/decisions/BranchPanel";
import { DecisionPanel } from "../features/decisions/DecisionPanel";
import { DecisionStage } from "../features/decisions/DecisionStage";
import { ArenaTheatre } from "../features/arena/ArenaTheatre";
import { useDecisionEvents } from "../features/decisions/useDecisionEvents";
import { LedgerPanel } from "../features/ledger/LedgerPanel";

export function ArenaPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate(),
    toast = useToast();
  const {
    data: latest,
    setData,
    error,
    reload,
  } = useResource<Arena>(`/arenas/${id}`);
  const execution = useDecisionEvents(Number(id), setData);
  const [replayRound, setReplayRound] = useState<number | null>(null);
  const [replay, setReplay] = useState<Arena | null>(null);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState("theatre");
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    setReplayRound(null);
    setReplay(null);
    setTab(searchParams.get("view") === "live" ? "live" : "theatre");
  }, [id]);
  useEffect(() => {
    if (replayRound === null) {
      setReplay(null);
      return;
    }
    const controller = new AbortController();
    api<Arena>(`/arenas/${id}?round=${replayRound}`, {
      signal: controller.signal,
    })
      .then(setReplay)
      .catch((cause: Error) => {
        if (cause.name !== "AbortError") toast(cause.message, true);
      });
    return () => controller.abort();
  }, [id, replayRound]);
  useEffect(() => {
    if (!playing || !latest) return;
    const timer = setInterval(
      () =>
        setReplayRound((current) => {
          const next = (current ?? 0) + 1;
          if (next >= latest.current_round) {
            setPlaying(false);
            return null;
          }
          return next;
        }),
      1000 / speed,
    );
    return () => clearInterval(timer);
  }, [playing, latest?.current_round, speed]);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!latest) return <Loading />;
  const arena = replayRound !== null && replay ? replay : latest;
  const { snapshot } = arena;
  const merchants = [...snapshot.merchants].sort((a, b) => b.equity - a.equity);
  const live = latest.status === "running" || latest.status === "stepping";
  const finished = latest.status === "completed";
  const execute = async (command: string, body?: unknown) => {
    setBusy(true);
    if (command === "run" || command === "step") setTab("theatre");
    try {
      const result = await api<Arena>(`/arenas/${id}/${command}`, {
        method: "POST",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (command === "fork") navigate(`/arenas/${result.id}`);
      else setData(result);
    } catch (cause) {
      toast((cause as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="arena-breadcrumb">
        <Link to="/">
          <ArrowLeft size={15} />
          {t("Arena")}
        </Link>
        <ChevronRight size={13} />
        <span>{t("Match {id}", { id: String(arena.id).padStart(3, "0") })}</span>
      </div>
      <div className="page-heading arena-page-heading">
        <div>
          <h1>{st(arena.name)}</h1>
          <div className="arena-subtitle">
            <StatusBadge status={latest.status} />
            <span>{st(snapshot.market.scenario_name)}</span>
            <span>{t("Seed {seed}", { seed: arena.seed })}</span>
            <span>{t("{count} stores", { count: snapshot.merchants.length })}</span>
          </div>
        </div>
        <div className="heading-actions">
          <details className="export-menu">
            <summary className="button button-secondary">
              <Download size={16} />
              {t("Export")}
            </summary>
            <div>
              <a href={`/api/arenas/${id}/export?format=json`} download>
                {t("Full match · JSON")}
              </a>
              <a href={`/api/arenas/${id}/export?format=csv`} download>
                {t("Ledger · CSV")}
              </a>
            </div>
          </details>
          <Button
            variant="secondary"
            onClick={() => execute("fork")}
            busy={busy}
          >
            <RotateCcw size={15} />
            {t("Rematch")}
          </Button>
        </div>
      </div>
      <div className="arena-control-bar">
        <div className="round-display">
          <span>ROUND</span>
          <strong>{String(snapshot.round).padStart(2, "0")}</strong>
          <small>/ {arena.total_rounds}</small>
          <div className="round-progress">
            <span
              style={{
                width: `${(snapshot.round / arena.total_rounds) * 100}%`,
              }}
            />
          </div>
        </div>
        <div className="arena-controls">
          {replayRound !== null && (
            <button
              className="text-button"
              onClick={() => {
                setReplayRound(null);
                setPlaying(false);
              }}
            >
              <Radio size={14} />
              {t("Back to current")}
            </button>
          )}
          <select
            aria-label={t("Match speed")}
            value={speed}
            onChange={(event) => setSpeed(+event.target.value)}
            disabled={live}
          >
            <option value={1}>{t("{speed}× speed", { speed: 1 })}</option>
            <option value={2}>{t("{speed}× speed", { speed: 2 })}</option>
            <option value={4}>{t("{speed}× speed", { speed: 4 })}</option>
          </select>
          <Button
            variant="secondary"
            disabled={
              live ||
              finished ||
              latest.status === "awaiting_approval" ||
              replayRound !== null
            }
            busy={busy}
            onClick={() =>
              execute("step", { expected_round: latest.current_round })
            }
          >
            <SkipForward size={16} />
            {t("Step")}
          </Button>
          {finished ? (
            <span className="finished-label">
              <Flag size={16} />
              {t("Match finished")}
            </span>
          ) : (
            <Button
              disabled={
                busy ||
                latest.status === "stepping" ||
                latest.status === "awaiting_approval" ||
                replayRound !== null
              }
              onClick={() =>
                execute(
                  live ? "pause" : "run",
                  live ? undefined : { interval: 1 / speed },
                )
              }
            >
              {live ? (
                <>
                  <Pause size={16} />
                  {t("Pause match")}
                </>
              ) : (
                <>
                  <Play size={16} fill="currentColor" />
                  {latest.current_round ? t("Resume match") : t("Start match")}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      {latest.error && (
        <div className="arena-error" role="alert">
          <span>{st(latest.error)}</span>
          <Link to="/settings">
            {t("Settings")}
            <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      <ApprovalPanel arena={latest} onUpdate={setData} />
      {tab !== "theatre" && (
        <>
          <div className={`market-event event-${snapshot.market.event.type}`}>
            <div className="event-icon">
              {snapshot.market.event.type === "rain" ? (
                <CloudRain size={20} />
              ) : (
                <Zap size={20} />
              )}
            </div>
            <div>
              <strong>
                {snapshot.round === 0
                  ? t("Market opening soon")
                  : st(snapshot.market.event.name)}
              </strong>
              <span>{st(snapshot.market.event.impact)}</span>
            </div>
            <span className="market-signal">
              <i />
              {replayRound !== null
                ? t("Historical market")
                : live
                  ? "LIVE MARKET"
                  : "MARKET SNAPSHOT"}
            </span>
          </div>
          <div className="metric-grid arena-metrics">
            <Metric
              label={t("Market revenue this round")}
              value={
                <>
                  <span className="currency">¥</span>
                  {money(snapshot.totals.revenue)}
                </>
              }
              icon={<ShoppingBag size={17} />}
            />
            <Metric
              label={t("Units sold this round")}
              value={
                <>
                  {snapshot.totals.sold}
                  <span className="metric-unit">{t("units")}</span>
                </>
              }
              icon={<Package size={17} />}
            />
            <Metric
              label={t("Demand fill rate")}
              value={
                <>
                  {snapshot.totals.demand
                    ? (
                        (snapshot.totals.sold / snapshot.totals.demand) *
                        100
                      ).toFixed(1)
                    : "0"}
                  <span className="metric-unit">%</span>
                </>
              }
              icon={<Users size={17} />}
            />
            <Metric
              label={t("Round leader")}
              value={<span className="leader-metric">{st(merchants[0].name)}</span>}
              icon={<Trophy size={17} />}
            />
          </div>
        </>
      )}
      <div className="arena-tabs" role="tablist" aria-label={t("Arena views")}>
        {[
          ["theatre", "Market panorama", ShoppingBag],
          ["overview", "Business data", BarChartIcon],
          ["live", "Decision live", Radio],
          ["decisions", "Decision trace", Workflow],
          ["ledger", "Ledger", ListOrdered],
          ["execution", "Execution log", Radio],
          ["branch", "Fork comparison", Layers3],
        ].map(([key, label, Icon]) => {
          const TabIcon = Icon as typeof Workflow;
          return (
            <button
              role="tab"
              aria-selected={tab === key}
              key={key as string}
              onClick={() => setTab(key as string)}
            >
              <TabIcon size={16} />
              {t(label as string)}
              {key === "decisions" && arena.decisions.length > 0 && (
                <span>{arena.decisions.length}</span>
              )}
            </button>
          );
        })}
      </div>
      {tab === "theatre" &&
        (replayRound !== null && replay?.snapshot.round !== replayRound ? (
          <Loading />
        ) : (
          <ArenaTheatre
            key={arena.id}
            arena={arena}
            events={execution.events.filter(
              (event) => event.arena_id === arena.id,
            )}
            round={replayRound}
            connected={execution.connected}
            error={execution.error}
            onRound={(value) => {
              setPlaying(false);
              setReplayRound(value);
            }}
          />
        ))}
      {tab === "overview" && (
        <>
          <div className="arena-overview-grid">
            <section className="panel profit-panel">
              <div className="panel-heading">
                <div>
                  <h2>{t("Net profit trend")}</h2>
                  <span>{t("Cumulative profit · ¥")}</span>
                </div>
                <span className="subtle-chip">
                  {t("{count} rounds played", { count: snapshot.round })}
                </span>
              </div>
              <ProfitChart
                history={arena.history}
                merchants={snapshot.merchants}
                selectedRound={snapshot.round}
                tall
              />
            </section>
            <section className="panel standings-panel">
              <div className="panel-heading">
                <h2>{t("Live standings")}</h2>
                <Trophy size={17} />
              </div>
              <div className="standings-list">
                {merchants.map((merchant, index) => (
                  <div key={merchant.id}>
                    <span className={`rank-number rank-${index}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Avatar name={st(merchant.name)} color={merchant.color} small />
                    <span className="standings-name">
                      {st(merchant.name)}
                      <small>{st(merchant.strategy_name)}</small>
                    </span>
                    <span className="standings-result">
                      <b
                        className={
                          merchant.profit >= 0 ? "positive" : "negative"
                        }
                      >
                        {signedMoney(merchant.profit)}
                      </b>
                      <small>
                        {merchant.roi >= 0 ? "+" : ""}
                        {merchant.roi}%
                      </small>
                    </span>
                  </div>
                ))}
              </div>
              <div className="standings-footer">
                <CircleDollarSign size={15} />
                {t("Starting assets ¥{amount} / store", {
                  amount: money(arena.initial_capital),
                })}
              </div>
            </section>
          </div>
          <div className="section-heading">
            <h2>{t("Store operations")}</h2>
            <span className="muted">
              ROUND {String(snapshot.round).padStart(2, "0")}
            </span>
          </div>
          <div className={`store-grid stores-${snapshot.merchants.length}`}>
            {snapshot.merchants.map((merchant) => (
              <StoreCard key={merchant.id} merchant={merchant} arena={arena} />
            ))}
          </div>
          <section className="panel supply-panel">
            <div className="panel-heading">
              <h2>{t("Wholesale market")}</h2>
              <span>{t("Supply and demand forecast this round")}</span>
            </div>
            <div className="supply-grid">
              {snapshot.market.products.map((product) => (
                <div key={product.id}>
                  <span className={`supply-product product-${product.id}`}>
                    <Package size={20} />
                  </span>
                  <div>
                    <strong>{st(product.name)}</strong>
                    <span>{t("Unit cost ¥{price}", { price: money(product.cost) })}</span>
                  </div>
                  <span>
                    {t("Supply")}
                    <b>
                      {product.supply}
                      <small> {st(product.unit)}</small>
                    </b>
                  </span>
                  <span>
                    {t("Demand")}
                    <b>
                      {product.demand}
                      <small> {st(product.unit)}</small>
                    </b>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {tab === "decisions" && (
        <section className="panel">
          <DecisionPanel decisions={arena.decisions} />
        </section>
      )}
      {tab === "live" && (
        <DecisionStage arena={latest} round={replayRound} {...execution} />
      )}
      {tab === "branch" && <BranchPanel arena={latest} round={replayRound} />}
      {tab === "execution" && <ExecutionPanel arenaId={arena.id} />}
      {tab === "ledger" && (
        <section className="panel">
          <LedgerPanel
            arenaId={arena.id}
            round={replayRound}
            merchants={snapshot.merchants}
          />
        </section>
      )}
      {latest.current_round > 0 && (
        <div className="replay-bar">
          <span className="replay-label">
            <RotateCcw size={15} />
            {t("Round replay")}
          </span>
          <button
            className="icon-button"
            aria-label={t("Previous round")}
            disabled={snapshot.round === 0}
            onClick={() => {
              setPlaying(false);
              setReplayRound(Math.max(0, snapshot.round - 1));
            }}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="replay-play"
            aria-label={playing ? t("Pause replay") : t("Play replay")}
            disabled={latest.current_round === 0}
            onClick={() => {
              if (!playing && replayRound === null) setReplayRound(0);
              setPlaying(!playing);
            }}
          >
            {playing ? (
              <Pause size={16} />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
          </button>
          <input
            aria-label={t("Replay round")}
            type="range"
            min={0}
            max={latest.current_round}
            value={replayRound ?? latest.current_round}
            disabled={latest.current_round === 0}
            onChange={(event) => {
              setPlaying(false);
              setReplayRound(+event.target.value);
            }}
          />
          <span className="replay-round">
            R{String(snapshot.round).padStart(2, "0")}
          </span>
          <button
            className="icon-button"
            aria-label={t("Next round")}
            disabled={snapshot.round >= latest.current_round}
            onClick={() => {
              setPlaying(false);
              setReplayRound(
                Math.min(latest.current_round, snapshot.round + 1),
              );
            }}
          >
            <ChevronRight size={17} />
          </button>
          <button
            className={`replay-current ${replayRound === null ? "is-current" : ""}`}
            onClick={() => {
              setReplayRound(null);
              setPlaying(false);
            }}
          >
            <i />
            {t("Current")}
          </button>
        </div>
      )}
    </>
  );
}

function BarChartIcon({ size = 16 }: { size?: number }) {
  return <TrendingUp size={size} />;
}
