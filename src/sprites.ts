/**
 * sprites.ts — All visual / drawing functions.
 *
 * This is the single file that illustrators and animators should edit
 * when replacing procedural graphics with final art assets.
 *
 * Every draw function takes a Phaser.GameObjects.Graphics (or Scene)
 * and pixel coordinates — no game logic lives here.
 */

import Phaser from "phaser";
import {
	COLS,
	ROWS,
	HEX_SIZE,
	HEX_WIDTH,
	HEX_HEIGHT,
	BIOME_COLORS,
	LEVEL_BRIGHTNESS,
	BiomeType,
	getHexCenter,
	getHexPoints,
	getNeighbors,
	adjustBrightness,
	varyColor,
} from "./hex";
import { EntityType, EntityCategory } from "./entities";
import { SpecialResourceId, TileYield } from "./economy";
import { forest, hillshade, ui, pathColors, metricsGfx } from "./theme";

// ─── Pin marker (shared by entities and resources) ───
export const ENTITY_RADIUS = 12;
const PIN_LIFT = 18; // how far the pin head floats above the tile center

/**
 * Draws a map pin: circle head floating above tile, teardrop tail below the head
 * pointing down toward the tile. cx/cy = tile center.
 * Returns the center of the circle head for drawing icons inside.
 */
function drawPin(
	gfx: Phaser.GameObjects.Graphics,
	cx: number,
	cy: number,
	radius: number,
	color: number,
): { hx: number; hy: number } {
	const headY = cy - PIN_LIFT;
	const tipY = headY + radius + radius * 0.5;

	// --- Dark outline (outer halo so pin stands out from any background) ---
	const haloR = radius + 1.5;
	gfx.fillStyle(0x000000, 0.7);
	// Halo tail (slightly larger triangle)
	gfx.fillTriangle(
		cx - radius * 0.5,
		headY + radius * 0.6,
		cx + radius * 0.5,
		headY + radius * 0.6,
		cx,
		tipY + 1.5,
	);
	// Halo head
	gfx.fillCircle(cx, headY, haloR);

	// --- Pin body (colored fill on top of halo) ---
	// Fully opaque so the triangle/circle overlap doesn't double-blend
	// into a visible seam between tail and head.
	gfx.fillStyle(color, 1);
	gfx.fillTriangle(
		cx - radius * 0.35,
		headY + radius * 0.6,
		cx + radius * 0.35,
		headY + radius * 0.6,
		cx,
		tipY,
	);
	gfx.fillCircle(cx, headY, radius);

	return { hx: cx, hy: headY };
}

// ─── Terrain ───

export function drawTerrain(
	gfx: Phaser.GameObjects.Graphics,
	biomeMap: BiomeType[][],
	levelMap: number[][],
	rows: number,
	cols: number,
) {
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const { x, y } = getHexCenter(col, row);
			const biome = biomeMap[row][col];
			const level = levelMap[row][col];
			const baseColor = adjustBrightness(BIOME_COLORS[biome], LEVEL_BRIGHTNESS[level]);
			const color = varyColor(baseColor, 12);
			const points = getHexPoints(x, y);

			gfx.fillStyle(color, 1);
			gfx.beginPath();
			gfx.moveTo(points[0].x, points[0].y);
			for (let i = 1; i < 6; i++) gfx.lineTo(points[i].x, points[i].y);
			gfx.closePath();
			gfx.fillPath();

			// Subtle biome texture
			drawBiomeTexture(gfx, x, y, biome, color);
		}
	}
}

