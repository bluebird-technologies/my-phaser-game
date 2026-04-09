import styles from "./EndTurnButton.module.css";

export default function EndTurnButton(props: { onClick: () => void }) {
	return (
		<button class={styles.button} onClick={props.onClick}>
			End Turn
		</button>
	);
}
