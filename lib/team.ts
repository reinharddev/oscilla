/** Shown on the landing page. Empty links are hidden; fill them in when known. */
export const TEAM_NAME = "Welcome World";

export type TeamMember = { name: string; website: string; linkedin: string; github: string };

export const TEAM_MEMBERS: TeamMember[] = [
  {
    name: "Reinhard Dave",
    website: "https://reinhard.my.id",
    linkedin: "https://www.linkedin.com/in/reinhard-dave",
    github: "https://github.com/reinharddev",
  },
  { name: "Chandra Wijaya Yeo", website: "", linkedin: "", github: "" },
  { name: "Lilian Angelina", website: "", linkedin: "", github: "" },
];

/** Public repository, shown in the footer once it exists. */
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "";
