import { createNoise2D } from "simplex-noise";
import {
	BiomeType,
	COLS,
	ROWS,
	getNeighbors,
	getHexCenter,
	directionTo,
	edgeMidpoint,
} from "./hex";
import { ui } from "./theme";
import { SpecialResourceId, SPECIAL_RESOURCES, SpecialResourceConfig } from "./economy";

const GFX_RIVER = ui.river;

// --- Noise helpers ---
function fbm(
	noise: (x: number, y: number) => number,
	x: number,
	y: number,
	octaves: number,
	lacunarity: number,
	gain: number,
): number {
	let value = 0,
		amplitude = 1,
		frequency = 1,
		max = 0;
	for (let i = 0; i < octaves; i++) {
		value += amplitude * noise(x * frequency, y * frequency);
		max += amplitude;
		amplitude *= gain;
		frequency *= lacunarity;
	}
	return value / max;
}

// --- Biome & elevation classification ---
function classifyBiome(elevation: number, moisture: number): BiomeType {
	if (elevation > 0.45) return "mountain";
	if (moisture > 0.3) return "lake";
	if (moisture < -0.1) return "desert";
	return "grassland";
}

function elevationLevel(elevation: number): number {
	if (elevation > 0.45) return 4;
	if (elevation > 0.15) return 3;
	if (elevation > -0.1) return 2;
	if (elevation > -0.35) return 1;
	return 0;
}

// --- World data ---
export interface WorldData {
	biomeMap: BiomeType[][];
	elevMap: number[][];
	levelMap: number[][];
	rivers: River[];
	riverTiles: Set<string>;
	/** For each river tile, the set of adjacent river tiles that are downstream. */
	riverFlow: Map<string, Set<string>>;
	forestTiles: Set<string>;
	resourceMap: Map<string, SpecialResourceId>;
}

export function generateWorld(): WorldData {
	const elevNoise = createNoise2D();
	const moistNoise = createNoise2D();
	const SCALE = 0.07;

	const biomeMap: BiomeType[][] = [];
	const elevMap: number[][] = [];
	const levelMap: number[][] = [];

	for (let row = 0; row < ROWS; row++) {
		biomeMap[row] = [];
		elevMap[row] = [];
		levelMap[row] = [];
		for (let col = 0; col < COLS; col++) {
			const elevation = fbm(elevNoise, col * SCALE, row * SCALE, 5, 2.0, 0.5);
			const moisture = fbm(moistNoise, col * SCALE + 500, row * SCALE + 500, 4, 2.0, 0.5);
			const biome = classifyBiome(elevation, moisture);
			elevMap[row][col] = elevation;
			biomeMap[row][col] = biome;
			levelMap[row][col] = elevationLevel(elevation);
		}
	}

	// Flatten connected lake clusters to a single elevation
	const visited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			if (biomeMap[row][col] !== "lake" || visited[row][col]) continue;

			const cluster: Array<{ col: number; row: number }> = [];
			const stack: Array<{ col: number; row: number }> = [{ col, row }];
			visited[row][col] = true;
			let minElev = elevMap[row][col];

			while (stack.length > 0) {
				const cur = stack.pop()!;
				cluster.push(cur);
				if (elevMap[cur.row][cur.col] < minElev) {
					minElev = elevMap[cur.row][cur.col];
				}
				for (const n of getNeighbors(cur.col, cur.row)) {
					if (!visited[n.row][n.col] && biomeMap[n.row][n.col] === "lake") {
						visited[n.row][n.col] = true;
						stack.push(n);
					}
				}
			}

			const level = elevationLevel(minElev);
			for (const tile of cluster) {
				elevMap[tile.row][tile.col] = minElev;
				levelMap[tile.row][tile.col] = level;
			}
		}
	}

	// Generate rivers
	const rivers = generateRivers(biomeMap, elevMap);
	const riverTiles = new Set<string>();
	for (const { path } of rivers) {
		for (const t of path) riverTiles.add(`${t.col},${t.row}`);
	}

	// For each river tile, record which adjacent river tiles are downstream.
	// path[0] → path[N] is downstream, so tile at index i has downstream
	// neighbor at index i+1.
	const riverFlow = new Map<string, Set<string>>();
	for (const { path } of rivers) {
		for (let i = 0; i < path.length - 1; i++) {
			const from = `${path[i].col},${path[i].row}`;
			const to = `${path[i + 1].col},${path[i + 1].row}`;
			let ds = riverFlow.get(from);
			if (!ds) {
				ds = new Set<string>();
				riverFlow.set(from, ds);
			}
			ds.add(to);
		}
	}

	// Generate forest tiles (~40% of grassland; rivers can run through forests)
	const forestTiles = new Set<string>();
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			if (biomeMap[row][col] !== "grassland") continue;
			if (Math.random() > 0.4) continue;
			forestTiles.add(`${col},${row}`);
		}
	}

	// Generate special resources
	const resourceMap = generateResources(biomeMap, riverTiles, forestTiles);

	return { biomeMap, elevMap, levelMap, rivers, riverTiles, riverFlow, forestTiles, resourceMap };
}

