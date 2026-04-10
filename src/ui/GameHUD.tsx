import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { Entity, TEAM_BLUE } from "../entities";
import { panel as panelColors, teamsCss } from "../theme";
import ActionsPanel from "./ActionsPanel";
import EndTurnButton from "./EndTurnButton";
import TurnIndicator from "./TurnIndicator";
import { TileInfo } from "./ResourceCard";

export interface HUDControls {
	updatePanel: (entity: Entity | null, target?: Entity | null) => void;
	updateTileInfo: (tile: TileInfo | null) => void;
	setActiveTeam: (team: number) => void;
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

function teamName(team: number) {
	return team === TEAM_BLUE ? "Blue" : "Red";
}

function teamColor(team: number) {
	return team === TEAM_BLUE ? teamsCss.blue : teamsCss.red;
}

export function mountHUD(initialTeam: number, onEndTurn: () => void): HUDControls {
	injectThemeVars();

	const container = document.createElement("div");
	container.id = "game-hud";
	document.body.appendChild(container);

	const [entity, setEntity] = createSignal<Entity | null>(null);
	const [target, setTarget] = createSignal<Entity | null>(null);
	const [tileInfo, setTileInfo] = createSignal<TileInfo | null>(null);
	const [activeTeamName, setActiveTeamName] = createSignal(teamName(initialTeam));
	const [activeTeamColor, setActiveTeamColor] = createSignal(teamColor(initialTeam));

	const dispose = render(
		() => (
			<>
				<TurnIndicator name={activeTeamName()} color={activeTeamColor()} />
				<ActionsPanel entity={entity()} target={target()} tileInfo={tileInfo()} />
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
		updateTileInfo(tile) {
			setTileInfo(tile ? { ...tile } : null);
		},
		setActiveTeam(team) {
			setActiveTeamName(teamName(team));
			setActiveTeamColor(teamColor(team));
		},
		destroy() {
			dispose();
			container.remove();
		},
	};
}
