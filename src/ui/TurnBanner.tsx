import { Show, createSignal, onMount } from "solid-js";
import styles from "./TurnBanner.module.css";

export default function TurnBanner(props: {
	name: string;
	color: string;
	turnNumber: number;
	visible: boolean;
	onDone: () => void;
}) {
	const [fading, setFading] = createSignal(false);

	const startFade = () => {
		setFading(true);
		setTimeout(() => props.onDone(), 500);
	};

	return (
		<Show when={props.visible}>
			<FadeIn onFaded={startFade} />
			<div
				class={styles.overlay}
				classList={{ [styles.fadeOut]: fading() }}
				onClick={() => startFade()}
			>
				<div class={styles.banner}>
					<div class={styles.turnLabel}>Turn {props.turnNumber}</div>
					<div class={styles.teamRow}>
						<span class={styles.dot} style={{ background: props.color }} />
						<span style={{ color: props.color }}>{props.name}'s Turn</span>
					</div>
				</div>
			</div>
		</Show>
	);
}

function FadeIn(props: { onFaded: () => void }) {
	onMount(() => {
		setTimeout(() => props.onFaded(), 1200);
	});
	return null;
}
