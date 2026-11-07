import { useCallback, useEffect, useState } from "react";
import { locale, st, t } from "./i18n";

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const error = (await response.json()) as {
      detail?: string | { msg: string }[];
    };
    throw new Error(
      typeof error.detail === "string"
        ? st(error.detail)
        : error.detail?.map((item) => item.msg).join("; ") || t("Request failed"),
    );
  }
  return response.json() as Promise<T>;
}

export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => setData(null), [path]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((cause: Error) => {
        if (cause.name !== "AbortError") setError(cause.message);
      });
    return () => controller.abort();
  }, [path, version]);
  return { data, setData, error, reload };
}

export const money = (value: number, compact = false): string => {
  const amount = value / 100;
  if (compact && Math.abs(amount) >= 10000)
    return locale() === "zh-CN"
      ? `${(amount / 10000).toFixed(1)}万`
      : `${(amount / 1000).toFixed(1)}k`;
  return amount.toLocaleString(locale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};
export const signedMoney = (value: number): string =>
  `${value >= 0 ? "+" : "−"}¥${money(Math.abs(value))}`;
export const count = (value: number): string =>
  value.toLocaleString(locale());
export const date = (value: string): string =>
  new Date(value).toLocaleDateString(locale(), {
    month: "2-digit",
    day: "2-digit",
  });