function drawBiomeTexture(
	gfx: Phaser.GameObjects.Graphics,
	cx: number,
	cy: number,
	biome: BiomeType,
	baseColor: number,
) {
	if (biome === "lake") {
		// Wave lines
		const waveColor = adjustBrightness(baseColor, 1.3);
		gfx.lineStyle(1.5, waveColor, 0.5);
		for (let i = 0; i < 4; i++) {
			const wy = cy - 8 + i * 5 + (Math.random() - 0.5) * 2;
			const wx = cx - 10 + Math.random() * 3;
			gfx.beginPath();
			gfx.moveTo(wx, wy);
			gfx.lineTo(wx + 4, wy - 2);
			gfx.lineTo(wx + 8, wy);
			gfx.lineTo(wx + 12, wy - 2);
			gfx.lineTo(wx + 16, wy);
			gfx.strokePath();
		}
	} else if (biome === "grassland") {
		// Grass tufts — pairs of blades
		const bladeColor = adjustBrightness(baseColor, 1.25);
		gfx.lineStyle(1.2, bladeColor, 0.45);
		for (let i = 0; i < 8; i++) {
			const bx = cx + (Math.random() - 0.5) * HEX_WIDTH * 0.6;
			const by = cy + (Math.random() - 0.5) * HEX_HEIGHT * 0.5;
			const h = 3 + Math.random() * 3;
			gfx.beginPath();
			gfx.moveTo(bx - 1, by);
			gfx.lineTo(bx - 2, by - h);
			gfx.strokePath();
			gfx.beginPath();
			gfx.moveTo(bx + 1, by);
			gfx.lineTo(bx + 2, by - h);
			gfx.strokePath();
		}
	} else if (biome === "desert") {
		// Dune ridges
		const duneLight = adjustBrightness(baseColor, 1.12);
		const duneDark = adjustBrightness(baseColor, 0.85);
		gfx.lineStyle(1.5, duneDark, 0.4);
		for (let i = 0; i < 3; i++) {
			const dy = cy - 6 + i * 6 + (Math.random() - 0.5) * 2;
			const dx = cx - 10 + Math.random() * 3;
			gfx.beginPath();
			gfx.moveTo(dx, dy);
			gfx.lineTo(dx + 5, dy - 2.5);
			gfx.lineTo(dx + 10, dy);
			gfx.lineTo(dx + 16, dy - 2);
			gfx.strokePath();
		}
		// Highlight on dune tops
		gfx.lineStyle(1, duneLight, 0.35);
		for (let i = 0; i < 2; i++) {
			const dy = cy - 5 + i * 7 + (Math.random() - 0.5) * 2;
			const dx = cx - 7 + Math.random() * 3;
			gfx.beginPath();
			gfx.moveTo(dx, dy - 2);
			gfx.lineTo(dx + 6, dy - 3);
			gfx.lineTo(dx + 12, dy - 2);
			gfx.strokePath();
		}
	} else if (biome === "mountain") {
		// Rocky ridges
		const rockDark = adjustBrightness(baseColor, 0.65);
		const rockLight = adjustBrightness(baseColor, 1.35);
		gfx.lineStyle(1.5, rockDark, 0.5);
		for (let i = 0; i < 5; i++) {
			const mx = cx + (Math.random() - 0.5) * HEX_WIDTH * 0.55;
			const my = cy + (Math.random() - 0.5) * HEX_HEIGHT * 0.45;
			const len = 4 + Math.random() * 5;
			const angle = Math.random() * Math.PI;
			gfx.beginPath();
			gfx.moveTo(mx, my);
			gfx.lineTo(mx + Math.cos(angle) * len, my + Math.sin(angle) * len);
			gfx.strokePath();
		}
		// Rock face highlights
		gfx.fillStyle(rockLight, 0.3);
		for (let i = 0; i < 4; i++) {
			const rx = cx + (Math.random() - 0.5) * HEX_WIDTH * 0.45;
			const ry = cy + (Math.random() - 0.5) * HEX_HEIGHT * 0.35;
			gfx.fillRect(rx, ry, 2 + Math.random() * 2, 1.5 + Math.random());
		}
	}
}

// ─── Hillshade / cliff edges ───

const SHADE = [0.18, -0.71, -0.88, -0.18, 0.71, 0.88];

export function drawHillshade(
	gfx: Phaser.GameObjects.Graphics,
	levelMap: number[][],
	rows: number,
	cols: number,
) {
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const level = levelMap[row][col];
			const { x: cx, y: cy } = getHexCenter(col, row);
			const points = getHexPoints(cx, cy);

			for (const n of getNeighbors(col, row)) {
				const nLevel = levelMap[n.row][n.col];
				if (nLevel >= level) continue;

				const v1 = (n.dir + 5) % 6;
				const v2 = n.dir;
				const diff = level - nLevel;
				const shade = SHADE[n.dir];

				const color = shade >= 0 ? hillshade.highlight : hillshade.shadow;
				const alpha = Math.min(0.85, Math.abs(shade) * 0.35 * diff);
				const width = diff >= 2 ? 3 : 2;

				gfx.lineStyle(width, color, alpha);
				gfx.beginPath();
				gfx.moveTo(points[v1].x, points[v1].y);
				gfx.lineTo(points[v2].x, points[v2].y);
				gfx.strokePath();
			}
		}
	}
}

// ─── Forest trees ───

/**
 * Generate `count` points inside a hex, spaced at least `minDist` apart
 * (Poisson-disc-style rejection). This prevents clumping so trees look
 * evenly distributed across the tile.
 */
function randomHexPoints(cx: number, cy: number, count: number, minDist = 4) {
	const pts: Array<{ x: number; y: number }> = [];
	const minDist2 = minDist * minDist;
	for (let attempt = 0; attempt < count * 6 && pts.length < count; attempt++) {
		const rx = (Math.random() - 0.5) * HEX_WIDTH;
		const ry = (Math.random() - 0.5) * HEX_HEIGHT * 0.85;
		const ax = Math.abs(rx),
			ay = Math.abs(ry);
		if (ay >= HEX_SIZE - (ax * HEX_SIZE) / (HEX_WIDTH * 0.5)) continue;
		const px = cx + rx;
		const py = cy + ry;
		let tooClose = false;
		for (const q of pts) {
			if ((px - q.x) ** 2 + (py - q.y) ** 2 < minDist2) {
				tooClose = true;
				break;
			}
		}
		if (!tooClose) pts.push({ x: px, y: py });
	}
	return pts;
}

export function drawForest(
	gfx: Phaser.GameObjects.Graphics,
	forestTiles: Set<string>,
	rows: number,
	cols: number,
) {
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			if (!forestTiles.has(`${col},${row}`)) continue;
			const { x: cx, y: cy } = getHexCenter(col, row);

			const pts = randomHexPoints(cx, cy, 33);
			for (const p of pts) {
				const h = 6 + Math.random() * 4;
				const w = 2.5 + Math.random() * 2;
				const green = Math.random() > 0.4 ? forest.darkGreen : forest.mediumGreen;
				gfx.fillStyle(green, 0.85);
				gfx.fillTriangle(
					p.x,
					p.y - h * 0.6,
					p.x - w,
					p.y + h * 0.4,
					p.x + w,
					p.y + h * 0.4,
				);
				gfx.fillStyle(forest.lightGreen, 0.7);
				gfx.fillTriangle(
					p.x,
					p.y - h * 0.4,
					p.x - w * 0.6,
					p.y + h * 0.2,
					p.x + w * 0.6,
					p.y + h * 0.2,
				);
			}
		}
	}
}

