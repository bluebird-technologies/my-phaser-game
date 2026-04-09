/**
 * visibility.ts — Fog-of-war visibility computation.
 *
 * Computes which tiles are visible to a given team based on
 * each entity's position and visibility range.
 */

import { getNeighbors } from "./hex";
import { Entity } from "./entities";

/**
 * Returns the set of tile keys ("col,row") visible to the given team.
 * Uses BFS from each entity up to its visibility range.
 */
export function computeVisibleTiles(entities: Entity[], team: number): Set<string> {
	const visible = new Set<string>();

	for (const e of entities) {
		if (e.team !== team) continue;
		const range = e.config.visibility;

		// BFS from entity position
		let frontier = [{ col: e.col, row: e.row }];
		const visited = new Set<string>();
		visited.add(`${e.col},${e.row}`);
		visible.add(`${e.col},${e.row}`);

		for (let dist = 0; dist < range; dist++) {
			const next: typeof frontier = [];
			for (const { col, row } of frontier) {
				for (const n of getNeighbors(col, row)) {
					const key = `${n.col},${n.row}`;
					if (!visited.has(key)) {
						visited.add(key);
						visible.add(key);
						next.push({ col: n.col, row: n.row });
					}
				}
			}
			frontier = next;
		}
	}

	return visible;
}
