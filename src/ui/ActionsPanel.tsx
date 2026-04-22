import { Show } from "solid-js";
import { Entity, isBuilding } from "../entities";
import { ActionId, ActionContext } from "../actions";
import { SettlementStats } from "../economy";
import EntityCard from "./EntityCard";
import SettlementCard from "./SettlementCard";
import ResourceCard, { TileInfo } from "./ResourceCard";
import ActionBar from "./ActionBar";
import styles from "./ActionsPanel.module.css";

export default function ActionsPanel(props: {
	entity: Entity | null;
	target?: Entity | null;
	tileInfo?: TileInfo | null;
	actionContext?: ActionContext | null;
	onAction?: (id: ActionId) => void;
	settlementStats?: SettlementStats | null;
}) {
	return (
		<div class={styles.panel}>
			<Show when={props.entity}>
				{(ent) => (
					<>
						<Show
							when={isBuilding(ent()) && props.settlementStats}
							fallback={
								<EntityCard
									entity={ent()}
									label={props.target ? "Attacker" : undefined}
								/>
							}
						>
							<SettlementCard village={ent()} stats={props.settlementStats!} />
						</Show>
						<Show when={props.target}>
							{(tgt) => (
								<>
									<div class={styles.separator}>⚔</div>
									<EntityCard entity={tgt()} label="Target" />
								</>
							)}
						</Show>
						<Show when={!props.target && props.onAction && props.actionContext}>
							<ActionBar
								entity={ent()}
								context={props.actionContext!}
								onAction={props.onAction!}
							/>
						</Show>
					</>
				)}
			</Show>
			<Show when={props.tileInfo}>
				<ResourceCard tile={props.tileInfo!} />
			</Show>
		</div>
	);
}