// ─── Entity icons (village / worker / warrior) ───

/**
 * Draws an entity on a tile.
 * - Buildings (village) are drawn as flat structures rooted in the tile.
 * - Units (worker, warrior) are drawn as floating pins above the tile.
 * Both can coexist on the same tile.
 */
export function drawEntityIcon(
	gfx: Phaser.GameObjects.Graphics,
	cx: number,
	cy: number,
	teamColor: number,
	icon: EntityType,
) {
	if (icon === "village") {
		drawBuilding(gfx, cx, cy, teamColor, icon);
	} else {
		drawUnitPin(gfx, cx, cy, teamColor, icon);
	}
}

const BUILDING_BADGE_R = 14; // big centered hex inside the tile

/** Building rendered as a large team-colored hex centered in the tile. */
function drawBuilding(
	gfx: Phaser.GameObjects.Graphics,
	cx: number,
	cy: number,
	teamColor: number,
	icon: EntityType,
) {
	// Big team-colored hex badge (centered)
	drawHexBadge(gfx, cx, cy, BUILDING_BADGE_R, teamColor, 0.95);

	if (icon === "village") {
		// House glyph centered (slightly above center to leave room for nested resource)
		const hy = cy - 2;
		gfx.fillStyle(ui.white, 1);
		gfx.fillTriangle(cx - 6, hy - 1, cx, hy - 7, cx + 6, hy - 1);
		gfx.fillRect(cx - 5, hy - 1, 10, 7);
		// Door
		gfx.fillStyle(teamColor, 1);
		gfx.fillRect(cx - 1.5, hy + 2, 3, 4);
	}
}

/** Unit rendered as a floating teardrop pin above the tile. */
function drawUnitPin(
	gfx: Phaser.GameObjects.Graphics,
	cx: number,
	cy: number,
	teamColor: number,
	icon: EntityType,
) {
	const R = ENTITY_RADIUS;
	const { hx, hy } = drawPin(gfx, cx, cy, R, teamColor);

	gfx.lineStyle(2, ui.white, 0.95);

	if (icon === "villager") {
		// Walking figure with a bundle on their back (simple traveler silhouette)
		gfx.fillStyle(ui.white, 0.95);
		// Head
		gfx.fillCircle(hx, hy - 5, 2);
		// Body
		gfx.fillRect(hx - 1, hy - 3, 2, 5);
		// Bundle on back
		gfx.fillRect(hx + 2, hy - 4, 3, 4);
		// Legs
		gfx.lineStyle(1.5, ui.white, 0.95);
		gfx.beginPath();
		gfx.moveTo(hx - 1, hy + 2);
		gfx.lineTo(hx - 2, hy + 6);
		gfx.strokePath();
		gfx.beginPath();
		gfx.moveTo(hx + 1, hy + 2);
		gfx.lineTo(hx + 2, hy + 6);
		gfx.strokePath();
	} else {
		// warrior
		gfx.beginPath();
		gfx.moveTo(hx, hy + 7);
		gfx.lineTo(hx, hy - 8);
		gfx.strokePath();
		gfx.fillStyle(ui.white, 0.95);
		gfx.fillTriangle(hx - 2, hy - 8, hx, hy - 11, hx + 2, hy - 8);
		gfx.beginPath();
		gfx.moveTo(hx - 4, hy + 2);
		gfx.lineTo(hx + 4, hy + 2);
		gfx.strokePath();
	}
}

// ─── Selection ring ───

/**
 * Draws a selection halo behind the selected entity.
 *
 * IMPORTANT: The selection graphics layer must sit BELOW the building/unit
 * layers so that the entity silhouette draws on top of the halo — only the
 * outer edge (the "ring") remains visible, and the entity shape stays intact.
 *
 * - Units: filled teardrop halo matching the pin silhouette (head + tail).
 * - Buildings: hex halo matching the centered building badge.
 */
export function drawSelection(
	gfx: Phaser.GameObjects.Graphics,
	col: number,
	row: number,
	category: EntityCategory,
) {
	const { x, y } = getHexCenter(col, row);

	if (category === "building") {
		// Filled hex halo — outer glow first, then brighter inner, both covered
		// by the building hex on top, leaving a thin outer ring visible.
		const R = BUILDING_BADGE_R;
		fillHex(gfx, x, y, R + 5, ui.white, 0.25);
		fillHex(gfx, x, y, R + 2.5, ui.white, 0.9);
		return;
	}

	// Unit pin: filled teardrop halo matching pin shape (head + tail).
	const R = ENTITY_RADIUS;
	const headY = y - PIN_LIFT;
	const tipY = headY + R + R * 0.5;

	// Outer soft glow (larger)
	fillPinShape(gfx, x, headY, tipY, R + 4, ui.white, 0.25);
	// Inner bright halo (slightly larger than pin)
	fillPinShape(gfx, x, headY, tipY, R + 2.5, ui.white, 0.9);
}

/**
 * Draws a filled teardrop pin shape (circle head + tail triangle) at the given
 * dimensions. Matches drawPin's geometry so a halo of this shape hugs the pin.
 */
