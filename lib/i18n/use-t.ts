import { useMemo } from "react";
import { useStore } from "../store";
import { makeT, type Lang, type T } from "./index";

/** Translator bound to the language currently chosen in the UI. */
export function useT(): T {
  const lang = useStore((s) => s.locale);
  return useMemo(() => makeT(lang), [lang]);
}
export const useLang = (): Lang => useStore((s) => s.locale);
