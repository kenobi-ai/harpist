import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
	manifest: {
		action: {
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
	modules: ["@wxt-dev/module-react"],
	vite: () => ({
		plugins: [tailwindcss()],
	}),
});
