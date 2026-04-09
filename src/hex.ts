import Phaser from "phaser";

// --- Hex layout constants (pointy-top, odd-r offset) ---
export const HEX_SIZE = 20;
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;

export const COLS = 20;
export const ROWS = 20;

// --- Biome definitions ---
import { biomes } from "./theme";

export const BIOME_COLORS = biomes;

export type BiomeType = keyof typeof BIOME_COLORS;

// --- Hex neighbor math (odd-r offset) ---
// Directions: 0=NE, 1=E, 2=SE, 3=SW, 4=W, 5=NW
const NEIGHBORS_EVEN = [
	[0, -1],
	[1, 0],
	[0, 1],
	[-1, 1],
	[-1, 0],
	[-1, -1],
];
const NEIGHBORS_ODD = [
	[1, -1],
	[1, 0],
	[1, 1],
	[0, 1],
	[-1, 0],
	[0, -1],
];

function getNeighborOffsets(row: number) {
	return row % 2 === 0 ? NEIGHBORS_EVEN : NEIGHBORS_ODD;
}

export function inBounds(col: number, row: number) {
	return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

export function getNeighbors(col: number, row: number) {
	const offsets = getNeighborOffsets(row);
	const result: Array<{ col: number; row: number; dir: number }> = [];
	for (let dir = 0; dir < 6; dir++) {
		const nc = col + offsets[dir][0];
		const nr = row + offsets[dir][1];
		if (inBounds(nc, nr)) result.push({ col: nc, row: nr, dir });
	}
	return result;
}

export function directionTo(
	fromCol: number,
	fromRow: number,
	toCol: number,
	toRow: number,
): number {
	const offsets = getNeighborOffsets(fromRow);
	const dc = toCol - fromCol;
	const dr = toRow - fromRow;
	for (let dir = 0; dir < 6; dir++) {
		if (offsets[dir][0] === dc && offsets[dir][1] === dr) return dir;
	}
	return -1;
}

// --- Hex distance (BFS for odd-r offset) ---
export function hexDistance(c1: number, r1: number, c2: number, r2: number): number {
	if (c1 === c2 && r1 === r2) return 0;
	const visited = new Set<string>();
	let frontier = [{ col: c1, row: r1 }];
	visited.add(`${c1},${r1}`);
	let dist = 0;
	while (frontier.length > 0) {
		dist++;
		const next: typeof frontier = [];
		for (const { col, row } of frontier) {
			const offsets = row % 2 === 0 ? NEIGHBORS_EVEN : NEIGHBORS_ODD;
			for (const [dc, dr] of offsets) {
				const nc = col + dc;
				const nr = row + dr;
				if (nc === c2 && nr === r2) return dist;
				const key = `${nc},${nr}`;
				if (!visited.has(key) && nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) {
					visited.add(key);
					next.push({ col: nc, row: nr });
				}
			}
		}
		frontier = next;
	}
	return Infinity;
}

// --- Hex geometry ---
export function getHexCenter(col: number, row: number) {
	return {
		x: col * HEX_WIDTH + (row % 2 === 1 ? HEX_WIDTH / 2 : 0),
		y: row * HEX_HEIGHT * 0.75,
	};
}

export function getHexPoints(cx: number, cy: number): Phaser.Geom.Point[] {
	const points: Phaser.Geom.Point[] = [];
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 180) * (60 * i - 30);
		points.push(
			new Phaser.Geom.Point(cx + HEX_SIZE * Math.cos(angle), cy + HEX_SIZE * Math.sin(angle)),
		);
	}
	return points;
}

export function edgeMidpoint(cx: number, cy: number, dir: number) {
	const v1 = (dir + 5) % 6;
	const v2 = dir;
	const a1 = (Math.PI / 180) * (60 * v1 - 30);
	const a2 = (Math.PI / 180) * (60 * v2 - 30);
	return {
		x: cx + (HEX_SIZE * (Math.cos(a1) + Math.cos(a2))) / 2,
		y: cy + (HEX_SIZE * (Math.sin(a1) + Math.sin(a2))) / 2,
	};
}

// --- Color helpers ---
export function adjustBrightness(color: number, factor: number): number {
	const clamp = (v: number) => Math.max(0, Math.min(255, v));
	const r = clamp(Math.floor(((color >> 16) & 0xff) * factor));
	const g = clamp(Math.floor(((color >> 8) & 0xff) * factor));
	const b = clamp(Math.floor((color & 0xff) * factor));
	return (r << 16) | (g << 8) | b;
}

export function varyColor(base: number, amount: number): number {
	const r = ((base >> 16) & 0xff) + Math.floor((Math.random() - 0.5) * amount);
	const g = ((base >> 8) & 0xff) + Math.floor((Math.random() - 0.5) * amount);
	const b = (base & 0xff) + Math.floor((Math.random() - 0.5) * amount);
	const clamp = (v: number) => Math.max(0, Math.min(255, v));
	return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
}

// Brightness multiplier per elevation level — higher = lighter
export const LEVEL_BRIGHTNESS: Record<number, number> = {
	0: 0.75,
	1: 0.85,
	2: 0.95,
	3: 1.1,
	4: 1.0,
};
