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
}

export default function ResourceCard(props: { tile: TileInfo }) {
	const total = () => {
		const t = { ...props.tile.baseYield };
		if (props.tile.featureYield) {
			t.resources += props.tile.featureYield.resources;
			t.growth += props.tile.featureYield.growth;
			t.happiness += props.tile.featureYield.happiness;
			t.knowledge += props.tile.featureYield.knowledge;
		}
		if (props.tile.resource) {
			t.resources += props.tile.resource.yield.resources;
			t.growth += props.tile.resource.yield.growth;
			t.happiness += props.tile.resource.yield.happiness;
			t.knowledge += props.tile.resource.yield.knowledge;
		}
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
