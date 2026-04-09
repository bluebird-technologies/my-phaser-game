import styles from "./TurnIndicator.module.css";

export default function TurnIndicator(props: { name: string; color: string }) {
	return (
		<div class={styles.indicator}>
			<span class={styles.dot} style={{ background: props.color }} />
			<span>{props.name}'s Turn</span>
		</div>
	);
}
