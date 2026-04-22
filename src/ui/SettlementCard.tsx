import { Entity, TEAM_BLUE } from "../entities";
import { SettlementStats } from "../economy";
import { teamsCss, metrics, stats as statsColors } from "../theme";
import styles from "./SettlementCard.module.css";

function signed(n: number, decimals = 0): string {
	const rounded = decimals > 0 ? n.toFixed(decimals) : Math.round(n).toString();
	return n > 0 ? `+${rounded}` : rounded;
}

function pct(value: number, max: number): number {
	if (max <= 0) return 0;
	return Math.min(100, Math.max(0, (value / max) * 100));
}

const BAND_LABEL: Record<SettlementStats["happinessBand"], string> = {
	goldenAge: "Golden Age",
	content: "Content",
	discontent: "Discontent",
	unrest: "Unrest",
};

const BAND_COLOR: Record<SettlementStats["happinessBand"], string> = {
	goldenAge: metrics.happiness,
	content: statsColors.staminaHigh,
	discontent: statsColors.healthMid,
	unrest: statsColors.healthLow,
};

export default function SettlementCard(props: { village: Entity; stats: SettlementStats }) {
	const teamName = () => (props.village.team === TEAM_BLUE ? "Blue" : "Red");
	const teamColor = () => (props.village.team === TEAM_BLUE ? teamsCss.blue : teamsCss.red);
	const s = () => props.stats;

	const growthPct = () => pct(s().growthBucket, s().growthBucketMax);
	const growthPendingPct = () => {
		const remaining = s().growthBucketMax - s().growthBucket;
		const gain = Math.min(s().populationGrowthPerTurn, remaining);
		return pct(gain, s().growthBucketMax);
	};
	const turnsUntilGrowth = () => {
		const rate = s().populationGrowthPerTurn;
		if (rate <= 0) return Infinity;
		const remaining = s().growthBucketMax - s().growthBucket;
		return Math.max(1, Math.ceil(remaining / rate));
	};
	return (
		<div class={styles.card}>
			{/*
			 * This card describes the whole settlement district — every tile
			 * inside the border, the citizens working them, and the pooled
			 * yields. The building on the center hex is the "Village Center"
			 * (shown on its own EntityCard). The tier name ("Village",
			 * "Town", "City") refers to the district as a whole.
			 */}
			<div class={styles.name}>
				{s().tier.name} District{" "}
				<span class={styles.teamTag} style={{ color: teamColor() }}>
					[{teamName()}]
				</span>
			</div>
			<div class={styles.subLabel}>
				{s().tier.leaderTitle} · {s().borderTileCount} tiles (r{s().borderRadius})
			</div>

			<div class={styles.statRow}>
				Center HP:{" "}
				<span style={{ color: statsColors.healthHigh }}>
					{props.village.health}/{props.village.config.maxHealth}
				</span>
			</div>

			{/* ─── Population ─── */}
			<div class={styles.sectionHeader}>Population</div>
			<div class={styles.statRow}>
				<span class={styles.statLabel}>Citizens</span>
				<span class={styles.statValue}>{s().population}</span>
			</div>
			<div class={styles.statRow}>
				<span class={styles.statLabel}>Next citizen</span>
				<span class={styles.statValue} style={{ color: metrics.growth }}>
					{turnsUntilGrowth() === Infinity ? "—" : `${turnsUntilGrowth()} turns`}
				</span>
			</div>
			<div class={styles.progressRow}>
				<span class={styles.progressTrack}>
					<span
						class={styles.progressFill}
						style={{
							width: `${growthPct()}%`,
							background: metrics.growth,
						}}
					/>
					<span
						class={`${styles.progressFill} ${styles.progressPending}`}
						style={{
							width: `${growthPendingPct()}%`,
							"--pending-color": metrics.growth,
						}}
					/>
				</span>
				<span class={styles.valueMax}>
					{Math.floor(s().growthBucket)}/{s().growthBucketMax}
				</span>
			</div>

			{/*
			 * Yield per turn — only the three CHANNELED metrics belong here.
			 * Happiness is a status snapshot and is shown in its own section
			 * below, not as a rate.
			 */}
			<div class={styles.sectionHeader}>Yield per turn</div>
			<div class={styles.statRow}>
				<span class={styles.statLabel}>
					<span class={styles.dot} style={{ background: metrics.resources }} />
					Resources
				</span>
				<span class={styles.statValue} style={{ color: metrics.resources }}>
					{signed(s().yieldPerTurn.resources)}
				</span>
			</div>
			<div class={styles.statRow}>
				<span class={styles.statLabel}>
					<span class={styles.dot} style={{ background: metrics.growth }} />
					Growth
				</span>
				<span class={styles.statValue} style={{ color: metrics.growth }}>
					{signed(s().yieldPerTurn.growth)}
				</span>
			</div>
			<div class={styles.statRow}>
				<span class={styles.statLabel}>
					<span class={styles.dot} style={{ background: metrics.knowledge }} />
					Knowledge
				</span>
				<span class={styles.statValue} style={{ color: metrics.knowledge }}>
					{signed(s().yieldPerTurn.knowledge)}
				</span>
			</div>

			{/* ─── Current happiness (snapshot status, not a per-turn rate) ─── */}
			<div class={styles.sectionHeader}>Happiness</div>
			<div class={styles.statRow}>
				<span class={styles.statLabel}>Level</span>
				<span class={styles.statValue} style={{ color: BAND_COLOR[s().happinessBand] }}>
					{s().happiness} · {BAND_LABEL[s().happinessBand]}
				</span>
			</div>

			{/* ─── Realm knowledge treasury (the only realm-level metric) ─── */}
			<div class={styles.sectionHeader}>Realm</div>
			<div class={styles.statRow}>
				<span class={styles.statLabel}>
					<span class={styles.dot} style={{ background: metrics.knowledge }} />
					Knowledge
				</span>
				<span class={styles.statValue}>{s().realmKnowledge}</span>
			</div>
		</div>
	);
}
