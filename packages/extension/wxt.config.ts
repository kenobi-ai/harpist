import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
	manifest: {
		action: {
			default_icon: {
				16: "icons/16.png",
				32: "icons/32.png",
				48: "icons/48.png",
				128: "icons/128.png",
			},
			default_title: "Harpist",
		},
		description: "Record website traffic and prepare API contracts for agents.",
		host_permissions: ["<all_urls>"],
		name: "Harpist",
		permissions: [
			"debugger",
			"downloads",
			"storage",
			"tabs",
			"unlimitedStorage",
		],
	},
	modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
	outDir: "dist",
	vite: () => ({
		plugins: [tailwindcss()],
	}),
});
