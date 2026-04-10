import { defineConfig } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import solidPlugin from "vite-plugin-solid";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	base: "./",
	plugins: [solidPlugin()],
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, "index.html"),
				kitchenSink: resolve(__dirname, "kitchen-sink/index.html"),
			},
		},
	},
});
