/** Shown on the landing page. Add names here; an empty list shows only the team name. */
export const TEAM_NAME = "Welcome World";
export const TEAM_MEMBERS: { name: string; role: string }[] = [];
/** Public repository, shown in the footer once it exists. */
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "";