function fillPinShape(
	gfx: Phaser.GameObjects.Graphics,
	cx: number,
	headY: number,
	tipY: number,
	radius: number,
	color: number,
	alpha: number,
) {
	// Tail extends a bit past the pin's real tip to give the halo some bleed
	const haloTipY = tipY + (radius - ENTITY_RADIUS);
	gfx.fillStyle(color, alpha);
	gfx.fillTriangle(
		cx - radius * 0.45,
		headY + radius * 0.55,
		cx + radius * 0.45,
		headY + radius * 0.55,
		cx,
		haloTipY,
	);
	gfx.fillCircle(cx, headY, radius);
}

/** Draws a filled hex at (cx, cy) with the given outer radius. */
function fillHex(
	gfx: Phaser.GameObjects.Graphics,
	cx: number,
	cy: number,
	radius: number,
	color: number,
	alpha: number,
) {
	gfx.fillStyle(color, alpha);
	gfx.beginPath();
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 180) * (60 * i - 30);
		const px = cx + radius * Math.cos(angle);
		const py = cy + radius * Math.sin(angle);
		if (i === 0) gfx.moveTo(px, py);
		else gfx.lineTo(px, py);
	}
	gfx.closePath();
	gfx.fillPath();
}

// ─── Tile hover highlight ───

export function drawHoverHighlight(gfx: Phaser.GameObjects.Graphics, col: number, row: number) {
	const { x, y } = getHexCenter(col, row);
	const pts = getHexPoints(x, y);

	gfx.lineStyle(2, ui.white, 0.7);
	gfx.beginPath();
	gfx.moveTo(pts[0].x, pts[0].y);
	for (let i = 1; i < 6; i++) gfx.lineTo(pts[i].x, pts[i].y);
	gfx.closePath();
	gfx.strokePath();

	gfx.fillStyle(ui.white, 0.12);
	gfx.beginPath();
	gfx.moveTo(pts[0].x, pts[0].y);
	for (let i = 1; i < 6; i++) gfx.lineTo(pts[i].x, pts[i].y);
	gfx.closePath();
	gfx.fillPath();
}

// ─── Movement path line ───

export function drawMovePath(
	gfx: Phaser.GameObjects.Graphics,
	pathTiles: Array<{ col: number; row: number }>,
	costs: number[],
	maxMove: number,
	reachable: boolean,
	scene?: Phaser.Scene,
	moveTexts?: Phaser.GameObjects.Text[],
) {
	const R = ENTITY_RADIUS;
	const start = getHexCenter(pathTiles[0].col, pathTiles[0].row);

	gfx.beginPath();
	gfx.moveTo(start.x, start.y);
	let prevReachable = true;
	gfx.lineStyle(2, pathColors.reachable, 0.8);

	for (let p = 1; p < pathTiles.length; p++) {
		const stepReachable = Math.floor(maxMove - costs[p]) >= 0;
		if (stepReachable !== prevReachable) {
			gfx.strokePath();
			gfx.lineStyle(2, stepReachable ? pathColors.reachable : pathColors.unreachable, 0.8);
			const prev = getHexCenter(pathTiles[p - 1].col, pathTiles[p - 1].row);
			gfx.beginPath();
			gfx.moveTo(prev.x, prev.y);
			prevReachable = stepReachable;
		}
		const { x: px, y: py } = getHexCenter(pathTiles[p].col, pathTiles[p].row);
		gfx.lineTo(px, py);
	}
	gfx.strokePath();

	// Destination marker
	const dest = getHexCenter(
		pathTiles[pathTiles.length - 1].col,
		pathTiles[pathTiles.length - 1].row,
	);
	gfx.fillStyle(reachable ? pathColors.reachable : pathColors.unreachable, 0.3);
	gfx.fillCircle(dest.x, dest.y, R);

	// Stamina cost label on the destination tile
	if (scene && moveTexts) {
		const totalCost = costs[costs.length - 1];
		const color = reachable ? "#ffffff" : "#ff6666";
		const label = scene.add.text(dest.x, dest.y + 10, `⚡${totalCost}`, {
			fontFamily: "monospace",
			fontSize: "7px",
			fontStyle: "bold",
			color,
			stroke: "#000000",
			strokeThickness: 2,
		});
		label.setOrigin(0.5, 0.5);
		label.setResolution(window.devicePixelRatio * 6);
		moveTexts.push(label);
	}
}

/** Destroy all stamina-cost text labels from a previous drawMovePath call. */
export function clearMovePathTexts(texts: Phaser.GameObjects.Text[]) {
	for (const t of texts) t.destroy();
	texts.length = 0;
}

/**
 * Draw a planned/queued path as a dashed white line with a destination flag.
 * Visually distinct from the solid green movement path.
 */