// --- Special resource placement ---
function generateResources(
	biomeMap: BiomeType[][],
	riverTiles: Set<string>,
	forestTiles: Set<string>,
): Map<string, SpecialResourceId> {
	const resourceMap = new Map<string, SpecialResourceId>();
	const allResources = Object.values(SPECIAL_RESOURCES) as SpecialResourceConfig[];

	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			const key = `${col},${row}`;
			const biome = biomeMap[row][col];
			const hasRiver = riverTiles.has(key);
			const hasForest = forestTiles.has(key);

			// Shuffle candidates so placement isn't biased toward alphabetical order
			const candidates = allResources.filter((r) => {
				if (!r.biomes.includes(biome)) return false;
				if (r.requiresForest && !hasForest) return false;
				if (r.requiresRiver && !hasRiver) return false;
				return true;
			});

			for (const res of candidates) {
				if (Math.random() < res.rarity) {
					resourceMap.set(key, res.id);
					break; // one resource per tile
				}
			}
		}
	}

	return resourceMap;
}

// --- River generation ---
export interface River {
	path: Array<{ col: number; row: number }>;
	lakeEnd: "start" | "end";
}

function generateRivers(biomeMap: BiomeType[][], elevMap: number[][]): River[] {
	const rivers: River[] = [];
	const used = new Set<string>();
	const key = (c: number, r: number) => `${c},${r}`;

	function isTraversable(col: number, row: number) {
		const b = biomeMap[row][col];
		return b === "grassland" || b === "desert";
	}

	interface Shore {
		col: number;
		row: number;
		lakeElev: number;
	}
	const inflowByLake = new Map<number, Shore[]>();
	const outflowByLake = new Map<number, Shore[]>();

	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			if (!isTraversable(col, row)) continue;
			for (const n of getNeighbors(col, row)) {
				if (biomeMap[n.row][n.col] === "lake") {
					const lakeElev = elevMap[n.row][n.col];
					const lakeKey = Math.round(lakeElev * 10000);
					const shore: Shore = { col, row, lakeElev };
					if (elevMap[row][col] > lakeElev) {
						if (!inflowByLake.has(lakeKey)) inflowByLake.set(lakeKey, []);
						inflowByLake.get(lakeKey)!.push(shore);
					} else {
						if (!outflowByLake.has(lakeKey)) outflowByLake.set(lakeKey, []);
						outflowByLake.get(lakeKey)!.push(shore);
					}
					break;
				}
			}
		}
	}

	const shuffle = <T>(arr: T[]) => {
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
	};

	const allLakeKeys = new Set([...inflowByLake.keys(), ...outflowByLake.keys()]);
	const guaranteedShores: Array<Shore & { type: "in" | "out" }> = [];
	const extraInflows: Shore[] = [];
	const extraOutflows: Shore[] = [];

	for (const lakeKey of allLakeKeys) {
		const inflows = inflowByLake.get(lakeKey) ?? [];
		const outflows = outflowByLake.get(lakeKey) ?? [];
		shuffle(inflows);
		shuffle(outflows);

		if (inflows.length > 0) {
			guaranteedShores.push({ ...inflows[0], type: "in" });
			extraInflows.push(...inflows.slice(1));
		} else if (outflows.length > 0) {
			guaranteedShores.push({ ...outflows[0], type: "out" });
			extraOutflows.push(...outflows.slice(1));
		}

		if (inflows.length > 0) {
			extraOutflows.push(...outflows);
		} else {
			extraOutflows.push(...outflows.slice(1));
		}
	}

	shuffle(guaranteedShores);
	shuffle(extraInflows);
	shuffle(extraOutflows);

	function traceDownhill(start: { col: number; row: number }, maxLen: number) {
		const path = [{ col: start.col, row: start.row }];
		used.add(key(start.col, start.row));
		let cur = start;

		for (let step = 0; step < maxLen; step++) {
			const candidates = getNeighbors(cur.col, cur.row).filter((n) => {
				if (used.has(key(n.col, n.row))) return false;
				if (!isTraversable(n.col, n.row)) return false;
				return elevMap[n.row][n.col] <= elevMap[cur.row][cur.col] + 0.02;
			});
			if (candidates.length === 0) break;
			candidates.sort((a, b) => elevMap[a.row][a.col] - elevMap[b.row][b.col]);
			const pick = candidates[Math.floor(Math.random() * Math.min(2, candidates.length))];
			path.push({ col: pick.col, row: pick.row });
			used.add(key(pick.col, pick.row));
			cur = pick;
		}
		return path;
	}

	function traceUphill(start: { col: number; row: number }, maxLen: number) {
		const path = [{ col: start.col, row: start.row }];
		used.add(key(start.col, start.row));
		let cur = start;

		for (let step = 0; step < maxLen; step++) {
			const candidates = getNeighbors(cur.col, cur.row).filter((n) => {
				if (used.has(key(n.col, n.row))) return false;
				if (!isTraversable(n.col, n.row)) return false;
				return elevMap[n.row][n.col] >= elevMap[cur.row][cur.col] - 0.02;
			});
			if (candidates.length === 0) break;
			candidates.sort((a, b) => elevMap[b.row][b.col] - elevMap[a.row][a.col]);
			const pick = candidates[Math.floor(Math.random() * Math.min(2, candidates.length))];
			path.push({ col: pick.col, row: pick.row });
			used.add(key(pick.col, pick.row));
			cur = pick;
		}
		return path;
	}

	function tryRiver(shore: Shore, type: "in" | "out"): boolean {
		if (used.has(key(shore.col, shore.row))) return false;
		if (type === "in") {
			const path = traceUphill(shore, 8 + Math.floor(Math.random() * 14));
			if (path.length >= 3) {
				path.reverse();
				rivers.push({ path, lakeEnd: "end" });
				return true;
			}
		} else {
			const path = traceDownhill(shore, 10 + Math.floor(Math.random() * 18));
			if (path.length >= 3) {
				rivers.push({ path, lakeEnd: "start" });
				return true;
			}
		}
		return false;
	}

	for (const shore of guaranteedShores) tryRiver(shore, shore.type);

	const maxExtra = 30;
	let extras = 0;
	for (const shore of extraInflows) {
		if (extras >= maxExtra) break;
		if (tryRiver(shore, "in")) extras++;
	}
	for (const shore of extraOutflows) {
		if (extras >= maxExtra) break;
		if (tryRiver(shore, "out")) extras++;
	}

	return rivers;
}

