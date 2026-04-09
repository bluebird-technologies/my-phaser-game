/**
 * cursors.ts — Phaser-specific cursor management.
 */

import { cursorAttackColor } from "../theme";

function buildAttackCursor(): string {
	const c = document.createElement("canvas");
	c.width = 24;
	c.height = 24;
	const ctx = c.getContext("2d")!;
	ctx.strokeStyle = cursorAttackColor;
	ctx.lineWidth = 2.5;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(12, 2);
	ctx.lineTo(12, 22);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(2, 12);
	ctx.lineTo(22, 12);
	ctx.stroke();
	ctx.strokeStyle = "rgba(0,0,0,0.3)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(12, 1);
	ctx.lineTo(12, 23);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(1, 12);
	ctx.lineTo(23, 12);
	ctx.stroke();
	return `url(${c.toDataURL()}) 12 12, crosshair`;
}

export type CursorType = "default" | "move" | "attack" | "blocked";

export function createCursorManager(scene: Phaser.Scene) {
	const attackCursorUrl = buildAttackCursor();
	const CURSOR_MAP: Record<CursorType, string> = {
		default: "default",
		move: "cell",
		attack: attackCursorUrl,
		blocked: "not-allowed",
	};

	let current: CursorType = "default";

	function set(type: CursorType) {
		if (type === current) return;
		current = type;
		const css = CURSOR_MAP[type];
		scene.input.setDefaultCursor(css);
		scene.game.canvas.style.cursor = css;
	}

	return { set };
}
