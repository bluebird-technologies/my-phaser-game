import { Show, For } from "solid-js";
import { Entity, TEAM_BLUE, isUnit } from "../entities";
import { ActionId, ACTIONS } from "../actions";
import { teamsCss, stats } from "../theme";
import styles from "./EntityCard.module.css";

function StatBar(props: { value: number; max: number; color: string }) {
	const filled = () => Math.round((props.value / props.max) * 10);
	const empty = () => 10 - filled();
	return (
		<span style={{ color: props.color }}>
			{"█".repeat(filled())}
			{"░".repeat(empty())}
		</span>
	);
}

export default function EntityCard(props: { entity: Entity; label?: string }) {
	const ent = () => props.entity;
	const cfg = () => ent().config;
	const teamName = () => (ent().team === TEAM_BLUE ? "Blue" : "Red");
	const teamColor = () => (ent().team === TEAM_BLUE ? teamsCss.blue : teamsCss.red);

	const hpPct = () => Math.round((ent().health / cfg().maxHealth) * 100);
	const hpColor = () =>
		hpPct() > 50 ? stats.healthHigh : hpPct() > 25 ? stats.healthMid : stats.healthLow;

	const stColor = () =>
		ent().stamina > 2
			? stats.staminaHigh
			: ent().stamina > 0
				? stats.staminaMid
				: stats.staminaEmpty;

	const actionIds = (): ActionId[] =>
		cfg().actions ? (Object.keys(cfg().actions!) as ActionId[]) : [];

	const cardClass = () => (props.label === "Target" ? styles.cardTarget : styles.card);

	return (
		<div class={cardClass()}>
			<Show when={props.label}>
				<div class={styles.label}>{props.label}</div>
			</Show>

			<div class={styles.name}>
				{cfg().label}{" "}
				<span class={styles.teamTag} style={{ color: teamColor() }}>
					[{teamName()}]
				</span>
			</div>

			<div class={styles.statRow}>
				Health: <StatBar value={ent().health} max={cfg().maxHealth} color={hpColor()} />{" "}
				{ent().health}/{cfg().maxHealth}
			</div>

			<Show when={isUnit(ent())}>
				<div class={styles.statRow}>
					Stamina:{" "}
					<StatBar value={ent().stamina} max={cfg().maxStamina} color={stColor()} />{" "}
					{ent().stamina}/{cfg().maxStamina}
				</div>
				<For each={actionIds()}>
					{(id) => {
						const max = () => cfg().actions?.[id]?.chargesPerTurn ?? 0;
						const remaining = () => ent().charges[id] ?? 0;
						const chargeColor = () =>
							remaining() > 0 ? stats.attackReady : stats.attackSpent;
						const def = ACTIONS[id];
						return (
							<div class={styles.statRow}>
								{def?.label ?? id}:{" "}
								<span style={{ color: chargeColor() }}>
									{(def?.icon ?? "●").repeat(remaining())}
									{"·".repeat(Math.max(0, max() - remaining()))}
								</span>{" "}
								{remaining()}/{max()}
							</div>
						);
					}}
				</For>
			</Show>
		</div>
	);
}
