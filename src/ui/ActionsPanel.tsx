import { Show } from "solid-js";
import { Entity } from "../entities";
import EntityCard from "./EntityCard";
import styles from "./ActionsPanel.module.css";

export default function ActionsPanel(props: { entity: Entity | null; target?: Entity | null }) {
	return (
		<Show when={props.entity}>
			{(ent) => (
				<div class={styles.panel}>
					<EntityCard entity={ent()} label={props.target ? "Attacker" : undefined} />
					<Show when={props.target}>
						{(tgt) => (
							<>
								<div class={styles.separator}>⚔</div>
								<EntityCard entity={tgt()} label="Target" />
							</>
						)}
					</Show>
				</div>
			)}
		</Show>
	);
}
