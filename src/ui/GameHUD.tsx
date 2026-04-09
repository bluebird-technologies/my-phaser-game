import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { Entity } from "../entities";
import { panel as panelColors } from "../theme";
import ActionsPanel from "./ActionsPanel";
import EndTurnButton from "./EndTurnButton";

export interface HUDControls {
	updatePanel: (entity: Entity | null, target?: Entity | null) => void;
	destroy: () => void;
}

function injectThemeVars() {
	const root = document.documentElement.style;
	root.setProperty("--panel-bg", panelColors.background);
	root.setProperty("--panel-border", panelColors.border);
	root.setProperty("--panel-border-target", panelColors.borderTarget);
	root.setProperty("--panel-text", panelColors.text);
	root.setProperty("--panel-text-muted", panelColors.textMuted);
	root.setProperty("--panel-hover-bg", panelColors.hoverBg);
	root.setProperty("--panel-hover-border", panelColors.hoverBorder);
	root.setProperty("--panel-active-bg", panelColors.activeBg);
	root.setProperty("--panel-active-border", panelColors.activeBorder);
	root.setProperty("--panel-focus-ring", panelColors.focusRing);
	root.setProperty("--panel-separator", panelColors.separator);
}

export function mountHUD(onEndTurn: () => void): HUDControls {
	injectThemeVars();

	const container = document.createElement("div");
	container.id = "game-hud";
	document.body.appendChild(container);

	const [entity, setEntity] = createSignal<Entity | null>(null);
	const [target, setTarget] = createSignal<Entity | null>(null);

	const dispose = render(
		() => (
			<>
				<ActionsPanel entity={entity()} target={target()} />
				<EndTurnButton onClick={onEndTurn} />
			</>
		),
		container,
	);

	return {
		updatePanel(ent, tgt = null) {
			setEntity(ent ? { ...ent } : null);
			setTarget(tgt ? { ...tgt } : null);
		},
		destroy() {
			dispose();
			container.remove();
		},
	};
}