export function drawPlannedPath(
	gfx: Phaser.GameObjects.Graphics,
	pathTiles: Array<{ col: number; row: number }>,
) {
	if (pathTiles.length < 2) return;
	const DASH = 4;
	const GAP = 4;
	const COLOR = 0xffffff;

	for (let p = 1; p < pathTiles.length; p++) {
		const from = getHexCenter(pathTiles[p - 1].col, pathTiles[p - 1].row);
		const to = getHexCenter(pathTiles[p].col, pathTiles[p].row);
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const ux = dx / dist;
		const uy = dy / dist;
		let d = 0;
		let drawing = true;
		while (d < dist) {
			const segLen = Math.min(drawing ? DASH : GAP, dist - d);
			if (drawing) {
				gfx.lineStyle(2, COLOR, 0.4);
				gfx.beginPath();
				gfx.moveTo(from.x + ux * d, from.y + uy * d);
				gfx.lineTo(from.x + ux * (d + segLen), from.y + uy * (d + segLen));
				gfx.strokePath();
			}
			d += segLen;
			drawing = !drawing;
		}
	}

	// Waypoint dots at each intermediate tile
	for (let p = 1; p < pathTiles.length - 1; p++) {
		const { x, y } = getHexCenter(pathTiles[p].col, pathTiles[p].row);
		gfx.fillStyle(COLOR, 0.25);
		gfx.fillCircle(x, y, 2);
	}

	// Destination marker — hollow ring
	const dest = getHexCenter(
		pathTiles[pathTiles.length - 1].col,
		pathTiles[pathTiles.length - 1].row,
	);
	gfx.lineStyle(2, COLOR, 0.5);
	gfx.strokeCircle(dest.x, dest.y, ENTITY_RADIUS);
	gfx.fillStyle(COLOR, 0.1);
	gfx.fillCircle(dest.x, dest.y, ENTITY_RADIUS);
}

// ─── Attack animation ───

export function playAttackAnimation(
	scene: Phaser.Scene,
	attackerCol: number,
	attackerRow: number,
	targetCol: number,
	targetRow: number,
	onComplete?: () => void,
) {
	const from = getHexCenter(attackerCol, attackerRow);
	const to = getHexCenter(targetCol, targetRow);
	const midX = (from.x + to.x) / 2;
	const midY = (from.y + to.y) / 2;

	const gfx = scene.add.graphics();
	const SIZE = 10;

	// Flash cross between the two units
	let step = 0;
	const totalSteps = 6;
	const flashInterval = 80; // ms per frame

	const timer = scene.time.addEvent({
		delay: flashInterval,
		repeat: totalSteps - 1,
		callback: () => {
			gfx.clear();
			step++;
			const alpha = step % 2 === 1 ? 0.9 : 0.3;
			const color = step % 2 === 1 ? ui.white : pathColors.unreachable;
			const s = SIZE * (1 + (step % 2) * 0.3);

			// Cross / X mark
			gfx.lineStyle(3, color, alpha);
			gfx.beginPath();
			gfx.moveTo(midX - s, midY - s);
			gfx.lineTo(midX + s, midY + s);
			gfx.strokePath();
			gfx.beginPath();
			gfx.moveTo(midX + s, midY - s);
			gfx.lineTo(midX - s, midY + s);
			gfx.strokePath();

			// Impact ring
			gfx.lineStyle(2, pathColors.unreachable, alpha * 0.6);
			gfx.strokeCircle(midX, midY, s + 4);

			if (step >= totalSteps) {
				gfx.destroy();
				timer.destroy();
				onComplete?.();
			}
		},
	});
}

// ─── Move animation ───

/**
 * Glide a unit sprite along a path of hex tiles. The caller is responsible
 * for hiding the "real" unit pin while this runs (the scene does this via an
 * animating-entity set so the double-draw never happens).
 *
 * Each hex step takes `stepMs` ms — short enough that long paths stay snappy.
 */
export function playMoveAnimation(
	scene: Phaser.Scene,
	team: number,
	type: EntityType,
	path: Array<{ col: number; row: number }>,
	onComplete?: () => void,
) {
	if (path.length < 2) {
		onComplete?.();
		return;
	}

	const gfx = scene.add.graphics();
	// Above fog + hover overlays; sits just under HUD but above everything in-world.
	gfx.setDepth(1000);
	drawEntityIcon(gfx, 0, 0, team, type);

	const start = getHexCenter(path[0].col, path[0].row);
	gfx.setPosition(start.x, start.y);

	const STEP_MS = 140;
	let idx = 1;
	const stepNext = () => {
		if (idx >= path.length) {
			gfx.destroy();
			onComplete?.();
			return;
		}
		const next = getHexCenter(path[idx].col, path[idx].row);
		idx++;
		scene.tweens.add({
			targets: gfx,
			x: next.x,
			y: next.y,
			duration: STEP_MS,
			ease: "Linear",
			onComplete: stepNext,
		});
	};
	stepNext();
}

// ─── Special resource icons (procedural pixel art) ───

const RES_BG = 0x555555;

type ResourceDrawFn = (gfx: Phaser.GameObjects.Graphics, cx: number, cy: number) => void;

function drawGold(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0xffd700, 1);
	g.fillTriangle(cx, cy - 5, cx - 4, cy + 1, cx + 4, cy + 1);
	g.fillTriangle(cx, cy + 5, cx - 4, cy - 1, cx + 4, cy - 1);
}

function drawCopper(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0xcd7f32, 1);
	g.fillCircle(cx, cy, 4);
	g.fillStyle(0xb5651d, 1);
	g.fillCircle(cx, cy, 2);
}

function drawIron(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0xaaaaaa, 1);
	g.fillRect(cx - 1, cy - 5, 2, 7);
	g.fillRect(cx - 4, cy - 5, 8, 2);
	g.fillStyle(0x888888, 1);
	g.fillRect(cx + 1, cy + 1, 3, 3);
}

function drawCoal(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0x333333, 1);
	g.fillRect(cx - 4, cy - 3, 5, 6);
	g.fillStyle(0x444444, 1);
	g.fillRect(cx, cy - 2, 4, 4);
	g.fillStyle(0x555555, 1);
	g.fillRect(cx - 2, cy - 1, 2, 2);
}

