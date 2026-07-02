import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  outDir: "dist",
	manifest: {
		action: {
			default_icon: {
				16: "icon/16.png",
				32: "icon/32.png",
				48: "icon/48.png",
				128: "icon/128.png",
			},
			default_title: "Harpist",
		},
		description: "Record website traffic and prepare API contracts for agents.",
		host_permissions: ["<all_urls>"],
		icons: {
			16: "icon/16.png",
			32: "icon/32.png",
			48: "icon/48.png",
			96: "icon/96.png",
			128: "icon/128.png",
		},
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
