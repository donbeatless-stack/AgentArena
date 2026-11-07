import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleDot,
  Flag,
  Plus,
  ShoppingBag,
  Trophy,
  Zap,
} from "lucide-react";
import { count, date, money, signedMoney, useResource } from "../api";
import type { Catalog, Overview } from "../types";
import { st, t } from "../i18n";
import { CreateArena } from "../components/CreateArena";
import {
  Avatar,
  Button,
  Empty,
  ErrorState,
  Loading,
  Metric,
  StatusBadge,
} from "../components/ui";

export function Dashboard({ catalog }: { catalog: Catalog }) {
  const { data, error, reload } = useResource<Overview>("/overview");
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("all");
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <Loading />;
  const matches = data.arenas.filter(
    (arena) =>
      filter === "all" ||
      (filter === "live"
        ? arena.status !== "completed"
        : arena.status === "completed"),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE PLAYING FIELD</div>
          <h1>
            {t("Arena")}
            <span className="title-dot" />
          </h1>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={17} />
          {t("New match")}
        </Button>
      </div>
      <div className="dashboard-hero">
        <div className="hero-copy">
          <span className="hero-chip">
            <i />
            AGENT ECONOMY
          </span>
          <h2>
            {t("Let agents run the shops,")}
            <br />
            {t("watch decisions turn into ")}
            <span>{t("profit.")}</span>
          </h2>
          <div className="hero-facts">
            <span>
              ¥10,000 <small>{t("starting cash / store")}</small>
            </span>
            <span>
              20 <small>{t("rounds")}</small>
            </span>
            <span>
              3 <small>{t("competing stores")}</small>
            </span>
          </div>
          <div className="hero-actions">
            <Button variant="dark" onClick={() => setCreating(true)}>
              {t("Start a competition")}
              <ArrowUpRight size={17} />
            </Button>
            {data.arenas.some((arena) => arena.current_round > 0) && (
              <Link
                className="hero-watch"
                to={`/arenas/${data.arenas.find((arena) => arena.current_round > 0)!.id}`}
              >
                {t("Watch a replay")} <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="hero-building building-back">
            <div className="building-roof" />
            <span>A</span>
            <div className="building-window" />
          </div>
          <div className="hero-building building-front">
            <div className="building-roof" />
            <span>B</span>
            <div className="building-window" />
          </div>
          <div className="hero-building building-side">
            <div className="building-roof" />
            <span>C</span>
            <div className="building-window" />
          </div>
          <span className="floating-label float-profit">
            <ArrowUpRight size={14} />
            {t("Profit up")}
          </span>
          <span className="floating-label float-live">
            <i />
            {t("Market open")}
          </span>
          <span className="hero-grid-line" />
        </div>
      </div>
      <div className="metric-grid dashboard-metrics">
        <Metric
          label={t("Matches")}
          value={data.stats.arenas.toString().padStart(2, "0")}
          suffix={
            <>
              <span className="positive">
                {t("{count} running", { count: data.stats.active })}
              </span>
              <span>{t("All markets")}</span>
            </>
          }
          icon={<Flag size={17} />}
        />
        <Metric
          label={t("Rounds played")}
          value={count(data.stats.rounds)}
          suffix={
            <>
              <span>
                {t("{count} finished", { count: data.stats.completed })}
              </span>
              <BarChart3 size={15} />
            </>
          }
          icon={<CircleDot size={17} />}
        />
        <Metric
          label={t("Total market revenue")}
          value={
            <>
              <span className="currency">¥</span>
              {money(data.stats.revenue)}
            </>
          }
          suffix={
            <>
              <span>{t("Sales across all stores")}</span>
              <ArrowUpRight size={15} />
            </>
          }
          icon={<ShoppingBag size={17} />}
        />
        <Metric
          label={t("Strategies available")}
          value={data.strategies.length.toString().padStart(2, "0")}
          suffix={
            <Link to="/strategies">
              {t("Open strategies")}
              <ArrowRight size={14} />
            </Link>
          }
          icon={<Zap size={17} />}
        />
      </div>
      <div className="section-heading">
        <h2>
          {t("My matches")}
          <span className="number-chip">{data.arenas.length}</span>
        </h2>
        <div className="segmented">
          {[
            ["all", "All"],
            ["live", "In progress"],
            ["completed", "Finished"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </div>
      <div className="arena-grid">
        {matches.map((arena) => (
          <Link
            to={`/arenas/${arena.id}`}
            className="arena-card"
            key={arena.id}
          >
            <div className="arena-card-top">
              <StatusBadge status={arena.status} />
              <span className="card-date">
                {date(arena.created_at)}
                <ArrowUpRight size={17} />
              </span>
            </div>
            <h3>{st(arena.name)}</h3>
            <p className="arena-card-meta">
              {st(
                catalog.scenarios.find((item) => item.id === arena.scenario)
                  ?.name,
              )}
              <span />
              {t("{count} stores", { count: arena.merchants.length })}
              <span />
              {t("Seed {seed}", { seed: arena.seed })}
            </p>
            <div className="arena-card-stores">
              {arena.merchants.map((merchant) => (
                <div key={merchant.id}>
                  <Avatar name={st(merchant.name)} color={merchant.color} small />
                  <span>{st(merchant.name)}</span>
                  <small
                    className={merchant.profit >= 0 ? "positive" : "negative"}
                  >
                    {signedMoney(merchant.profit)}
                  </small>
                </div>
              ))}
            </div>
            <div className="arena-progress">
              <div
                style={{
                  width: `${(arena.current_round / arena.total_rounds) * 100}%`,
                }}
              />
            </div>
            <div className="arena-card-bottom">
              <span>
                {t("Round")} <b>{arena.current_round}</b> / {arena.total_rounds}
              </span>
              <span>
                <Trophy size={13} />
                {arena.current_round > 0
                  ? t("{name} leads", { name: st(arena.leader) })
                  : t("Waiting to start")}
              </span>
            </div>
          </Link>
        ))}
        <button className="create-arena-tile" onClick={() => setCreating(true)}>
          <span>
            <Plus size={26} />
          </span>
          <strong>{t("New market, new possibilities")}</strong>
          <small>
            {t("New match")}
            <ArrowRight size={14} />
          </small>
        </button>
      </div>
      {matches.length === 0 && data.arenas.length > 0 && (
        <Empty title={t("No matches here yet")} />
      )}
      <div className="bottom-notes">
        <span>
          <i />
          ALL SYSTEMS OPERATIONAL
        </span>
        <span>AgentArena / Market Simulation</span>
      </div>
      <CreateArena
        open={creating}
        close={() => setCreating(false)}
        strategies={data.strategies}
        catalog={catalog}
      />
    </>
  );
}
