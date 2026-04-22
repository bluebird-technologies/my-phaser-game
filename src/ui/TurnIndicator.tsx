import styles from "./TurnIndicator.module.css";

export default function TurnIndicator(props: { name: string; color: string; turnNumber: number }) {
	return (
		<div class={styles.indicator}>
			<span class={styles.turn}>Turn {props.turnNumber}</span>
			<span class={styles.divider}>·</span>
			<span class={styles.dot} style={{ background: props.color }} />
			<span>{props.name}'s Turn</span>
		</div>
	);
}
