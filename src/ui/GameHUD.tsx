import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { Entity, TEAM_BLUE } from "../entities";
import { ActionId, ActionContext } from "../actions";
import { SettlementStats } from "../economy";
import { panel as panelColors, teamsCss } from "../theme";
import ActionsPanel from "./ActionsPanel";
import EndTurnButton from "./EndTurnButton";
import TurnIndicator from "./TurnIndicator";
import TurnBanner from "./TurnBanner";
import SaveLoadMenu from "./SaveLoadMenu";
import { TileInfo } from "./ResourceCard";

export interface HUDControls {
	updatePanel: (entity: Entity | null, target?: Entity | null) => void;
	updateTileInfo: (tile: TileInfo | null) => void;
	updateSettlement: (stats: SettlementStats | null) => void;
	setActiveTeam: (team: number) => void;
	setActionContext: (ctx: ActionContext | null) => void;
	setEndTurnLabel: (label: string) => void;
	showTurnBanner: (team: number, turnNumber: number) => void;
	setSaveLoadCallbacks: (onSave: (name: string) => void, onLoad: (name: string) => void) => void;
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

export function mountHUD(
	initialTeam: number,
	onEndTurn: () => void,
	onAction: (id: ActionId) => void,
): HUDControls {
	injectThemeVars();

	const container = document.createElement("div");
	container.id = "game-hud";
	document.body.appendChild(container);

	const [entity, setEntity] = createSignal<Entity | null>(null);
	const [target, setTarget] = createSignal<Entity | null>(null);
	const [tileInfo, setTileInfo] = createSignal<TileInfo | null>(null);
	const [settlementStats, setSettlementStats] = createSignal<SettlementStats | null>(null);
	const [actionContext, setActionContext] = createSignal<ActionContext | null>(null);
	const [activeTeamName, setActiveTeamName] = createSignal(teamName(initialTeam));
	const [activeTeamColor, setActiveTeamColor] = createSignal(teamColor(initialTeam));
	const [endTurnLabel, setEndTurnLabel] = createSignal("End Turn");
	const [turnNumber, setTurnNumber] = createSignal(1);
	const [bannerVisible, setBannerVisible] = createSignal(false);
	const [bannerTeamName, setBannerTeamName] = createSignal(teamName(initialTeam));
	const [bannerTeamColor, setBannerTeamColor] = createSignal(teamColor(initialTeam));
	const [bannerTurn, setBannerTurn] = createSignal(1);
	const [menuOpen, setMenuOpen] = createSignal(false);
	const [onSaveCb, setOnSaveCb] = createSignal<((name: string) => void) | null>(null);
	const [onLoadCb, setOnLoadCb] = createSignal<((name: string) => void) | null>(null);

	const dispose = render(
		() => (
			<>
				<TurnIndicator
					name={activeTeamName()}
					color={activeTeamColor()}
					turnNumber={turnNumber()}
				/>
				<ActionsPanel
					entity={entity()}
					target={target()}
					tileInfo={tileInfo()}
					settlementStats={settlementStats()}
					actionContext={actionContext()}
					onAction={onAction}
				/>
				<EndTurnButton label={endTurnLabel()} onClick={onEndTurn} />
				<button
					style={{
						position: "fixed",
						top: "16px",
						left: "16px",
						padding: "10px 24px",
						background: "var(--panel-bg)",
						border: "2px solid var(--panel-border)",
						"border-radius": "6px",
						color: "var(--panel-text)",
						"font-family": "monospace",
						"font-size": "14px",
						"font-weight": "bold",
						"letter-spacing": "1px",
						cursor: "pointer",
						"pointer-events": "auto",
						"z-index": "10",
					}}
					onClick={() => setMenuOpen(true)}
				>
					Menu
				</button>
				<SaveLoadMenu
					visible={menuOpen()}
					onClose={() => setMenuOpen(false)}
					onSave={(name) => {
						onSaveCb()?.(name);
						setMenuOpen(false);
					}}
					onLoad={(name) => {
						onLoadCb()?.(name);
						setMenuOpen(false);
					}}
				/>
				<TurnBanner
					name={bannerTeamName()}
					color={bannerTeamColor()}
					turnNumber={bannerTurn()}
					visible={bannerVisible()}
					onDone={() => setBannerVisible(false)}
				/>
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
		updateSettlement(stats) {
			setSettlementStats(stats);
		},
		setActiveTeam(team) {
			setActiveTeamName(teamName(team));
			setActiveTeamColor(teamColor(team));
		},
		setActionContext(ctx) {
			setActionContext(ctx);
		},
		setEndTurnLabel(label) {
			setEndTurnLabel(label);
		},
		showTurnBanner(team, turn) {
			setTurnNumber(turn);
			setBannerTeamName(teamName(team));
			setBannerTeamColor(teamColor(team));
			setBannerTurn(turn);
			setBannerVisible(true);
		},
		setSaveLoadCallbacks(save, load) {
			setOnSaveCb(() => save);
			setOnLoadCb(() => load);
		},
		destroy() {
			dispose();
			container.remove();
		},
	};
}
