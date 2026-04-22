import { BiomeType, HEX_WIDTH, getHexCenter, getNeighbors } from "./hex";

// Movement costs:
//   flat move                    = 1
//   downhill (lower lvl)         = 0.5
//   uphill (higher lvl)          = 2
//   entering a forest            = 2 (minimum)
//   entering a river (from land) = 3
//   river → river downstream     = 1
//   river → river upstream       = 2
//   mountain / lake              = impassable
export const MAX_MOVE = 5;

export interface PathResult {
	tiles: Array<{ col: number; row: number }>;
	costs: number[]; // cumulative cost at each tile (costs[0] = 0)
	totalCost: number;
	reachable: boolean;
}

export function findPath(
	startCol: number,
	startRow: number,
	goalCol: number,
	goalRow: number,
	biomeMap: BiomeType[][],
	levelMap: number[][],
	riverTileSet: Set<string>,
	forestTileSet: Set<string>,
	riverFlow?: Map<string, Set<string>>,
): PathResult | null {
	const key = (c: number, r: number) => `${c},${r}`;
	const startKey = key(startCol, startRow);
	const goalKey = key(goalCol, goalRow);

	if (startKey === goalKey) {
		return {
			tiles: [{ col: startCol, row: startRow }],
			costs: [0],
			totalCost: 0,
			reachable: true,
		};
	}

	function h(col: number, row: number) {
		const a = getHexCenter(col, row);
		const b = getHexCenter(goalCol, goalRow);
		const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
		return (dist / HEX_WIDTH) * 0.5;
	}

	function moveCost(fromCol: number, fromRow: number, toCol: number, toRow: number): number {
		const toBiome = biomeMap[toRow][toCol];
		if (toBiome === "mountain" || toBiome === "lake") return Infinity;

		const fromKey = `${fromCol},${fromRow}`;
		const toKey = `${toCol},${toRow}`;
		const fromIsRiver = riverTileSet.has(fromKey);
		const toIsRiver = riverTileSet.has(toKey);

		// River-to-river movement: cheap downstream, expensive upstream.
		if (fromIsRiver && toIsRiver && riverFlow) {
			const downstream = riverFlow.get(fromKey);
			if (downstream?.has(toKey)) return 1; // downstream
			return 2; // upstream (or cross-river)
		}

		// Entering a river from land: keep existing cost (3).
		if (toIsRiver) return 3;

		const fromLevel = levelMap[fromRow][fromCol];
		const toLevel = levelMap[toRow][toCol];

		let cost: number;
		if (toLevel < fromLevel) cost = 0.5;
		else if (toLevel > fromLevel) cost = 2;
		else cost = 1;

		if (forestTileSet.has(toKey)) cost = Math.max(cost, 2);

		return cost;
	}

	const gScore = new Map<string, number>();
	const fScore = new Map<string, number>();
	const cameFrom = new Map<string, string>();

	gScore.set(startKey, 0);
	fScore.set(startKey, h(startCol, startRow));

	const open: Array<{ col: number; row: number; f: number }> = [
		{ col: startCol, row: startRow, f: fScore.get(startKey)! },
	];
	const closed = new Set<string>();

	while (open.length > 0) {
		open.sort((a, b) => a.f - b.f);
		const current = open.shift()!;
		const curKey = key(current.col, current.row);

		if (curKey === goalKey) {
			const tiles: Array<{ col: number; row: number }> = [];
			const keys: string[] = [];
			let k: string | undefined = goalKey;
			while (k) {
				keys.push(k);
				const [c, r] = k.split(",").map(Number);
				tiles.push({ col: c, row: r });
				k = cameFrom.get(k);
			}
			tiles.reverse();
			keys.reverse();

			const costs = [0];
			for (let i = 1; i < tiles.length; i++) {
				costs.push(gScore.get(keys[i])!);
			}

			const totalCost = costs[costs.length - 1];
			return { tiles, costs, totalCost, reachable: Math.floor(MAX_MOVE - totalCost) >= 0 };
		}

		closed.add(curKey);

		for (const n of getNeighbors(current.col, current.row)) {
			const nKey = key(n.col, n.row);
			if (closed.has(nKey)) continue;

			const cost = moveCost(current.col, current.row, n.col, n.row);
			if (cost === Infinity) continue;

			const tentG = (gScore.get(curKey) ?? Infinity) + cost;
			if (tentG < (gScore.get(nKey) ?? Infinity)) {
				cameFrom.set(nKey, curKey);
				gScore.set(nKey, tentG);
				const f = tentG + h(n.col, n.row);
				fScore.set(nKey, f);
				if (!open.find((o) => o.col === n.col && o.row === n.row)) {
					open.push({ col: n.col, row: n.row, f });
				}
			}
		}
	}

	return null;
}
