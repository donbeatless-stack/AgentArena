import { useSyncExternalStore } from "react";
import { ZH } from "./zh";
import { SERVER_EN } from "./server";

const SERVER_ZH: Record<string, string> = Object.fromEntries(
  Object.entries(SERVER_EN).map(([zh, en]) => [en, zh]),
);

/**
 * Minimal gettext-style i18n.
 *
 * Source strings in components are English. `t()` looks them up in the Chinese
 * dictionary when the UI language is Chinese. Text that originates on the server
 * (catalog names, node labels, seeded demo data) is Chinese and goes through
 * `st()`, which maps known strings to English. Free text produced at runtime
 * (agent summaries, model output) passes through unchanged.
 *
 * Switching languages remounts the app (see `main.tsx`), so plain function calls
 * are enough; nothing needs to subscribe except the root.
 */
export type Lang = "en" | "zh";

const STORAGE_KEY = "arena.lang";
const listeners = new Set<() => void>();

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    // Storage can be unavailable (privacy mode); fall back to the browser language.
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

const TITLES: Record<Lang, string> = {
  en: "AgentArena · Multi-agent business arena",
  zh: "AgentArena · 智能体商业竞技场",
};

function applyDocumentLanguage(lang: Lang): void {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = TITLES[lang];
}

let current: Lang = detect();
applyDocumentLanguage(current);

export const getLang = (): Lang => current;

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  applyDocumentLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Non-persistent switch is still useful for the current tab.
  }
  listeners.forEach((listener) => listener());
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLang,
    getLang,
  );
}

type Vars = Record<string, string | number>;

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

const MISSING_KEY = "arena.i18n.missing";

// Record untranslated keys for the session so end-to-end tests can assert full coverage,
// including keys that reach t() through variables and can't be checked statically.
function reportMissing(text: string): void {
  try {
    const missing: string[] = JSON.parse(
      sessionStorage.getItem(MISSING_KEY) || "[]",
    );
    if (!missing.includes(text)) {
      sessionStorage.setItem(MISSING_KEY, JSON.stringify([...missing, text]));
    }
  } catch {
    // Diagnostics only; never break rendering.
  }
}

/** Translate an English UI string; `{name}` placeholders are filled from `vars`. */
export function t(text: string, vars?: Vars): string {
  if (current !== "zh") return fill(text, vars);
  const translated = ZH[text];
  if (translated === undefined) reportMissing(text);
  return fill(translated ?? text, vars);
}

/**
 * Translate a known fixed string from the server into the UI language. Matches store
 * content in their own language, so this maps both ways; free text passes through.
 */
export function st(text: string | null | undefined): string {
  if (!text) return text ?? "";
  return current === "en" ? (SERVER_EN[text] ?? text) : (SERVER_ZH[text] ?? text);
}

/** BCP 47 locale for number and date formatting. */
export const locale = (): string => (current === "zh" ? "zh-CN" : "en-US");
