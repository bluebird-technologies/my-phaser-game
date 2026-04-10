import { render } from "solid-js/web";
import { panel as panelColors } from "../theme";
import KitchenSink from "./KitchenSink";

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

injectThemeVars();
render(() => <KitchenSink />, document.getElementById("kitchen-sink")!);
