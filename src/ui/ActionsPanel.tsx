import { Show } from "solid-js";
import { Entity } from "../entities";
import EntityCard from "./EntityCard";
import ResourceCard, { TileInfo } from "./ResourceCard";
import styles from "./ActionsPanel.module.css";

export default function ActionsPanel(props: {
	entity: Entity | null;
	target?: Entity | null;
	tileInfo?: TileInfo | null;
}) {
	return (
		<div class={styles.panel}>
			<Show when={props.entity}>
				{(ent) => (
					<>
						<EntityCard entity={ent()} label={props.target ? "Attacker" : undefined} />
						<Show when={props.target}>
							{(tgt) => (
								<>
									<div class={styles.separator}>⚔</div>
									<EntityCard entity={tgt()} label="Target" />
								</>
							)}
						</Show>
					</>
				)}
			</Show>
			<Show when={!props.entity && props.tileInfo}>
				<ResourceCard tile={props.tileInfo!} />
			</Show>
		</div>
	);
}
