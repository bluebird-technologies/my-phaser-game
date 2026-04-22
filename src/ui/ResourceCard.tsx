import { Show } from "solid-js";
import { SpecialResourceConfig, TileYield } from "../economy";
import { metrics } from "../theme";
import styles from "./ResourceCard.module.css";

function YieldLine(props: { label: string; value: number; color: string }) {
	return (
		<Show when={props.value !== 0}>
			<span style={{ color: props.color }}>
				{props.value > 0 ? "+" : ""}
				{props.value} {props.label}
			</span>
		</Show>
	);
}

export interface TileInfo {
	biome: string;
	baseYield: TileYield;
	featureYield: TileYield | null;
	featureLabel: string | null;
	resource: SpecialResourceConfig | null;
	/**
	 * Yield contribution from anything built on the tile (e.g. the
	 * VILLAGE_BONUS when a village center sits on this hex). Already
	 * factored into the totals displayed by the card.
	 */
	improvementYield: TileYield | null;
	improvementLabel: string | null;
}

function addYield(into: TileYield, from: TileYield): void {
	into.resources += from.resources;
	into.growth += from.growth;
	into.happiness += from.happiness;
	into.knowledge += from.knowledge;
}

export default function ResourceCard(props: { tile: TileInfo }) {
	const total = () => {
		const t = { ...props.tile.baseYield };
		if (props.tile.featureYield) addYield(t, props.tile.featureYield);
		if (props.tile.resource) addYield(t, props.tile.resource.yield);
		if (props.tile.improvementYield) addYield(t, props.tile.improvementYield);
		return t;
	};

	return (
		<div class={styles.card}>
			<div class={styles.name}>
				{props.tile.biome}
				<Show when={props.tile.featureLabel}>
					{" "}
					<span class={styles.feature}>({props.tile.featureLabel})</span>
				</Show>
			</div>

			<Show when={props.tile.improvementLabel}>
				<div class={styles.resource}>⌂ {props.tile.improvementLabel}</div>
			</Show>

			<Show when={props.tile.resource}>
				<div class={styles.resource}>
					{props.tile.resource!.icon} {props.tile.resource!.label}
				</div>
			</Show>

			<div class={styles.yields}>
				<YieldLine label="resources" value={total().resources} color={metrics.resources} />
				<YieldLine label="growth" value={total().growth} color={metrics.growth} />
				<YieldLine label="happiness" value={total().happiness} color={metrics.happiness} />
				<YieldLine label="knowledge" value={total().knowledge} color={metrics.knowledge} />
			</div>
		</div>
	);
}