// --- Draw rivers on a graphics layer ---
/**
 * Deterministic per-tile random using a simple hash of col+row. Returns a
 * value in [0, 1) so we get consistent "wobble" that doesn't change on
 * re-render.
 */
function tileRand(col: number, row: number, seed = 0): number {
	let h = ((col * 374761 + row * 668265 + seed * 93481) | 0) & 0x7fffffff;
	h = ((h >> 16) ^ h) * 0x45d9f3b;
	h = ((h >> 16) ^ h) * 0x45d9f3b;
	h = (h >> 16) ^ h;
	return (h & 0xffff) / 0x10000;
}

export function drawRivers(
	graphics: Phaser.GameObjects.Graphics,
	rivers: River[],
	biomeMap: BiomeType[][],
) {
	for (const { path, lakeEnd } of rivers) {
		const lakeTile = lakeEnd === "end" ? path[path.length - 1] : path[0];
		const lakeNeighbor = getNeighbors(lakeTile.col, lakeTile.row).find(
			(n) => biomeMap[n.row][n.col] === "lake",
		);
		const lakeDir = lakeNeighbor
			? directionTo(lakeTile.col, lakeTile.row, lakeNeighbor.col, lakeNeighbor.row)
			: -1;

		// Collect all segment points along the river so we can draw a
		// single varied-width polyline with wobble.
		const allPts: Array<{ x: number; y: number }> = [];

		for (let i = 0; i < path.length; i++) {
			const tile = path[i];
			const { x: cx, y: cy } = getHexCenter(tile.col, tile.row);

			let entryX: number, entryY: number;
			let exitX: number, exitY: number;

			if (i === 0) {
				if (lakeEnd === "start" && lakeDir >= 0) {
					const em = edgeMidpoint(cx, cy, lakeDir);
					entryX = em.x;
					entryY = em.y;
				} else {
					entryX = cx;
					entryY = cy;
				}
			} else {
				const prev = path[i - 1];
				const dir = directionTo(tile.col, tile.row, prev.col, prev.row);
				const em = edgeMidpoint(cx, cy, dir);
				entryX = em.x;
				entryY = em.y;
			}

			if (i === path.length - 1) {
				if (lakeEnd === "end" && lakeDir >= 0) {
					const em = edgeMidpoint(cx, cy, lakeDir);
					exitX = em.x;
					exitY = em.y;
				} else {
					exitX = cx;
					exitY = cy;
				}
			} else {
				const next = path[i + 1];
				const dir = directionTo(tile.col, tile.row, next.col, next.row);
				const em = edgeMidpoint(cx, cy, dir);
				exitX = em.x;
				exitY = em.y;
			}

			// Add wobble to the control point so the river bends
			// irregularly through each tile instead of a perfect arc.
			const wobbleX = (tileRand(tile.col, tile.row, 0) - 0.5) * 6;
			const wobbleY = (tileRand(tile.col, tile.row, 1) - 0.5) * 6;

			if (i > 0 && i < path.length - 1) {
				const curve = new Phaser.Curves.QuadraticBezier(
					new Phaser.Math.Vector2(entryX, entryY),
					new Phaser.Math.Vector2(cx + wobbleX, cy + wobbleY),
					new Phaser.Math.Vector2(exitX, exitY),
				);
				const pts = curve.getPoints(8);
				for (const p of pts) allPts.push(p);
			} else {
				allPts.push({ x: entryX, y: entryY });
				allPts.push({ x: exitX, y: exitY });
			}
		}

		if (allPts.length < 2) continue;

		// Draw the main river line with slight width variation.
		graphics.lineStyle(3, GFX_RIVER, 0.9);
		graphics.beginPath();
		graphics.moveTo(allPts[0].x, allPts[0].y);
		for (let p = 1; p < allPts.length; p++) graphics.lineTo(allPts[p].x, allPts[p].y);
		graphics.strokePath();

		// Draw flow-direction chevrons along the river at regular
		// intervals — small ">" marks pointing downstream.
		const CHEVRON_SPACING = 30; // world units between markers
		let distSinceChevron = CHEVRON_SPACING * 0.6; // offset first one
		for (let p = 1; p < allPts.length; p++) {
			const dx = allPts[p].x - allPts[p - 1].x;
			const dy = allPts[p].y - allPts[p - 1].y;
			const segLen = Math.sqrt(dx * dx + dy * dy);
			distSinceChevron += segLen;
			if (distSinceChevron >= CHEVRON_SPACING && segLen > 0.1) {
				distSinceChevron = 0;
				const mx = (allPts[p].x + allPts[p - 1].x) / 2;
				const my = (allPts[p].y + allPts[p - 1].y) / 2;
				const nx = dx / segLen;
				const ny = dy / segLen;
				const sz = 3;
				// Two short lines forming a ">" chevron
				graphics.lineStyle(1.5, GFX_RIVER, 0.6);
				graphics.beginPath();
				graphics.moveTo(mx - nx * sz - ny * sz, my - ny * sz + nx * sz);
				graphics.lineTo(mx, my);
				graphics.lineTo(mx - nx * sz + ny * sz, my - ny * sz - nx * sz);
				graphics.strokePath();
			}
		}
	}
}
