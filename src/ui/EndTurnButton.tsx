import styles from "./EndTurnButton.module.css";

export default function EndTurnButton(props: { label: string; onClick: () => void }) {
	return (
		<button class={styles.button} onClick={props.onClick}>
			{props.label}
		</button>
	);
}
