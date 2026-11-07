import { GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, signedMoney, useResource } from "../../api";
import { Button, useToast } from "../../components/ui";
import type { Arena, MerchantInput, Strategy } from "../../types";
import { st, t } from "../../i18n";

interface Comparison {
  parent: { id: number; name: string } | null;
  fork_round: number;
  points: {
    round: number;
    merchants: {
      name: string;
      parent_profit: number;
      fork_profit: number;
      difference: number;
    }[];
  }[];
}
export function BranchPanel({
  arena,
  round,
}: {
  arena: Arena;
  round: number | null;
}) {
  const [forkRound, setForkRound] = useState(
    Math.min(round ?? arena.current_round, arena.total_rounds - 1),
  );
  const [slot, setSlot] = useState(0);
  const [strategy, setStrategy] = useState("");
  const [workflow, setWorkflow] = useState("keep");
  const [memory, setMemory] = useState("keep");
  const [negotiation, setNegotiation] = useState("keep");
  const [busy, setBusy] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [compareSlot, setCompareSlot] = useState(0);
  const strategies = useResource<Strategy[]>("/strategies");
  const navigate = useNavigate(),
    toast = useToast();
  useEffect(() => {
    setForkRound(
      Math.min(round ?? arena.current_round, arena.total_rounds - 1),
    );
  }, [round, arena.id, arena.current_round]);
  useEffect(() => {
    if (arena.parent_arena_id)
      api<Comparison>(`/arenas/${arena.id}/comparison`)
        .then(setComparison)
        .catch((error: Error) => toast(error.message, true));
  }, [arena.id, arena.current_round]);
  const create = async () => {
    setBusy(true);
    try {
      const merchants: MerchantInput[] = arena.snapshot.merchants.map(
        (merchant, index) => ({
          name: merchant.name,
          strategy_id:
            index === slot && strategy ? strategy : merchant.strategy_id,
          mode: merchant.mode,
          color: merchant.color,
          model_profile_id: merchant.model_config?.id,
          workflow:
            index === slot && workflow !== "keep"
              ? (workflow as MerchantInput["workflow"])
              : merchant.workflow,
          agent_options: {
            memory:
              index === slot && memory !== "keep"
                ? (memory as "none")
                : merchant.agent_options?.memory || "recent",
            negotiation:
              index === slot && negotiation !== "keep"
                ? negotiation === "on"
                : merchant.agent_options?.negotiation || false,
            tool_budget: merchant.agent_options?.tool_budget || 6,
          },
        }),
      );
      const fork = await api<Arena>(`/arenas/${arena.id}/fork`, {
        method: "POST",
        body: JSON.stringify({ round: forkRound, merchants }),
      });
      navigate(`/arenas/${fork.id}`);
    } catch (error) {
      toast((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel branch-panel">
      <div className="section-heading small">
        <h3>
          <GitBranch size={16} /> {t("Fork from a past decision")}
        </h3>
        <span>{t("Copies the starting point · same market seed")}</span>
      </div>
      <p>
        {t(
          "Replay only reads saved records. A fork creates a separate match, and later rounds make new calls to the chosen models. You can change one store; the other seats keep their configuration.",
        )}
      </p>
      <div className="form-grid three">
        <label className="field">
          {t("Fork round")}
          <input
            aria-label={t("Fork round")}
            type="number"
            min="0"
            max={Math.min(arena.current_round, arena.total_rounds - 1)}
            value={forkRound}
            onChange={(event) => setForkRound(+event.target.value)}
          />
        </label>
        <label className="field">
          {t("Store to change")}
          <select
            value={slot}
            onChange={(event) => setSlot(+event.target.value)}
          >
            {arena.snapshot.merchants.map((merchant, index) => (
              <option value={index} key={merchant.id}>
                {st(merchant.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("Strategy after fork")}
          <select
            value={strategy}
            onChange={(event) => setStrategy(event.target.value)}
          >
            <option value="">{t("Keep original strategy")}</option>
            {strategies.data?.map((item) => (
              <option value={item.id} key={item.id}>
                {st(item.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("Workflow after fork")}
          <select
            value={workflow}
            onChange={(event) => setWorkflow(event.target.value)}
          >
            <option value="keep">{t("Keep original workflow")}</option>
            <option value="direct">{t("Standard decision")}</option>
            <option value="reviewed">{t("Projection and review")}</option>
            <option value="adaptive">{t("Adaptive planning")}</option>
          </select>
        </label>
        <label className="field">
          {t("Memory setting")}
          <select
            value={memory}
            onChange={(event) => setMemory(event.target.value)}
          >
            <option value="keep">{t("Keep original setting")}</option>
            <option value="none">{t("No memory")}</option>
            <option value="recent">{t("Last five rounds")}</option>
            <option value="episodic">{t("Retrieve past experience")}</option>
          </select>
        </label>
        <label className="field">
          {t("Supplier negotiation")}
          <select
            value={negotiation}
            onChange={(event) => setNegotiation(event.target.value)}
          >
            <option value="keep">{t("Keep original setting")}</option>
            <option value="on">{t("On")}</option>
            <option value="off">{t("Off")}</option>
          </select>
        </label>
      </div>
      <Button variant="secondary" busy={busy} onClick={create}>
        <GitBranch size={15} />
        {t("Create fork")}
      </Button>
      {comparison?.parent && (
        <>
          <p>
            {t("Source match: ")}
            <Link to={`/arenas/${comparison.parent.id}`}>
              {st(comparison.parent.name)}
            </Link>{" "}
            {t(
              "· Forked at round {round}; the chart compares the latest round both runs have settled.",
              { round: comparison.fork_round },
            )}
          </p>
          {comparison.points.length > 0 && (
            <div className="branch-chart">
              <label className="field">
                {t("Compare store")}
                <select
                  value={compareSlot}
                  onChange={(event) => setCompareSlot(+event.target.value)}
                >
                  {arena.snapshot.merchants.map((store, index) => (
                    <option value={index} key={store.id}>
                      {st(store.name)}
                    </option>
                  ))}
                </select>
              </label>
              <BranchChart
                points={comparison.points}
                slot={compareSlot}
                forkRound={comparison.fork_round}
              />
              <div className="branch-chart-legend">
                <span>
                  <i />
                  {t("Original")}
                </span>
                <span>
                  <i />
                  {t("Fork")}
                </span>
              </div>
            </div>
          )}
          <div className="branch-result">
            {comparison.points.at(-1)?.merchants.map((merchant) => (
              <span key={merchant.name}>
                <b>{st(merchant.name)}</b> · {t("Profit difference")}{" "}
                {signedMoney(merchant.difference)}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function BranchChart({
  points,
  slot,
  forkRound,
}: {
  points: Comparison["points"];
  slot: number;
  forkRound: number;
}) {
  const values = points.flatMap((point) => [
    point.merchants[slot].parent_profit,
    point.merchants[slot].fork_profit,
  ]);
  const low = Math.min(0, ...values),
    high = Math.max(100, ...values);
  const x = (round: number) =>
    70 + (round / Math.max(1, points.at(-1)!.round)) * 480;
  const y = (profit: number) => 180 - ((profit - low) / (high - low)) * 145;
  return (
    <svg viewBox="0 0 590 220" role="img" aria-label={t("Profit of original vs. forked strategy")}>
      {[0, 0.5, 1].map((ratio) => (
        <g key={ratio}>
          <line
            x1="70"
            x2="550"
            y1={y(low + (high - low) * ratio)}
            y2={y(low + (high - low) * ratio)}
            stroke="#e9ede5"
          />
          <text
            x="62"
            y={y(low + (high - low) * ratio) + 4}
            textAnchor="end"
            className="chart-label"
          >
            {signedMoney(Math.round(low + (high - low) * ratio))}
          </text>
        </g>
      ))}
      <line
        x1={x(forkRound)}
        x2={x(forkRound)}
        y1="20"
        y2="185"
        stroke="#b9c5ac"
        strokeDasharray="3 4"
      />
      <text
        x={x(forkRound)}
        y="207"
        textAnchor="middle"
        className="chart-label"
      >
        R{forkRound} {t("fork")}
      </text>
      {(["parent_profit", "fork_profit"] as const).map((field) => (
        <path
          key={field}
          d={points
            .map(
              (point, index) =>
                `${index ? "L" : "M"}${x(point.round)},${y(point.merchants[slot][field])}`,
            )
            .join(" ")}
          fill="none"
          stroke={field === "parent_profit" ? "#a7aba0" : "#617e4e"}
          strokeWidth="2.5"
          strokeDasharray={field === "parent_profit" ? "5 5" : undefined}
        />
      ))}
    </svg>
  );
}