function drawGems(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0x8b5cf6, 1);
	g.fillTriangle(cx, cy - 5, cx - 4, cy, cx + 4, cy);
	g.fillStyle(0xa78bfa, 1);
	g.fillTriangle(cx, cy + 4, cx - 4, cy, cx + 4, cy);
}

function drawMarble(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0xe8e8e8, 1);
	g.fillRect(cx - 4, cy - 3, 8, 6);
	g.lineStyle(1, 0xcccccc, 0.6);
	g.beginPath();
	g.moveTo(cx - 3, cy - 2);
	g.lineTo(cx + 2, cy + 2);
	g.strokePath();
	g.beginPath();
	g.moveTo(cx, cy - 3);
	g.lineTo(cx + 4, cy + 1);
	g.strokePath();
}

function drawCattle(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0x8b6914, 1);
	g.fillRect(cx - 4, cy - 2, 8, 5);
	g.fillStyle(0x7a5c12, 1);
	g.fillCircle(cx + 4, cy - 2, 2);
	g.fillStyle(0xeeeeee, 1);
	g.fillRect(cx - 3, cy + 3, 2, 2);
	g.fillRect(cx + 2, cy + 3, 2, 2);
}

function drawDeer(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0xa0724a, 1);
	g.fillRect(cx - 3, cy - 1, 6, 4);
	g.fillCircle(cx + 3, cy - 2, 2);
	g.lineStyle(1.5, 0x8b5e3c, 1);
	g.beginPath();
	g.moveTo(cx + 2, cy - 4);
	g.lineTo(cx + 1, cy - 6);
	g.lineTo(cx - 1, cy - 5);
	g.strokePath();
	g.beginPath();
	g.moveTo(cx + 4, cy - 4);
	g.lineTo(cx + 5, cy - 6);
	g.lineTo(cx + 6, cy - 5);
	g.strokePath();
}

function drawHorses(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0x7a4b2a, 1);
	g.fillRect(cx - 4, cy - 2, 7, 4);
	g.fillCircle(cx + 3, cy - 3, 2);
	g.fillStyle(0x5a3a1e, 1);
	g.fillRect(cx - 3, cy + 2, 2, 3);
	g.fillRect(cx + 1, cy + 2, 2, 3);
	g.lineStyle(1, 0x333333, 1);
	g.beginPath();
	g.moveTo(cx - 4, cy - 1);
	g.lineTo(cx - 5, cy + 2);
	g.strokePath();
}

function drawWheat(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.lineStyle(1.5, 0xc6972a, 1);
	g.beginPath();
	g.moveTo(cx, cy + 5);
	g.lineTo(cx, cy - 3);
	g.strokePath();
	g.fillStyle(0xdaa520, 1);
	g.fillTriangle(cx, cy - 5, cx - 2, cy - 2, cx + 2, cy - 2);
	g.lineStyle(1, 0xc6972a, 1);
	g.beginPath();
	g.moveTo(cx - 1, cy);
	g.lineTo(cx - 3, cy - 2);
	g.strokePath();
	g.beginPath();
	g.moveTo(cx + 1, cy);
	g.lineTo(cx + 3, cy - 2);
	g.strokePath();
}

function drawFish(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0x6cb4ee, 1);
	g.fillCircle(cx, cy, 3);
	g.fillRect(cx - 4, cy - 2, 4, 4);
	g.fillTriangle(cx - 5, cy, cx - 7, cy - 3, cx - 7, cy + 3);
	g.fillStyle(0x222222, 1);
	g.fillCircle(cx + 2, cy - 1, 0.8);
}

function drawSpices(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0xdc2626, 1);
	g.fillTriangle(cx, cy - 5, cx - 2, cy + 2, cx + 2, cy + 2);
	g.fillStyle(0xef4444, 1);
	g.fillTriangle(cx - 3, cy - 3, cx - 5, cy + 2, cx - 1, cy + 2);
	g.fillStyle(0xb91c1c, 1);
	g.fillTriangle(cx + 3, cy - 3, cx + 1, cy + 2, cx + 5, cy + 2);
	g.lineStyle(1, 0x166534, 1);
	g.beginPath();
	g.moveTo(cx, cy + 2);
	g.lineTo(cx, cy + 5);
	g.strokePath();
}

function drawSilk(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.lineStyle(1.5, 0xe2e8f0, 0.9);
	g.beginPath();
	g.moveTo(cx - 4, cy - 2);
	g.lineTo(cx, cy + 2);
	g.lineTo(cx + 4, cy - 2);
	g.strokePath();
	g.lineStyle(1.5, 0xcbd5e1, 0.9);
	g.beginPath();
	g.moveTo(cx - 3, cy + 1);
	g.lineTo(cx, cy - 3);
	g.lineTo(cx + 3, cy + 1);
	g.strokePath();
}

function drawDyes(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0x7c3aed, 1);
	g.fillCircle(cx - 2, cy - 1, 2.5);
	g.fillStyle(0x2563eb, 1);
	g.fillCircle(cx + 2, cy - 1, 2.5);
	g.fillStyle(0xdc2626, 1);
	g.fillCircle(cx, cy + 2, 2.5);
}

function drawHoney(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
	g.fillStyle(0xf59e0b, 1);
	g.fillRect(cx - 3, cy - 3, 6, 6);
	g.fillStyle(0xd97706, 1);
	g.fillRect(cx - 2, cy - 2, 4, 4);
	g.fillStyle(0xfbbf24, 1);
	g.fillRect(cx - 1, cy - 1, 2, 2);
}

