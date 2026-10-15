/** Short-lived browser cache for Copilot answers, so a reload or page change does not drop them. */
export const COPILOT_TTL_MS = 30 * 60_000;
const key = (id: string) => `wt-copilot:${id}`;

export function saveCopilot(id: string, data: unknown) {
  try { sessionStorage.setItem(key(id), JSON.stringify({ at: Date.now(), data })); } catch { /* storage unavailable */ }
}

export function loadCopilot<T>(id: string): { at: number; data: T } | null {
  try {
    const raw = sessionStorage.getItem(key(id));
    if (!raw) return null;
    const v = JSON.parse(raw) as { at: number; data: T };
    if (Date.now() - v.at > COPILOT_TTL_MS) { sessionStorage.removeItem(key(id)); return null; }
    return v;
  } catch { return null; }
}

export function clearCopilot(id?: string) {
  try {
    if (id) { sessionStorage.removeItem(key(id)); return; }
    for (const k of Object.keys(sessionStorage)) if (k.startsWith("wt-copilot:")) sessionStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}
