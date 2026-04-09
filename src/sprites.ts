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
import { forest, hillshade, ui, pathColors } from "./theme";

// ─── Entity icon radius ───
export const ENTITY_RADIUS = 12;

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

	// Team-colored circle background
	gfx.fillStyle(teamColor, 0.85);
	gfx.fillCircle(cx, cy, R);
	gfx.lineStyle(1.5, ui.white, 0.3);
	gfx.strokeCircle(cx, cy, R);

	// White icon
	gfx.lineStyle(2, ui.white, 0.95);

	if (icon === "village") {
		gfx.fillStyle(ui.white, 0.95);
		gfx.fillTriangle(cx - 7, cy - 2, cx, cy - 8, cx + 7, cy - 2);
		gfx.fillRect(cx - 5, cy - 2, 10, 8);
		gfx.fillStyle(teamColor, 0.9);
		gfx.fillRect(cx - 1.5, cy + 1, 3, 5);
	} else if (icon === "worker") {
		gfx.beginPath();
		gfx.moveTo(cx - 3, cy + 7);
		gfx.lineTo(cx + 3, cy - 3);
		gfx.strokePath();
		gfx.fillStyle(ui.white, 0.95);
		gfx.fillRect(cx + 0, cy - 7, 7, 5);
	} else {
		gfx.beginPath();
		gfx.moveTo(cx, cy + 7);
		gfx.lineTo(cx, cy - 8);
		gfx.strokePath();
		gfx.fillStyle(ui.white, 0.95);
		gfx.fillTriangle(cx - 2, cy - 8, cx, cy - 11, cx + 2, cy - 8);
		gfx.beginPath();
		gfx.moveTo(cx - 4, cy + 2);
		gfx.lineTo(cx + 4, cy + 2);
		gfx.strokePath();
	}
}

// ─── Selection ring ───

export function drawSelection(gfx: Phaser.GameObjects.Graphics, col: number, row: number) {
	const { x, y } = getHexCenter(col, row);
	const R = ENTITY_RADIUS;
	gfx.lineStyle(3, ui.white, 0.9);
	gfx.strokeCircle(x, y, R + 4);
	gfx.lineStyle(5, ui.white, 0.25);
	gfx.strokeCircle(x, y, R + 6);
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
