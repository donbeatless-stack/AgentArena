import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Network,
  Plus,
  Save,
  Server,
  Trash2,
} from "lucide-react";
import { api, useResource } from "../api";
import type { ModelProfile, ModelSettings } from "../types";
import { Button, ErrorState, Loading, useToast } from "../components/ui";
import { st, t } from "../i18n";

const NEW_PROFILE: ModelProfile = {
  id: "",
  name: "DeepSeek Flash",
  provider: "deepseek",
  base_url: "https://api.deepseek.com",
  model: "deepseek-flash",
  thinking: "disabled",
  temperature: 0.5,
  timeout: 90,
  max_steps: 15,
  max_tokens: 2048,
  input_price: 0,
  output_price: 0,
  enabled: true,
  has_key: false,
};

export function SettingsPage() {
  const profiles = useResource<ModelProfile[]>("/model-profiles");
  const runtime = useResource<ModelSettings>("/settings");
  const [selected, setSelected] = useState("default");
  const [form, setForm] = useState<ModelProfile | null>(null);
  const [key, setKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const toast = useToast();
  useEffect(() => {
    if (!profiles.data) return;
    setForm(
      selected === "new"
        ? { ...NEW_PROFILE }
        : profiles.data.find((item) => item.id === selected) ||
            profiles.data[0],
    );
    setKey("");
    setClearKey(false);
    setConnection(null);
  }, [profiles.data, selected]);
  if (profiles.error)
    return <ErrorState message={profiles.error} retry={profiles.reload} />;
  if (!form || !profiles.data) return <Loading />;
  const update = <K extends keyof ModelProfile>(
    field: K,
    value: ModelProfile[K],
  ) => {
    setForm({ ...form, [field]: value });
    setConnection(null);
  };
  const payload = () => ({ ...form, api_key: clearKey ? "" : key || null });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MODEL WORKSPACE</div>
          <h1>
            {t("Settings")}
            <span className="title-dot" />
          </h1>
        </div>
        <Button
          onClick={() => {
            setSelected("new");
            setForm({ ...NEW_PROFILE });
            setKey("");
            setClearKey(false);
            setConnection(null);
          }}
        >
          <Plus size={16} />
          {t("Add model")}
        </Button>
      </div>
      <div className="model-settings-layout">
        <aside className="model-library">
          <div className="section-heading">
            <h2>{t("Model connection")}</h2>
            <span>{profiles.data.length}</span>
          </div>
          {profiles.data.map((profile) => (
            <button
              key={profile.id}
              className={`model-profile-card ${selected === profile.id ? "selected" : ""}`}
              onClick={() => setSelected(profile.id)}
            >
              <Server size={18} />
              <span>
                <strong>{st(profile.name)}</strong>
                <small>{profile.model || t("No model selected")}</small>
              </span>
              <i
                className={profile.has_key && profile.enabled ? "online" : ""}
              />
            </button>
          ))}
          {selected === "new" && (
            <div className="model-profile-card selected">
              <Plus size={18} />
              <span>{t("New model connection")}</span>
            </div>
          )}
          <section className="panel runtime-card">
            <div className="panel-heading">
              <h2>{t("Runtime")}</h2>
            </div>
            <div className="runtime-row">
              <span>{t("Business storage")}</span>
              <strong>SQLite</strong>
            </div>
            <div className="runtime-row">
              <span>{t("Job queue")}</span>
              <strong>
                {runtime.data?.queue === "redis"
                  ? "Redis Streams"
                  : t("SQLite queue")}
              </strong>
            </div>
            <div className="runtime-row">
              <span>{t("Workflow")}</span>
              <strong>LangGraph</strong>
            </div>
          </section>
        </aside>
        <section className="panel settings-form">
          <div className="panel-heading">
            <h2>{form.id ? st(form.name) : t("Add model")}</h2>
            <span
              className={`connection-badge ${form.has_key && form.model ? "configured" : ""}`}
            >
              <i />
              {form.has_key && form.model ? t("Configured") : t("Not configured")}
            </span>
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              try {
                const saved = await api<ModelProfile>(
                  form.id ? `/model-profiles/${form.id}` : "/model-profiles",
                  {
                    method: form.id ? "PUT" : "POST",
                    body: JSON.stringify(payload()),
                  },
                );
                profiles.setData((items) => [
                  ...(items || []).filter((item) => item.id !== saved.id),
                  saved,
                ]);
                setSelected(saved.id);
                runtime.reload();
                toast(t("Model connection saved"));
              } catch (cause) {
                toast((cause as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="settings-fields">
              <div className="form-grid">
                <label className="field">
                  {t("Connection name")}
                  <input
                    required
                    maxLength={60}
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </label>
                <label className="field">
                  {t("Provider")}
                  <select
                    value={form.provider}
                    onChange={(e) =>
                      update(
                        "provider",
                        e.target.value as ModelProfile["provider"],
                      )
                    }
                  >
                    <option value="deepseek">DeepSeek</option>
                    <option value="compatible">{t("Compatible API")}</option>
                  </select>
                </label>
              </div>
              <label className="field">
                {t("API base URL")}
                <input
                  required
                  type="url"
                  value={form.base_url}
                  onChange={(e) => update("base_url", e.target.value)}
                  placeholder="https://api.deepseek.com"
                />
              </label>
              <label className="field">
                {t("Model name")}
                <input
                  required
                  maxLength={100}
                  value={form.model}
                  list="model-names"
                  onChange={(e) => update("model", e.target.value)}
                  placeholder="deepseek-flash / deepseek-v4-pro"
                />
                <datalist id="model-names">
                  <option value="deepseek-flash" />
                  <option value="deepseek-v4-pro" />
                  <option value="deepseek-chat" />
                </datalist>
              </label>
              <label className="field">
                <span>
                  API Key
                  {form.has_key && !clearKey && (
                    <span className="key-saved">
                      <Check size={12} />
                      {t("Saved")}
                    </span>
                  )}
                </span>
                <div className="password-input">
                  <input
                    type={visible ? "text" : "password"}
                    autoComplete="off"
                    value={key}
                    onChange={(e) => {
                      setKey(e.target.value);
                      setClearKey(false);
                      setConnection(null);
                    }}
                    placeholder={
                      form.has_key && !clearKey
                        ? t("Keep the saved key")
                        : t("Enter API key")
                    }
                  />
                  <button
                    type="button"
                    aria-label={visible ? t("Hide key") : t("Show key")}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              {form.has_key && (
                <button
                  type="button"
                  className="text-button danger-link"
                  onClick={() => {
                    setClearKey(!clearKey);
                    setKey("");
                  }}
                >
                  <Trash2 size={13} />
                  {clearKey ? t("Undo clearing the key") : t("Clear saved key")}
                </button>
              )}
              <div className="settings-divider" />
              <h3 className="settings-subtitle">{t("Execution parameters")}</h3>
              <div className="form-grid three">
                <label className="field">
                  {t("Thinking mode")}
                  <select
                    value={form.thinking}
                    onChange={(e) =>
                      update(
                        "thinking",
                        e.target.value as ModelProfile["thinking"],
                      )
                    }
                  >
                    <option value="disabled">{t("Off")}</option>
                    <option value="enabled">{t("On")}</option>
                  </select>
                </label>
                <label className="field">
                  Temperature
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    required
                    value={form.temperature}
                    onChange={(e) => update("temperature", +e.target.value)}
                  />
                </label>
                <label className="field">
                  {t("Request timeout (s)")}
                  <input
                    type="number"
                    min={5}
                    max={180}
                    required
                    value={form.timeout}
                    onChange={(e) => update("timeout", +e.target.value)}
                  />
                </label>
                <label className="field">
                  {t("Max agent steps")}
                  <input
                    type="number"
                    min={3}
                    max={30}
                    required
                    value={form.max_steps}
                    onChange={(e) => update("max_steps", +e.target.value)}
                  />
                </label>
                <label className="field">
                  {t("Max output tokens")}
                  <input
                    type="number"
                    min={512}
                    max={32768}
                    required
                    value={form.max_tokens}
                    onChange={(e) => update("max_tokens", +e.target.value)}
                  />
                </label>
                <label className="field">
                  {t("Status")}
                  <select
                    value={String(form.enabled)}
                    onChange={(e) =>
                      update("enabled", e.target.value === "true")
                    }
                  >
                    <option value="true">{t("Enabled")}</option>
                    <option value="false">{t("Disabled")}</option>
                  </select>
                </label>
              </div>
              <details className="model-pricing">
                <summary>{t("Cost pricing")}</summary>
                <div className="form-grid">
                  <label className="field">
                    {t("Input price (¥ / 1M tokens)")}
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step={0.01}
                      value={form.input_price}
                      onChange={(e) => update("input_price", +e.target.value)}
                    />
                  </label>
                  <label className="field">
                    {t("Output price (¥ / 1M tokens)")}
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step={0.01}
                      value={form.output_price}
                      onChange={(e) => update("output_price", +e.target.value)}
                    />
                  </label>
                </div>
              </details>
              {connection && (
                <div
                  className={`connection-result ${connection.ok ? "positive" : "negative"}`}
                  role={connection.ok ? "status" : "alert"}
                >
                  {st(connection.message)}
                </div>
              )}
            </div>
            <div className="settings-actions">
              {form.id && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || testing}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const copied = await api<ModelProfile>(
                        `/model-profiles/${form.id}/copy`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            name: (st(form.name) + t(" · copy")).slice(0, 60),
                          }),
                        },
                      );
                      profiles.setData((items) => [...(items || []), copied]);
                      setSelected(copied.id);
                      setForm(copied);
                      setKey("");
                    } catch (cause) {
                      toast((cause as Error).message, true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Copy size={15} />
                  {t("Copy connection")}
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                busy={testing}
                disabled={busy}
                onClick={async () => {
                  setTesting(true);
                  setConnection(null);
                  try {
                    const result = await api<{ latency_ms: number }>(
                      form.id
                        ? `/model-profiles/${form.id}/test`
                        : "/model-profiles/test",
                      { method: "POST", body: JSON.stringify(payload()) },
                    );
                    setConnection({
                      ok: true,
                      message: t("Tool calling verified · {ms} ms", {
                        ms: result.latency_ms,
                      }),
                    });
                  } catch (cause) {
                    setConnection({
                      ok: false,
                      message: (cause as Error).message,
                    });
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                <Network size={16} />
                {t("Test connection")}
              </Button>
              <Button type="submit" busy={busy} disabled={testing}>
                <Save size={16} />
                {t("Save model")}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
