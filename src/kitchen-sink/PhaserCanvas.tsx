import { onMount, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import Phaser from "phaser";
import { ShowcaseScene, UIRenderers } from "./PhaserShowcase";
import { Entity } from "../entities";
import { ActionId, ActionContext } from "../actions";
import { SettlementStats } from "../economy";
import { TileInfo } from "../ui/ResourceCard";
import ActionsPanel from "../ui/ActionsPanel";

/** Render a Solid component into a detached div and return that div. */
function renderActionsPanel(
	entity: Entity | null,
	target: Entity | null,
	tile: TileInfo | null,
	actionContext: ActionContext | null = null,
	onAction: ((id: ActionId) => void) | null = null,
	settlementStats: SettlementStats | null = null,
): HTMLElement {
	const wrapper = document.createElement("div");
	// Override the fixed-positioned ActionsPanel to render inline
	wrapper.style.position = "relative";
	wrapper.style.minWidth = "200px";

	const inner = document.createElement("div");
	wrapper.appendChild(inner);

	render(
		() => (
			<ActionsPanel
				entity={entity}
				target={target}
				tileInfo={tile}
				actionContext={actionContext}
				onAction={onAction ?? undefined}
				settlementStats={settlementStats}
			/>
		),
		inner,
	);

	// Strip the fixed positioning from the rendered .panel
	const panel = inner.querySelector('[class*="panel"]') as HTMLElement | null;
	if (panel) {
		panel.style.position = "static";
		panel.style.bottom = "auto";
		panel.style.left = "auto";
		panel.style.pointerEvents = "auto";
	}

	return wrapper;
}

export default function PhaserCanvas() {
	let container: HTMLDivElement | null = null;
	let game: Phaser.Game | undefined;

	onMount(() => {
		if (!container) return;

		const renderers: UIRenderers = { renderActionsPanel };

		game = new Phaser.Game({
			type: Phaser.AUTO,
			parent: container,
			width: window.innerWidth,
			height: window.innerHeight,
			backgroundColor: "#1a1a2e",
			scale: { mode: Phaser.Scale.RESIZE },
			dom: { createContainer: true },
			scene: [],
			callbacks: {
				postBoot: (g) => {
					g.scene.add("ShowcaseScene", ShowcaseScene, true, { renderers });
				},
			},
		});
	});

	onCleanup(() => {
		game?.destroy(true);
	});

	return (
		<div
			ref={(el) => (container = el)}
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				width: "100vw",
				height: "100vh",
			}}
		/>
	);
}
