import Phaser from "phaser";
import { HexGridScene } from "./scenes/HexGridScene";

const config: Phaser.Types.Core.GameConfig = {
	type: Phaser.AUTO,
	parent: "phaser-container",
	width: 1280,
	height: 720,
	backgroundColor: "#1a1a2e",
	scale: {
		mode: Phaser.Scale.FIT,
		autoCenter: Phaser.Scale.CENTER_BOTH,
	},
	scene: [HexGridScene],
};

new Phaser.Game(config);
