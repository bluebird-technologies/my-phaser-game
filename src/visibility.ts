/**
 * visibility.ts — Fog-of-war visibility computation.
 *
 * Terrain-aware: mountains and forests block line of sight
 * unless the viewer is on higher elevation.
 */

import { BiomeType, getNeighbors } from "./hex";
import { Entity } from "./entities";

/**
 * Returns the set of tile keys ("col,row") visible to the given team.
 *
 * Visibility rules per entity:
 * - All tiles within range 1 (adjacent) are always visible.
 * - Tiles at range 2+ are visible only if the intermediate tile
 *   does NOT block line of sight, OR the entity is on higher ground.
 * - Blocking tiles: mountains and forests.
 */
export function computeVisibleTiles(
	entities: Entity[],
	team: number,
	levelMap: number[][],
	biomeMap: BiomeType[][],
	forestTiles: Set<string>,
): Set<string> {
	const visible = new Set<string>();

	for (const e of entities) {
		if (e.team !== team) continue;
		const range = e.config.visibility;
		const entityLevel = levelMap[e.row][e.col];

		// BFS tracking distance and whether LOS is blocked
		interface Node {
			col: number;
			row: number;
			dist: number;
			blocked: boolean; // was the previous tile a blocker?
		}

		const visited = new Set<string>();
		const start = `${e.col},${e.row}`;
		visited.add(start);
		visible.add(start);

		let frontier: Node[] = [{ col: e.col, row: e.row, dist: 0, blocked: false }];

		while (frontier.length > 0) {
			const next: Node[] = [];
			for (const node of frontier) {
				if (node.dist >= range) continue;

				for (const n of getNeighbors(node.col, node.row)) {
					const key = `${n.col},${n.row}`;
					if (visited.has(key)) continue;
					visited.add(key);

					const nLevel = levelMap[n.row][n.col];
					const nBiome = biomeMap[n.row][n.col];
					const hasForest = forestTiles.has(key);

					// If previous tile blocked LOS, can't see past it
					if (node.blocked) continue;

					visible.add(key);

					// This tile blocks LOS for tiles beyond if:
					// - it's a mountain or forest, OR higher than the entity
					const blocksVision = nBiome === "mountain" || hasForest || nLevel > entityLevel;
					next.push({
						col: n.col,
						row: n.row,
						dist: node.dist + 1,
						blocked: blocksVision,
					});
				}
			}
			frontier = next;
		}
	}

	return visible;
}
