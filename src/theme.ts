/**
 * theme.ts — Centralized color and style definitions.
 *
 * All colors are written as hex strings for readability, but stored
 * as Phaser-compatible numbers via gfx() at module load.
 *
 * CSS-only values (rgba, panel styles) remain as strings.
 *
 * Designers: edit the hex strings here, they propagate everywhere.
 */

// ─── Hex string → Phaser numeric color ───
export function gfx(hex: string): number {
	return parseInt(hex.replace("#", ""), 16);
}

// ─── Teams ───
export const teams = {
	blue: gfx("#3b82f6"),
	red: gfx("#ef4444"),
} as const;

// ─── Biome tile colors ───
export const biomes = {
	mountain: gfx("#3d3d4a"),
	grassland: gfx("#588157"),
	lake: gfx("#219ebc"),
	desert: gfx("#e9c46a"),
} as const;

// ─── Forest tree colors ───
export const forest = {
	darkGreen: gfx("#1b4332"),
	mediumGreen: gfx("#2d6a4f"),
	lightGreen: gfx("#245e3a"),
} as const;

// ─── Path / movement line colors ───
export const pathColors = {
	reachable: gfx("#4ade80"),
	unreachable: gfx("#f87171"),
} as const;

// ─── General canvas colors ───
export const ui = {
	white: gfx("#ffffff"),
	black: gfx("#000000"),
	river: gfx("#0077b6"),
} as const;

// ─── Hillshade ───
export const hillshade = {
	highlight: gfx("#ffffff"),
	shadow: gfx("#000000"),
} as const;

// ─── Tile/civilization metric colors (CSS strings for DOM) ───
// Spaced apart on the color wheel to maximize distinction:
//   resources = green, growth = blue, happiness = yellow, knowledge = purple
export const metrics = {
	resources: "#22c55e", // emerald-500 — pure green
	growth: "#0ea5e9", // sky-500 — clean blue
	happiness: "#eab308", // yellow-500 — golden yellow
	knowledge: "#a855f7", // purple-500 — saturated violet
} as const;

// Same metric palette as Phaser numeric colors (for canvas rendering)
export const metricsGfx = {
	resources: gfx("#22c55e"),
	growth: gfx("#0ea5e9"),
	happiness: gfx("#eab308"),
	knowledge: gfx("#a855f7"),
} as const;

// ─── Stat indicator colors (CSS strings for DOM) ───
export const stats = {
	healthHigh: "#4ade80",
	healthMid: "#facc15",
	healthLow: "#f87171",
	staminaHigh: "#60a5fa",
	staminaMid: "#facc15",
	staminaEmpty: "#666666",
	attackReady: "#f59e0b",
	attackSpent: "#666666",
} as const;

// ─── CSS panel / overlay colors (strings for DOM) ───
export const panel = {
	background: "rgba(10, 10, 20, 0.85)",
	border: "rgba(255, 255, 255, 0.15)",
	borderTarget: "rgba(248, 113, 113, 0.4)",
	text: "#ffffff",
	textMuted: "#888888",
	hoverBg: "rgba(255, 255, 255, 0.15)",
	hoverBorder: "rgba(255, 255, 255, 0.5)",
	activeBg: "rgba(74, 222, 128, 0.3)",
	activeBorder: "#4ade80",
	focusRing: "rgba(96, 165, 250, 0.6)",
	separator: "#888888",
} as const;

// ─── Team CSS colors (for DOM usage) ───
export const teamsCss = {
	blue: "#3b82f6",
	red: "#ef4444",
} as const;

// ─── Attack cursor color (CSS string for canvas 2d context) ───
export const cursorAttackColor = "#f87171";
