import { useState } from "react";
import {
  Copy,
  FileCode2,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Target,
  Wallet,
  Zap,
} from "lucide-react";
import { api, money, useResource } from "../api";
import type { Color, Strategy } from "../types";
import { st, t } from "../i18n";
import {
  Avatar,
  Button,
  ErrorState,
  Loading,
  Modal,
  useToast,
} from "../components/ui";

const APPROACHES = {
  balanced: "Steady",
  discount: "Price competition",
  premium: "Brand premium",
  adaptive: "Adaptive",
};
const BLANK: Omit<Strategy, "id"> = {
  name: "My new strategy",
  description: "",
  approach: "adaptive",
  margin: 0.85,
  stock_days: 1.3,
  marketing_budget: 8000,
  prompt:
    "Each round, set purchasing, pricing and marketing based on market demand, inventory turnover and cash flow.",
  color: "blue",
};

export function StrategiesPage() {
  const { data, error, reload } = useResource<Strategy[]>("/strategies");
  const [editing, setEditing] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Strategy, "id">>(BLANK);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <Loading />;
  const open = (strategy?: Strategy, copy = false) => {
    setId(strategy && !copy ? strategy.id : null);
    setForm(
      strategy
        ? copy
          ? { ...strategy, name: st(strategy.name) + t(" · copy") }
          : strategy
        : { ...BLANK, name: t(BLANK.name), prompt: t(BLANK.prompt) },
    );
    setEditing(true);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE STRATEGY ROOM</div>
          <h1>
            {t("Strategies")}
            <span className="title-dot" />
          </h1>
        </div>
        <Button onClick={() => open()}>
          <Plus size={17} />
          {t("New strategy")}
        </Button>
      </div>
      <div className="strategy-banner">
        <div>
          <span className="eyebrow">YOUR EDGE IN THE MARKET</span>
          <h2>{t("Same market, different playbooks.")}</h2>
        </div>
        <div className="strategy-banner-stat">
          <strong>{String(data.length).padStart(2, "0")}</strong>
          <span>{t("Business strategies available")}</span>
        </div>
        <div className="strategy-banner-art" aria-hidden="true">
          <Target size={90} strokeWidth={0.7} />
          <Sparkles size={30} />
        </div>
      </div>
      <div className="strategy-grid">
        {data.map((strategy) => (
          <article
            className={`strategy-card strategy-${strategy.color}`}
            key={strategy.id}
          >
            <div className="strategy-card-header">
              <Avatar name={st(strategy.name)} color={strategy.color} />
              <span className="subtle-chip">
                {strategy.built_in ? t("Built-in") : t("Custom")}
              </span>
              <button
                className="icon-button"
                aria-label={t("Copy {name}", { name: st(strategy.name) })}
                onClick={() => open(strategy, true)}
              >
                <Copy size={16} />
              </button>
            </div>
            <h2>{st(strategy.name)}</h2>
            <p>{st(strategy.description)}</p>
            <span className="approach-tag">
              <Zap size={12} />
              {t(APPROACHES[strategy.approach])}
            </span>
            <div className="strategy-parameters">
              <span>
                <Target size={14} />
                {t("Target markup")}
                <b>{Math.round(strategy.margin * 100)}%</b>
              </span>
              <span>
                <SlidersHorizontal size={14} />
                {t("Target stock")}
                <b>{t("{count} rounds", { count: strategy.stock_days })}</b>
              </span>
              <span>
                <Wallet size={14} />
                {t("Marketing / round")}
                <b>¥{money(strategy.marketing_budget)}</b>
              </span>
            </div>
            <div className="strategy-prompt">
              <FileCode2 size={15} />
              <p>{strategy.prompt}</p>
            </div>
            <Button variant="secondary" onClick={() => open(strategy)}>
              <Pencil size={14} />
              {t("Edit strategy")}
            </Button>
          </article>
        ))}
      </div>
      <Modal
        title={id ? t("Edit strategy") : t("New strategy")}
        open={editing}
        onClose={() => setEditing(false)}
        wide
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await api(`/strategies${id ? `/${id}` : ""}`, {
                method: id ? "PUT" : "POST",
                body: JSON.stringify(form),
              });
              setEditing(false);
              reload();
              toast(t("Strategy saved"));
            } catch (cause) {
              toast((cause as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="modal-body">
            <div className="form-grid">
              <label className="field">
                {t("Strategy name")}
                <input
                  required
                  maxLength={30}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>
              <label className="field">
                {t("Approach")}
                <select
                  value={form.approach}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      approach: event.target.value as Strategy["approach"],
                    })
                  }
                >
                  {Object.entries(APPROACHES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              {t("Summary")}
              <input
                maxLength={120}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>
            <div className="form-grid three">
              <label className="field">
                {t("Target markup (%)")}
                <input
                  type="number"
                  required
                  min={10}
                  max={180}
                  value={Math.round(form.margin * 100)}
                  onChange={(event) =>
                    setForm({ ...form, margin: +event.target.value / 100 })
                  }
                />
              </label>
              <label className="field">
                {t("Target stock (rounds)")}
                <input
                  type="number"
                  required
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={form.stock_days}
                  onChange={(event) =>
                    setForm({ ...form, stock_days: +event.target.value })
                  }
                />
              </label>
              <label className="field">
                {t("Marketing per round (¥)")}
                <input
                  type="number"
                  required
                  min={0}
                  max={300}
                  value={form.marketing_budget / 100}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      marketing_budget: Math.round(+event.target.value * 100),
                    })
                  }
                />
              </label>
            </div>
            <label className="field">
              {t("Agent instructions")}
              <textarea
                required
                rows={6}
                maxLength={6000}
                value={form.prompt}
                onChange={(event) =>
                  setForm({ ...form, prompt: event.target.value })
                }
              />
            </label>
            <div className="field">
              <span>{t("Color")}</span>
              <div className="color-options">
                {(["violet", "orange", "teal", "blue"] as Color[]).map(
                  (color) => (
                    <label
                      key={color}
                      className={`color-option color-${color} ${form.color === color ? "selected" : ""}`}
                    >
                      <input
                        aria-label={t("{color} color", { color })}
                        type="radio"
                        name="strategy-color"
                        checked={form.color === color}
                        onChange={() => setForm({ ...form, color })}
                      />
                      <span />
                    </label>
                  ),
                )}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditing(false)}
            >
              {t("Cancel")}
            </Button>
            <Button type="submit" busy={busy}>
              {t("Save strategy")}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
