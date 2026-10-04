export type Theme = "day" | "night";

export interface ScenePalette {
  bg: string; ground: string; road: string; slab: string; floor: string; wall: string;
  grid1: string; grid2: string; roadDash: string;
  hemiSky: string; hemiGround: string; hemi: number; ambient: number;
  sun: string; sunIntensity: number; sunPos: [number, number, number];
  zoneOpacity: number; labelBg: string; labelText: string; lamps: boolean;
}

export const PALETTE: Record<Theme, ScenePalette> = {
  day: {
    bg: "#eef1f8", ground: "#e4e9f5", road: "#dde2f0", slab: "#cdd5ec", floor: "#fbfcff", wall: "#f6f7fc",
    grid1: "#dfe5f3", grid2: "#e8ecf7", roadDash: "#ffffff",
    hemiSky: "#ffffff", hemiGround: "#d9def0", hemi: 1.15, ambient: 0.55,
    sun: "#fff4ea", sunIntensity: 1.5, sunPos: [14, 26, 10],
    zoneOpacity: 0.35, labelBg: "rgba(255,255,255,0.92)", labelText: "#2b3150", lamps: false,
  },
  night: {
    bg: "#070b18", ground: "#0a1022", road: "#111a31", slab: "#131b36", floor: "#18213f", wall: "#222c52",
    grid1: "#27336a", grid2: "#1f2a55", roadDash: "#3a4672",
    hemiSky: "#7f95e0", hemiGround: "#121832", hemi: 0.5, ambient: 0.2,
    sun: "#9db2ff", sunIntensity: 0.55, sunPos: [14, 26, 10],
    zoneOpacity: 0.22, labelBg: "rgba(10,16,34,0.92)", labelText: "#e6ebff", lamps: true,
  },
};
