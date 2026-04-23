import { For, Show } from "solid-js";
import { Entity, ENTITY_CONFIGS } from "../entities";
import {
	ActionId,
	ActionDefinition,
	ActionContext,
	getAvailableActions,
	getUnitActionConfig,
	remainingCharges,
} from "../actions";
import { stats, metrics } from "../theme";
import styles from "./ActionBar.module.css";

function PersonIcon(props: { color: string }) {
	return (
		<svg width="9" height="12" viewBox="0 0 9 12" class={styles.costIcon}>
			<circle cx="4.5" cy="2.5" r="2.5" fill={props.color} />
			<path d="M1 12 Q1 7 4.5 7 Q8 7 8 12Z" fill={props.color} />
		</svg>
	);
}

export default function ActionBar(props: {
	entity: Entity | null;
	context: ActionContext | null;
	onAction: (id: ActionId) => void;
}) {
	const actions = (): ActionDefinition[] => {
		if (!props.entity) return [];
		return getAvailableActions(props.entity).filter((a) => !a.requiresTarget);
	};

	const settlement = () => {
		if (!props.entity || !props.context) return null;
		return props.context.getSettlement?.(props.entity) ?? null;
	};

	return (
		<Show when={props.entity && actions().length > 0 && props.context}>
			<div class={styles.bar}>
				<For each={actions()}>
					{(action) => {
						const ent = () => props.entity!;
						const cfg = () => getUnitActionConfig(ent().config.type, action.id);
						const enabled = () => action.canExecute(ent(), props.context!);
						const reason = () =>
							!enabled() && action.whyDisabled
								? action.whyDisabled(ent(), props.context!)
								: null;

						const production = () => {
							if (!action.producesUnit) return null;
							const s = settlement();
							if (!s?.currentProduction) return null;
							if (s.currentProduction.unitType !== action.producesUnit) return null;
							return s.currentProduction;
						};
						const isProducing = () => production() !== null;
						const progressPct = () => {
							const p = production();
							if (!p || p.resourceCost <= 0) return 0;
							return Math.min(
								100,
								Math.max(0, (p.resourceProgress / p.resourceCost) * 100),
							);
						};
						const pendingPct = () => {
							const p = production();
							if (!p || p.resourceCost <= 0) return 0;
							const rate = props.context?.getResourcesPerTurn?.(ent()) ?? 0;
							const remaining = p.resourceCost - p.resourceProgress;
							const gain = Math.min(rate, remaining);
							return Math.max(0, (gain / p.resourceCost) * 100);
						};
						const turnsLeft = () => {
							const p = production();
							if (!p) return null;
							const rate = props.context?.getResourcesPerTurn?.(ent()) ?? 0;
							if (rate <= 0) return Infinity;
							const remaining = p.resourceCost - p.resourceProgress;
							return Math.max(1, Math.ceil(remaining / rate));
						};
						const cache = () => settlement()?.resourceCache ?? 0;

						const staminaCost = () => cfg()?.staminaCost ?? 0;
						const staminaCurrent = () => ent().stamina;
						const staminaShort = () => staminaCurrent() < staminaCost();
						const chargesLeft = () => remainingCharges(ent(), action.id);
						const chargesMax = () => cfg()?.chargesPerTurn ?? 0;
						const chargesShort = () => chargesLeft() < 1;
						const hasResourceCosts =
							action.popCost != null || action.resourceCost != null;

						return (
							<Show
								when={!isProducing()}
								fallback={
									<button
										class={`${styles.button} ${styles.producing}`}
										title="Click to cancel"
										onClick={() => props.onAction(action.id)}
									>
										<span class={styles.producingRow}>
											<Show when={action.icon}>
												<span class={styles.icon}>{action.icon}</span>
											</Show>
											<span class={styles.label}>
												{ENTITY_CONFIGS[production()!.unitType].category ===
												"building"
													? "Building"
													: "Training"}{" "}
												{ENTITY_CONFIGS[production()!.unitType].label}
											</span>
											<span
												class={styles.turnsLeft}
												style={{ color: metrics.resources }}
											>
												{turnsLeft() === Infinity
													? "—"
													: `${turnsLeft()} ${turnsLeft() === 1 ? "turn" : "turns"}`}
											</span>
										</span>
										<span class={styles.progressWrap}>
											<span class={styles.progressTrack}>
												<span
													class={styles.progressFill}
													style={{
														width: `${progressPct()}%`,
														background: metrics.resources,
													}}
												/>
												<span
													class={`${styles.progressFill} ${styles.progressPending}`}
													style={{
														width: `${pendingPct()}%`,
														"--pending-color": metrics.resources,
													}}
												/>
											</span>
											<span
												class={styles.progressText}
												style={{ color: metrics.resources }}
											>
												{Math.max(
													0,
													Math.floor(production()!.resourceProgress),
												)}
												/{production()!.resourceCost}
											</span>
										</span>
										<span class={styles.cancelHint}>click to cancel</span>
									</button>
								}
							>
								<button
									class={`${styles.button} ${action.description || (hasResourceCosts && cache() > 0) ? styles.withDesc : ""}`}
									disabled={!enabled()}
									title={reason() ?? action.label}
									onClick={() => enabled() && props.onAction(action.id)}
								>
									<span class={styles.headerRow}>
										<Show when={action.icon}>
											<span class={styles.icon}>{action.icon}</span>
										</Show>
										<span class={styles.label}>{action.label}</span>
										<Show
											when={hasResourceCosts}
											fallback={
												<span class={styles.costs}>
													<span class={styles.cost}>
														⚡
														<span
															style={{
																color: staminaShort()
																	? stats.healthLow
																	: stats.staminaHigh,
															}}
														>
															{staminaCurrent()}
														</span>
														<span class={styles.costMax}>
															/{staminaCost()}
														</span>
													</span>
													<span class={styles.cost}>
														<span
															style={{
																color: chargesShort()
																	? stats.healthLow
																	: stats.attackReady,
															}}
														>
															{chargesLeft()}
														</span>
														<span class={styles.costMax}>
															/{chargesMax()}
														</span>
													</span>
												</span>
											}
										>
											<span class={styles.costs}>
												<Show when={action.popCost != null}>
													<span class={styles.cost}>
														<PersonIcon color={metrics.growth} />
														<span
															style={{
																color: metrics.growth,
															}}
														>
															{action.popCost}
														</span>
													</span>
												</Show>
												<Show when={action.resourceCost != null}>
													<span class={styles.cost}>
														<span
															class={styles.dot}
															style={{
																background: metrics.resources,
															}}
														/>
														<span
															style={{
																color: metrics.resources,
															}}
														>
															{action.resourceCost}
														</span>
													</span>
												</Show>
											</span>
										</Show>
									</span>
									<Show
										when={
											action.description || (hasResourceCosts && cache() > 0)
										}
									>
										<Show when={action.description}>
											<span class={styles.description}>
												{action.description}
											</span>
										</Show>
										<Show when={hasResourceCosts && cache() > 0}>
											<span
												class={styles.description}
												style={{ color: metrics.resources }}
											>
												{Math.floor(cache())} resources cached
											</span>
										</Show>
									</Show>
								</button>
							</Show>
						);
					}}
				</For>
			</div>
		</Show>
	);
}