const RESOURCE_DRAW: Record<SpecialResourceId, ResourceDrawFn> = {
	gold: drawGold,
	copper: drawCopper,
	iron: drawIron,
	coal: drawCoal,
	gems: drawGems,
	marble: drawMarble,
	cattle: drawCattle,
	deer: drawDeer,
	horses: drawHorses,
	wheat: drawWheat,
	fish: drawFish,
	spices: drawSpices,
	silk: drawSilk,
	dyes: drawDyes,
	honey: drawHoney,
};

/** Draw a small flat hexagon badge at (cx, cy) */
function drawHexBadge(
	gfx: Phaser.GameObjects.Graphics,
	cx: number,
	cy: number,
	radius: number,
	color: number,
	alpha: number,
) {
	gfx.fillStyle(color, alpha);
	gfx.beginPath();
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 180) * (60 * i - 30);
		const px = cx + radius * Math.cos(angle);
		const py = cy + radius * Math.sin(angle);
		if (i === 0) gfx.moveTo(px, py);
		else gfx.lineTo(px, py);
	}
	gfx.closePath();
	gfx.fillPath();
	gfx.lineStyle(1, ui.white, 0.2);
	gfx.beginPath();
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 180) * (60 * i - 30);
		const px = cx + radius * Math.cos(angle);
		const py = cy + radius * Math.sin(angle);
		if (i === 0) gfx.moveTo(px, py);
		else gfx.lineTo(px, py);
	}
	gfx.closePath();
	gfx.strokePath();
}

const RES_BADGE_R = 6; // smaller, nests inside the building hex
const RES_OFFSET_X = 6; // lower-right of tile center
const RES_OFFSET_Y = 5;

export function drawResources(
	gfx: Phaser.GameObjects.Graphics,
	resourceMap: Map<string, SpecialResourceId>,
) {
	for (const [key, resId] of resourceMap) {
		const [col, row] = key.split(",").map(Number);
		const { x, y } = getHexCenter(col, row);
		const bx = x + RES_OFFSET_X;
		const by = y + RES_OFFSET_Y;

		drawHexBadge(gfx, bx, by, RES_BADGE_R, RES_BG, 0.85);
		RESOURCE_DRAW[resId](gfx, bx, by);
	}
}

// ─── Citizen badge (left-side mirror of the resource badge) ───

export const CITIZEN_BADGE_R = 6; // match the resource badge so it doesn't hide tile contents
export const CITIZEN_OFFSET_X = -6; // lower-left of tile center, mirrors resource badge
export const CITIZEN_OFFSET_Y = 5;

/**
 * Returns true if the given world-space point is within the citizen badge
 * of a tile centered at (tileX, tileY). Used for precise hit-testing so
 * clicking the small slot places a citizen while clicks elsewhere on the
 * tile fall through to normal selection/move logic.
 */
export function isPointInCitizenSlot(
	px: number,
	py: number,
	tileX: number,
	tileY: number,
): boolean {
	const bx = tileX + CITIZEN_OFFSET_X;
	const by = tileY + CITIZEN_OFFSET_Y;
	const dx = px - bx;
	const dy = py - by;
	return dx * dx + dy * dy <= CITIZEN_BADGE_R * CITIZEN_BADGE_R;
}

/** Trace a flat-top hexagon path on the graphics object. */
function tracePointyHex(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number) {
	gfx.beginPath();
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 180) * (60 * i - 30);
		const px = cx + radius * Math.cos(angle);
		const py = cy + radius * Math.sin(angle);
		if (i === 0) gfx.moveTo(px, py);
		else gfx.lineTo(px, py);
	}
	gfx.closePath();
}

/**
 * Draw a citizen slot badge on a tile, showing "N/M" (current/max) text.
 *
 * Visually distinct from the building hex: drop shadow, slightly lighter
 * team-tinted fill, and a dark outline.
 *
 * - count > 0     → team-colored fill (filled state)
 * - count == 0    → dark fill (empty placement slot)
 * - count > max   → "N" portion is rendered red to flag over-capacity
 *
 * Text objects are pushed into `texts` for the caller to destroy on next redraw.
 */
export function drawCitizen(
	gfx: Phaser.GameObjects.Graphics,
	scene: Phaser.Scene,
	texts: Phaser.GameObjects.Text[],
	cx: number,
	cy: number,
	teamColor: number,
	count: number,
	max: number,
) {
	const bx = cx + CITIZEN_OFFSET_X;
	const by = cy + CITIZEN_OFFSET_Y;
	const filled = count > 0;
	const overCap = count > max;

	// Drop shadow — slightly larger dark hex offset down/right
	gfx.fillStyle(0x000000, 0.45);
	tracePointyHex(gfx, bx + 0.4, by + 0.9, CITIZEN_BADGE_R + 0.4);
	gfx.fillPath();

	// Main fill — lighter team color when filled, dark grey when empty
	if (filled) {
		const lightTeam = adjustBrightness(teamColor, 1.35);
		gfx.fillStyle(lightTeam, 1);
	} else {
		gfx.fillStyle(0x1a1a24, 0.85);
	}
	tracePointyHex(gfx, bx, by, CITIZEN_BADGE_R);
	gfx.fillPath();

	// Dark outline ring for separation from the building hex underneath
	gfx.lineStyle(1.2, 0x000000, 0.7);
	tracePointyHex(gfx, bx, by, CITIZEN_BADGE_R);
	gfx.strokePath();

	// "N / M" laid out along the top-left → bottom-right diagonal so the
	// three glyphs fit inside the tiny badge while staying upright.
	// When over-cap, the whole label turns red — Phaser's Text doesn't
	// support per-character coloring, and uniform red on the over-cap
	// edge case still clearly signals the problem.
	const color = overCap ? "#ef4444" : "#ffffff";
	const style = {
		fontFamily: "monospace",
		fontSize: "4px",
		color,
		fontStyle: "bold",
	} as const;
	const diag = 2.0; // glyph-to-glyph spacing along the diagonal
	const parts: [string, number, number][] = [
		[`${count}`, bx - diag, by - diag],
		["/", bx, by],
		[`${max}`, bx + diag, by + diag],
	];
	for (const [ch, x, y] of parts) {
		const t = scene.add.text(x, y, ch, style);
		t.setOrigin(0.5, 0.5);
		t.setResolution(window.devicePixelRatio * 10);
		texts.push(t);
	}
}

