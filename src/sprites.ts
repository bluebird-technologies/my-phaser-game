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
import { EntityType } from "./entities";
import { SpecialResourceId } from "./economy";
import { forest, hillshade, ui, pathColors } from "./theme";

// ─── Pin marker (shared by entities and resources) ───
export const ENTITY_RADIUS = 12;
const PIN_LIFT = 14; // how far the pin head floats above the tile center

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
	alpha: number,
): { hx: number; hy: number } {
	const headY = cy - PIN_LIFT;
	const tipY = headY + radius + radius * 0.5;

	// Shadow ellipse at the ground
	gfx.fillStyle(0x000000, 0.2);
	gfx.fillEllipse(cx, cy + 1, radius * 1.2, radius * 0.5);

	// Teardrop tail (small, narrow triangle flowing from bottom of circle)
	gfx.fillStyle(color, alpha);
	gfx.fillTriangle(
		cx - radius * 0.35,
		headY + radius * 0.6,
		cx + radius * 0.35,
		headY + radius * 0.6,
		cx,
		tipY,
	);

	// Circle head (no border — flows into tail)
	gfx.fillStyle(color, alpha);
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

function randomHexPoints(cx: number, cy: number, count: number) {
	const pts: Array<{ x: number; y: number }> = [];
	for (let i = 0; i < count * 3; i++) {
		const rx = (Math.random() - 0.5) * HEX_WIDTH;
		const ry = (Math.random() - 0.5) * HEX_HEIGHT * 0.85;
		const ax = Math.abs(rx),
			ay = Math.abs(ry);
		if (ay < HEX_SIZE - (ax * HEX_SIZE) / (HEX_WIDTH * 0.5)) {
			pts.push({ x: cx + rx, y: cy + ry });
			if (pts.length >= count) break;
		}
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

			const pts = randomHexPoints(cx, cy, 12);
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

export function drawEntityIcon(
	gfx: Phaser.GameObjects.Graphics,
	cx: number,
	cy: number,
	teamColor: number,
	icon: EntityType,
) {
	const R = ENTITY_RADIUS;
	const { hx, hy } = drawPin(gfx, cx, cy, R, teamColor, 0.85);

	// White icon inside the pin head
	gfx.lineStyle(2, ui.white, 0.95);

	if (icon === "village") {
		gfx.fillStyle(ui.white, 0.95);
		gfx.fillTriangle(hx - 7, hy - 2, hx, hy - 8, hx + 7, hy - 2);
		gfx.fillRect(hx - 5, hy - 2, 10, 8);
		gfx.fillStyle(teamColor, 0.9);
		gfx.fillRect(hx - 1.5, hy + 1, 3, 5);
	} else if (icon === "worker") {
		gfx.beginPath();
		gfx.moveTo(hx - 3, hy + 7);
		gfx.lineTo(hx + 3, hy - 3);
		gfx.strokePath();
		gfx.fillStyle(ui.white, 0.95);
		gfx.fillRect(hx + 0, hy - 7, 7, 5);
	} else {
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

export function drawSelection(gfx: Phaser.GameObjects.Graphics, col: number, row: number) {
	const { x, y } = getHexCenter(col, row);
	const R = ENTITY_RADIUS;
	const headY = y - PIN_LIFT;
	gfx.lineStyle(3, ui.white, 0.9);
	gfx.strokeCircle(x, headY, R + 4);
	gfx.lineStyle(5, ui.white, 0.25);
	gfx.strokeCircle(x, headY, R + 6);
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

const RES_BADGE_R = 8;
const RES_OFFSET_Y = 8; // push below tile center

export function drawResources(
	gfx: Phaser.GameObjects.Graphics,
	resourceMap: Map<string, SpecialResourceId>,
) {
	for (const [key, resId] of resourceMap) {
		const [col, row] = key.split(",").map(Number);
		const { x, y } = getHexCenter(col, row);
		const bx = x;
		const by = y + RES_OFFSET_Y;

		drawHexBadge(gfx, bx, by, RES_BADGE_R, RES_BG, 0.85);
		RESOURCE_DRAW[resId](gfx, bx, by);
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
