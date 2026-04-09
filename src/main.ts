import Phaser from "phaser";
import { HexGridScene } from "./scenes/HexGridScene";

const config: Phaser.Types.Core.GameConfig = {
	type: Phaser.AUTO,
	parent: "phaser-container",
	width: window.innerWidth,
	height: window.innerHeight,
	backgroundColor: "#1a1a2e",
	scale: {
		mode: Phaser.Scale.RESIZE,
	},
	scene: [HexGridScene],
};

new Phaser.Game(config);