// ─── Tile yield indicators (dots in 4 corner arcs around the tile) ───
//
// Dots sit in the four corner regions so the unit pin (top-center) doesn't
// overlap them. One dot per unit of yield within each corner arc.
//   - happiness  (yellow)  : top-right
//   - growth     (blue)    : top-left
//   - resources  (green)   : bottom-left
//   - knowledge  (purple)  : bottom-right

const YIELD_DOT_R = 1.7;
const YIELD_RING_RADIUS = 13; // distance from tile center to the dot ring
const YIELD_DOT_SPACING = 0.2; // radians between dots within an arc

// Center angles for each metric arc (radians, 0 = right, increasing clockwise in screen coords)
const YIELD_ARC_CENTER = {
	happiness: -Math.PI / 4, // top-right
	growth: (-3 * Math.PI) / 4, // top-left
	resources: (3 * Math.PI) / 4, // bottom-left
	knowledge: Math.PI / 4, // bottom-right
} as const;

/**
 * Draw a ring of small colored dots around the tile perimeter.
 * |value| = number of dots in that metric's arc. Zero produces no dots.
 * Positive values render as **filled** colored dots.
 * Negative values render as **hollow** metric-colored rings on a dark fill,
 * slightly larger so the ring is readable at tiny sizes.
 */
export function drawTileYields(
	gfx: Phaser.GameObjects.Graphics,
	cx: number,
	cy: number,
	yieldData: TileYield,
) {
	const arcs: Array<{ value: number; color: number; centerAngle: number }> = [
		{
			value: yieldData.happiness,
			color: metricsGfx.happiness,
			centerAngle: YIELD_ARC_CENTER.happiness,
		},
		{
			value: yieldData.growth,
			color: metricsGfx.growth,
			centerAngle: YIELD_ARC_CENTER.growth,
		},
		{
			value: yieldData.resources,
			color: metricsGfx.resources,
			centerAngle: YIELD_ARC_CENTER.resources,
		},
		{
			value: yieldData.knowledge,
			color: metricsGfx.knowledge,
			centerAngle: YIELD_ARC_CENTER.knowledge,
		},
	];

	for (const arc of arcs) {
		if (arc.value === 0) continue;
		const negative = arc.value < 0;
		const n = Math.abs(arc.value);
		// Spread dots around the arc center, evenly spaced
		const arcSpan = (n - 1) * YIELD_DOT_SPACING;
		const startAngle = arc.centerAngle - arcSpan / 2;

		// Negative dots are slightly larger so the ring is visible
		const outerR = negative ? YIELD_DOT_R + 1.2 : YIELD_DOT_R + 0.6;
		const innerR = negative ? YIELD_DOT_R + 0.5 : YIELD_DOT_R;

		for (let i = 0; i < n; i++) {
			const angle = startAngle + i * YIELD_DOT_SPACING;
			const px = cx + Math.cos(angle) * YIELD_RING_RADIUS;
			const py = cy + Math.sin(angle) * YIELD_RING_RADIUS;

			// Dark outline halo for separation from the terrain
			gfx.fillStyle(0x000000, 0.55);
			gfx.fillCircle(px, py, outerR);

			if (negative) {
				// Hollow: colored ring with a dark hole in the middle
				gfx.fillStyle(arc.color, 1);
				gfx.fillCircle(px, py, innerR);
				gfx.fillStyle(0x0a0a14, 1);
				gfx.fillCircle(px, py, innerR - 0.9);
			} else {
				// Filled colored dot
				gfx.fillStyle(arc.color, 1);
				gfx.fillCircle(px, py, innerR);
			}
		}
	}
}

// ─── Fog of war overlay ───

export function drawFog(
	gfx: Phaser.GameObjects.Graphics,
	visibleTiles: Set<string>,
	exploredTiles: Set<string>,
) {
	gfx.clear();
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			const key = `${col},${row}`;
			if (visibleTiles.has(key)) continue;

			const { x, y } = getHexCenter(col, row);
			const points = getHexPoints(x, y);
			const explored = exploredTiles.has(key);

			gfx.fillStyle(ui.black, explored ? 0.6 : 1);
			gfx.beginPath();
			gfx.moveTo(points[0].x, points[0].y);
			for (let i = 1; i < 6; i++) gfx.lineTo(points[i].x, points[i].y);
			gfx.closePath();
			gfx.fillPath();
		}
	}
}
