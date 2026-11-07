import { useEffect, useState } from "react";
import { ArrowRight, Plus, Trash2, WandSparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, useResource } from "../api";
import type {
  Arena,
  ArenaInput,
  Catalog,
  Color,
  Mode,
  Strategy,
  ModelProfile,
} from "../types";
import { Avatar, Button, Modal, useToast } from "./ui";
import { AgentOptionsFields } from "../features/decisions/AgentOptionsFields";
import { getLang, st, t, type Lang } from "../i18n";

const INITIAL: ArenaInput = {
  name: "New business match",
  scenario: "neighborhood",
  total_rounds: 20,
  seed: 42,
  initial_capital: 1000000,
  merchants: [
    {
      name: "Northstar Shop",
      strategy_id: "balanced",
      mode: "rule",
      color: "violet",
    },
    {
      name: "Orange Supply",
      strategy_id: "discount",
      mode: "rule",
      color: "orange",
    },
    {
      name: "Greenfield Market",
      strategy_id: "premium",
      mode: "rule",
      color: "teal",
    },
  ],
};
const DEFAULT_OPTIONS = {
  memory: "episodic" as const,
  negotiation: true,
  tool_budget: 6,
};
INITIAL.merchants = INITIAL.merchants.map((merchant) => ({
  ...merchant,
  workflow: "adaptive",
  agent_options: { ...DEFAULT_OPTIONS },
}));

// Default names are English source strings, localized when the form opens.
function initialForm(): ArenaInput {
  const form = structuredClone(INITIAL);
  return {
    ...form,
    language: getLang(),
    name: t(form.name),
    merchants: form.merchants.map((merchant) => ({
      ...merchant,
      name: t(merchant.name),
    })),
  };
}

