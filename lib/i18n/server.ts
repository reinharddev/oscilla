import { cookies } from "next/headers";
import { LOCALE_COOKIE, makeT, parseLang, type Lang } from "./index";

/** The visitor's language from the cookie; English when nothing has been chosen. */
export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LOCALE_COOKIE)?.value);
}
export async function getT() {
  const lang = await getLang();
  return { lang, t: makeT(lang) };
}
