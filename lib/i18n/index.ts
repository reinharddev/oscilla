import { en, type Key } from "./en";
import { id } from "./id";

export type Lang = "en" | "id";
export type { Key };
export const LANGS: Lang[] = ["en", "id"];
/** English by default: the product is judged and demoed in English; Indonesian is one click away. */
export const DEFAULT_LANG: Lang = "en";
export const LOCALE_COOKIE = "oscilla-locale";
export const LANG_LABEL: Record<Lang, string> = { en: "English", id: "Bahasa Indonesia" };

const dicts: Record<Lang, Record<Key, string>> = { en, id };

export const parseLang = (v: string | null | undefined): Lang => (v === "id" || v === "en" ? v : DEFAULT_LANG);
export const dateLocale = (lang: Lang) => (lang === "id" ? "id-ID" : "en-GB");

export type Params = Record<string, string | number>;

/** Translate a key and fill `{placeholders}`. Works on the server and in the browser. */
export function translate(lang: Lang, key: Key, params?: Params): string {
  const text = dicts[lang][key] ?? dicts.en[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`)) : text;
}

export type T = (key: Key, params?: Params) => string;
export const makeT = (lang: Lang): T => (key, params) => translate(lang, key, params);

export const fmtDateTime = (ts: number | string, lang: Lang) =>
  new Date(ts).toLocaleString(dateLocale(lang), { dateStyle: "medium", timeStyle: "short" });
export const fmtDate = (ts: number | string, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(ts).toLocaleDateString(dateLocale(lang), opts);
export const fmtTime = (ts: number, lang: Lang) => new Date(ts).toLocaleTimeString(dateLocale(lang), { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** A message parameter may refer to another key, so a stored message follows the language shown later. */
export type MsgParams = Record<string, string | number | { k: Key }>;
export function renderMsg(t: T, key: Key, params?: MsgParams): string {
  if (!params) return t(key);
  const resolved: Params = {};
  for (const [k, v] of Object.entries(params)) resolved[k] = typeof v === "object" ? t(v.k) : v;
  return t(key, resolved);
}