export function CreateArena({
  open,
  close,
  strategies,
  catalog,
}: {
  open: boolean;
  close: () => void;
  strategies: Strategy[];
  catalog: Catalog;
}) {
  const [form, setForm] = useState<ArenaInput>(initialForm);
  const [busy, setBusy] = useState(false);
  const profiles = useResource<ModelProfile[]>("/model-profiles");
  const toast = useToast(),
    navigate = useNavigate();
  useEffect(() => {
    if (open) setForm(initialForm());
  }, [open]);
  const updateMerchant = (index: number, field: string, value: string) =>
    setForm({
      ...form,
      merchants: form.merchants.map((merchant, item) =>
        item === index
          ? {
              ...merchant,
              [field]: value,
              ...(field === "mode" && value === "llm"
                ? {
                    agent_options: {
                      ...DEFAULT_OPTIONS,
                      negotiation: false,
                      tool_budget: 3,
                    },
                  }
                : {}),
            }
          : merchant,
      ),
    });
  return (
    <Modal title={t("New match")} open={open} onClose={close} wide>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            const arena = await api<Arena>("/arenas", {
              method: "POST",
              body: JSON.stringify(form),
            });
            close();
            navigate(`/arenas/${arena.id}`);
          } catch (error) {
            toast((error as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <label className="field">
            {t("Match name")}
            <input
              value={form.name}
              maxLength={60}
              required
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
          <div className="field">
            <span>{t("Choose a market")}</span>
            <div className="scenario-options">
              {catalog.scenarios.map((scenario) => (
                <label
                  key={scenario.id}
                  className={`scenario-option ${form.scenario === scenario.id ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="scenario"
                    value={scenario.id}
                    checked={form.scenario === scenario.id}
                    onChange={() => setForm({ ...form, scenario: scenario.id })}
                  />
                  <span className="scenario-icon">
                    <WandSparkles size={18} />
                  </span>
                  <strong>{st(scenario.name)}</strong>
                  <small>{st(scenario.tag)}</small>
                </label>
              ))}
            </div>
          </div>
          <div className="form-grid three">
            <label className="field">
              {t("Rounds")}
              <input
                type="number"
                min={3}
                max={60}
                value={form.total_rounds}
                onChange={(event) =>
                  setForm({ ...form, total_rounds: +event.target.value })
                }
                required
              />
            </label>
            <label className="field">
              {t("Starting cash (¥)")}
              <input
                type="number"
                min={3000}
                max={100000}
                step={1000}
                value={form.initial_capital / 100}
                onChange={(event) =>
                  setForm({
                    ...form,
                    initial_capital: Math.round(+event.target.value * 100),
                  })
                }
                required
              />
            </label>
            <label className="field">
              {t("Market seed")}
              <input
                type="number"
                min={1}
                max={1000000}
                value={form.seed}
                onChange={(event) =>
                  setForm({ ...form, seed: +event.target.value })
                }
                required
              />
            </label>
          </div>
          <label className="field">
            {t("Agent language")}
            <select
              aria-label={t("Agent language")}
              value={form.language ?? getLang()}
              onChange={(event) =>
                setForm({ ...form, language: event.target.value as Lang })
              }
            >
              <option value="en">{t("English")}</option>
              <option value="zh">{t("Chinese")}</option>
            </select>
            <small className="field-hint">
              {t("Prompts and agent output use this language; it can't change after the match starts.")}
            </small>
          </label>
          <div className="section-label">
            {t("Stores")}
            <span>{form.merchants.length} / 4</span>
          </div>
          <label className="field">
            {t("Human approval")}
            <select
              value={form.approval_policy || "off"}
              onChange={(event) =>
                setForm({
                  ...form,
                  approval_policy: event.target
                    .value as ArenaInput["approval_policy"],
                })
              }
            >
              <option value="off">{t("Run automatically")}</option>
              <option value="risk">
                {t("Approve large purchases or cash risk")}
              </option>
              <option value="all">{t("Approve every plan")}</option>
            </select>
          </label>
          <div className="merchant-form-list">
            {form.merchants.map((merchant, index) => (
              <div className="merchant-form" key={index}>
                <Avatar name={merchant.name} color={merchant.color} />
                <label className="field merchant-name">
                  {t("Store {number} name", { number: index + 1 })}
                  <input
                    aria-label={t("Store {number} name", { number: index + 1 })}
                    value={merchant.name}
                    maxLength={20}
                    required
                    onChange={(event) =>
                      updateMerchant(index, "name", event.target.value)
                    }
                  />
                </label>
                <label className="field merchant-strategy">
                  {t("Strategy")}
                  <select
                  aria-label={t("Store {number} strategy", { number: index + 1 })}
                  value={merchant.strategy_id}
                  onChange={(event) =>
                    updateMerchant(index, "strategy_id", event.target.value)
                  }
                >
                  {strategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {st(strategy.name)}
                    </option>
                  ))}
                  </select>
                </label>
                <label className="field merchant-engine">
                  {t("Decision engine")}
                  <select
                  aria-label={t("Store {number} decision engine", {
                    number: index + 1,
                  })}
                  value={merchant.mode}
                  onChange={(event) =>
                    updateMerchant(index, "mode", event.target.value as Mode)
                  }
                >
                  <option value="rule">{t("Rule engine")}</option>
                  <option value="llm">LLM Agent</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="icon-button"
                  disabled={form.merchants.length <= 2}
                  aria-label={t("Remove store {number}", { number: index + 1 })}
                  onClick={() =>
                    setForm({
                      ...form,
                      merchants: form.merchants.filter(
                        (_, item) => item !== index,
                      ),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
                <div className="merchant-model-fields">
                  {merchant.mode === "llm" && (
                    <label className="field">
                      {t("Model connection")}
                      <select
                        required
                        aria-label={t("Store {number} model", { number: index + 1 })}
                        value={merchant.model_profile_id || "default"}
                        onChange={(event) =>
                          updateMerchant(
                            index,
                            "model_profile_id",
                            event.target.value,
                          )
                        }
                      >
                        {(profiles.data || [])
                          .filter((profile) => profile.enabled)
                          .map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {st(profile.name)} · {profile.model || t("Not configured")}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <label className="field">
                    {t("Decision workflow")}
                    <select
                      aria-label={t("Store {number} workflow", { number: index + 1 })}
                      value={merchant.workflow || "direct"}
                      onChange={(event) =>
                        updateMerchant(index, "workflow", event.target.value)
                      }
                    >
                      <option value="direct">
                        {merchant.mode === "llm"
                          ? t("Standard decision")
                          : t("Decide by rules")}
                      </option>
                      <option value="reviewed">
                        {merchant.mode === "llm"
                          ? t("Projection and review")
                          : t("Rule projection and risk check")}
                      </option>
                      <option value="adaptive">
                        {merchant.mode === "llm"
                          ? t("Adaptive planning with dynamic review")
                          : t("Risk-triggered rule projection")}
                      </option>
                    </select>
                  </label>
                  <p className="model-cost-hint">
                    {merchant.mode === "llm"
                      ? t("Calls the model each round · multi-round negotiation is off by default to save tokens")
                      : t("Runs on fixed rules; experience recall and rule-based bargaining are optional. No model calls, no tokens.")}
                  </p>
                  <AgentOptionsFields
                    label={t("Store {number} ", { number: index + 1 })}
                    mode={merchant.mode}
                    value={merchant.agent_options}
                    onChange={(agent_options) =>
                      setForm({
                        ...form,
                        merchants: form.merchants.map((item, i) =>
                          i === index ? { ...item, agent_options } : item,
                        ),
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          {form.merchants.length < 4 && (
            <Button
              variant="ghost"
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  merchants: [
                    ...form.merchants,
                    {
                      name: t("Blue Whale Mart"),
                      strategy_id: "adaptive",
                      mode: "rule",
                      color: "blue" as Color,
                      workflow: "adaptive",
                      agent_options: { ...DEFAULT_OPTIONS },
                    },
                  ],
                })
              }
            >
              <Plus size={16} />
              {t("Add store")}
            </Button>
          )}
        </div>
        <div className="modal-footer">
          <Button variant="secondary" type="button" onClick={close}>
            {t("Cancel")}
          </Button>
          <Button type="submit" busy={busy}>
            {t("New match")}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
