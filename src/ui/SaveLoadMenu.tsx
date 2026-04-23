import { createSignal, For, Show } from "solid-js";
import { listSaves, deleteSave, type SaveEntry } from "../saveLoad";
import styles from "./SaveLoadMenu.module.css";

export default function SaveLoadMenu(props: {
	visible: boolean;
	onClose: () => void;
	onSave: (name: string) => void;
	onLoad: (name: string) => void;
}) {
	const [tab, setTab] = createSignal<"save" | "load">("save");
	const [saveName, setSaveName] = createSignal("");
	const [saves, setSaves] = createSignal<SaveEntry[]>([]);
	const [feedback, setFeedback] = createSignal<string | null>(null);

	const refreshSaves = () => setSaves(listSaves());

	const handleOpen = () => {
		refreshSaves();
		setFeedback(null);
	};

	const handleSave = () => {
		const name = saveName().trim();
		if (!name) return;
		props.onSave(name);
		setSaveName("");
		setFeedback(`Saved "${name}"`);
		refreshSaves();
	};

	const handleLoad = (name: string) => {
		props.onLoad(name);
	};

	const handleDelete = (e: MouseEvent, name: string) => {
		e.stopPropagation();
		deleteSave(name);
		refreshSaves();
	};

	const formatDate = (ts: number) => {
		const d = new Date(ts);
		return d.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<Show when={props.visible}>
			{(() => {
				handleOpen();
				return null;
			})()}
			<div class={styles.overlay} onClick={() => props.onClose()}>
				<div class={styles.panel} onClick={(e) => e.stopPropagation()}>
					<div class={styles.header}>
						<span class={styles.title}>Game Menu</span>
						<button class={styles.closeBtn} onClick={() => props.onClose()}>
							X
						</button>
					</div>

					<div class={styles.tabs}>
						<button
							class={`${styles.tab} ${tab() === "save" ? styles.tabActive : ""}`}
							onClick={() => {
								setTab("save");
								setFeedback(null);
							}}
						>
							Save Game
						</button>
						<button
							class={`${styles.tab} ${tab() === "load" ? styles.tabActive : ""}`}
							onClick={() => {
								setTab("load");
								setFeedback(null);
								refreshSaves();
							}}
						>
							Load Game
						</button>
					</div>

					<Show when={tab() === "save"}>
						<div class={styles.saveForm}>
							<input
								class={styles.input}
								type="text"
								placeholder="Save name..."
								value={saveName()}
								onInput={(e) => setSaveName(e.currentTarget.value)}
								onKeyDown={(e) => e.key === "Enter" && handleSave()}
							/>
							<button
								class={styles.saveBtn}
								disabled={!saveName().trim()}
								onClick={handleSave}
							>
								Save
							</button>
						</div>

						<Show when={saves().length > 0}>
							<div class={styles.saveList}>
								<For each={saves()}>
									{(entry) => (
										<div
											class={styles.saveEntry}
											onClick={() => {
												setSaveName(entry.name);
											}}
										>
											<span class={styles.saveInfo}>
												<span class={styles.saveName}>{entry.name}</span>
												<span class={styles.saveMeta}>
													Turn {entry.turnNumber} ·{" "}
													{formatDate(entry.timestamp)}
												</span>
											</span>
										</div>
									)}
								</For>
							</div>
						</Show>
					</Show>

					<Show when={tab() === "load"}>
						<Show
							when={saves().length > 0}
							fallback={<div class={styles.empty}>No saved games</div>}
						>
							<div class={styles.saveList}>
								<For each={saves()}>
									{(entry) => (
										<div
											class={styles.saveEntry}
											onClick={() => handleLoad(entry.name)}
										>
											<span class={styles.saveInfo}>
												<span class={styles.saveName}>{entry.name}</span>
												<span class={styles.saveMeta}>
													Turn {entry.turnNumber} ·{" "}
													{formatDate(entry.timestamp)}
												</span>
											</span>
											<button
												class={styles.deleteBtn}
												onClick={(e) => handleDelete(e, entry.name)}
											>
												X
											</button>
										</div>
									)}
								</For>
							</div>
						</Show>
					</Show>

					<Show when={feedback()}>
						<div class={styles.feedback}>{feedback()}</div>
					</Show>
				</div>
			</div>
		</Show>
	);
}
