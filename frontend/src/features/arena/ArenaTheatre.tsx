import {
  ChevronRight,
  CloudRain,
  Pause,
  Play,
  Radio,
  Truck,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api, signedMoney } from "../../api";
import { ProfitChart } from "../../components/Charts";
import { Modal } from "../../components/ui";
import type { Arena, DecisionEvent } from "../../types";
import { st, t } from "../../i18n";
import { AnimatedValue } from "../decisions/AnimatedValue";
import { DecisionFlow } from "../decisions/DecisionFlow";
import { DecisionPanel } from "../decisions/DecisionPanel";
import { actionLabel, highlights, storeAtEvent } from "./sceneState";

import { ShopScene } from "./ShopScene";

export function ArenaTheatre({
  arena,
  events,
  round,
  connected,
  error,
  onRound,
}: {
  arena: Arena;
  events: DecisionEvent[];
  round: number | null;
  connected: boolean;
  error: string;
  onRound: (round: number) => void;
}) {
  const currentRound =
    round ?? Math.max(arena.snapshot.round, events.at(-1)?.round_number ?? 0);
  const roundEvents = useMemo(
    () => events.filter((event) => event.round_number === currentRound),
    [events, currentRound],
  );
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [before, setBefore] = useState<Arena | null>(null);
  const [loadError, setLoadError] = useState("");
  const [detail, setDetail] = useState<number | null>(null);
  const [expandedChart, setExpandedChart] = useState(false);
  useEffect(() => {
    setCursor(null);
    setPlaying(false);
    setDetail(null);
    setBefore(null);
    setLoadError("");
    const controller = new AbortController();
    api<Arena>(`/arenas/${arena.id}?round=${Math.max(0, currentRound - 1)}`, {
      signal: controller.signal,
    })
      .then(setBefore)
      .catch((cause: Error) => {
        if (cause.name !== "AbortError") setLoadError(cause.message);
      });
    return () => controller.abort();
  }, [arena.id, currentRound]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () =>
        setCursor((value) => {
          const next = (value ?? -1) + 1;
          if (next >= roundEvents.length - 1) setPlaying(false);
          return Math.min(next, roundEvents.length - 1);
        }),
      650 / speed,
    );
    return () => window.clearInterval(timer);
  }, [playing, speed, roundEvents.length]);
  const visible =
    cursor === null ? roundEvents : roundEvents.slice(0, cursor + 1);
  const initial =
    before?.snapshot.round === Math.max(0, currentRound - 1)
      ? before.snapshot
      : null;
  const stores = arena.snapshot.merchants.map((store) => {
    const own = visible.filter((event) => event.merchant_id === store.id);
    return {
      merchant: initial
        ? storeAtEvent(
            initial.merchants.find((item) => item.id === store.id)!,
            store,
            own,
          )
        : null,
      own,
    };
  });
  const settled = stores.every(({ own }) =>
    own.some((event) => event.node === "settle"),
  );
  const selected = arena.snapshot.merchants.find(
    (store) => store.id === detail,
  );
  const roundHistory = arena.history.filter(
    (point) =>
      point.round <= (settled ? currentRound : Math.max(0, currentRound - 1)),
  );
  const ranked = stores
    .flatMap(({ merchant }) => (merchant ? [merchant] : []))
    .sort((a, b) => b.profit - a.profit);
  const roundHighlights = highlights(arena.history).slice(-8);
  const weather =
    visible.find((event) => event.payload.market)?.payload.market ??
    arena.snapshot.market;
  return (
    <section className="arena-theatre" aria-label={t("Market panorama")}>
      <div
        className="supply-policy"
        title={
          arena.supply_policy === "proportional_v1"
            ? t(
                "Once all orders are in, supply is split in proportion to valid demand; integer remainders go by fractional share and rotating seats, and allocated units must be bought.",
              )
            : t(
                "Legacy rule: stock is reserved in rotating order. New matches and rematches use unified allocation.",
              )
        }
      >
        {arena.supply_policy === "proportional_v1"
          ? t("Unified allocation · proportional to valid orders")
          : t("Legacy rule · rotating purchase order")}
      </div>
      <div className={`market-sky weather-${weather.event.type}`}>
        <div className="market-title">
          <span className="eyebrow">
            THE MARKET / R{String(currentRound).padStart(2, "0")}
          </span>
          <h2>
            {t("One market, every store for itself")}
            <span className="sky-sun" />
          </h2>
        </div>
        <div className="weather-sign">
          {weather.event.type === "rain" ? (
            <CloudRain size={22} />
          ) : (
            <Zap size={22} />
          )}
          <div>
            <strong>{st(weather.event.name)}</strong>
            <small>{st(weather.event.impact)}</small>
          </div>
        </div>
        <span className={`theatre-signal ${connected ? "online" : ""}`}>
          <Radio size={13} />
          {round !== null || cursor !== null ? t("Replay") : t("Live events")}
        </span>
        {weather.event.type === "rain" && (
          <div className="scene-rain" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${i * 7 + 2}%`,
                  animationDelay: `${i * 0.13}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
      {error && (
        <p className="scene-notice" role="status">
          {error}
        </p>
      )}
      {loadError && (
        <p className="scene-notice" role="alert">
          {loadError}
        </p>
      )}
      <div
        className="street-stores"
        style={{ "--store-count": stores.length } as CSSProperties}
      >
        {stores.map(({ merchant, own }, index) =>
          merchant ? (
            <ShopScene
              key={merchant.id}
              merchant={merchant}
              events={own}
              before={initial!.merchants[index]}
              round={currentRound}
              onDetail={() => setDetail(merchant.id)}
            />
          ) : (
            <div className="shop-loading" key={index}>
              {t("Loading round start…")}
            </div>
          ),
        )}
      </div>
      <div className="market-road" aria-hidden="true">
        <span />
        <Truck size={22} />
        <span />
        <Users size={21} />
        <span />
      </div>
      <div className="theatre-footer">
        <span>
          <i />{" "}
          {settled
            ? t("Showing this round's sales settlement")
            : t("Settles together once every store is ready")}
        </span>
        <span>{t("Shelves scale with quantity · amounts in ¥")}</span>
      </div>
      <div className="market-scoreboard" aria-label={t("Live store ranking")}>
        {ranked.map((store, index) => (
          <div className={`score-slot store-${store.color}`} key={store.id}>
            <span className="score-rank">
              {index === 0 ? <Trophy size={16} /> : `0${index + 1}`}
            </span>
            <span>
              {st(store.name)}
              <small>{t("Net profit")}</small>
            </span>
            <strong className={store.profit >= 0 ? "positive" : "negative"}>
              <AnimatedValue value={store.profit} format={signedMoney} />
            </strong>
          </div>
        ))}
      </div>
      <div className="scene-transport">
        <button
          className="replay-play"
          disabled={!roundEvents.length}
          aria-label={playing ? t("Pause panorama replay") : t("Play panorama replay")}
          onClick={() => {
            if (
              !playing &&
              (cursor === null || cursor >= roundEvents.length - 1)
            )
              setCursor(-1);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <div className="scene-scrubber">
          <label htmlFor="market-cursor">
            {t("Synchronized replay")}{" "}
            <small>
              {cursor === null ? roundEvents.length : cursor + 1} /{" "}
              {roundEvents.length}
            </small>
          </label>
          <input
            id="market-cursor"
            aria-label={t("Panorama event position")}
            type="range"
            min={-1}
            max={Math.max(-1, roundEvents.length - 1)}
            value={cursor ?? roundEvents.length - 1}
            disabled={!roundEvents.length}
            onChange={(event) => {
              setPlaying(false);
              setCursor(+event.target.value);
            }}
          />
        </div>
        <select
          aria-label={t("Panorama replay speed")}
          value={speed}
          onChange={(event) => setSpeed(+event.target.value)}
        >
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
        <button
          className="text-button"
          onClick={() => {
            setCursor(null);
            setPlaying(false);
          }}
        >
          {t("Follow latest")}
        </button>
      </div>
      <div className="scene-highlights">
        <span>{t("Key rounds")}</span>
        {roundHighlights.map((item) => (
          <button
            key={item.round}
            onClick={() => onRound(item.round)}
            className={currentRound === item.round ? "selected" : ""}
          >
            <b>R{item.round}</b>
            {item.label}
            <ChevronRight size={12} />
          </button>
        ))}
        {roundHighlights.length === 0 && (
          <small>{t("No key changes yet; keep playing to see differences")}</small>
        )}
      </div>
      <details
        className="scene-chart"
        open={expandedChart}
        onToggle={(event) => setExpandedChart(event.currentTarget.open)}
      >
        <summary>
          {t("Profit trend")} <span>{t("Cumulative performance of every store")}</span>
        </summary>
        {expandedChart && roundHistory.length > 0 && (
          <ProfitChart
            history={roundHistory}
            merchants={arena.snapshot.merchants}
            selectedRound={roundHistory.at(-1)!.round}
          />
        )}
      </details>
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={
          selected
            ? t("{name} · decision details", { name: st(selected.name) })
            : t("Decision details")
        }
        wide
      >
        {selected && (
          <div className="scene-detail">
            <DecisionFlow
              events={visible.filter(
                (event) => event.merchant_id === selected.id,
              )}
            />
            {settled &&
            arena.decisions.some(
              (decision) => decision.merchant_id === selected.id,
            ) ? (
              <DecisionPanel
                decisions={arena.decisions.filter(
                  (decision) => decision.merchant_id === selected.id,
                )}
              />
            ) : (
              <div className="scene-event-list">
                {visible
                  .filter((event) => event.merchant_id === selected.id)
                  .slice(-20)
                  .reverse()
                  .map((event) => (
                    <p key={event.id}>
                      <span>{actionLabel(event)}</span>
                      <small>{st(event.label)}</small>
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
