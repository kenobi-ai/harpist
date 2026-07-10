import { buildReplayBundle } from "./replay";
import type { BridgeStore } from "./store";

const httpMethods = [
	"delete",
	"get",
	"head",
	"options",
	"patch",
	"post",
	"put",
	"trace",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const replaySource = (warnings: string[], curl: string) =>
	[...warnings.map((warning) => `# warning: ${warning}`), curl].join("\n");

const replayCommandSource = (command: string) =>
	[
		"# Uses the latest Harpist auth at runtime; no credential values are stored in contract.ts.",
		command,
	].join("\n");

const escapeHtml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

const docsThemeStyle = `
:root {
	--harpist-font-display: "Jacquard 24", serif;
	--harpist-font-heading: "Grenze", Helvetica, Arial, ui-sans-serif, system-ui, sans-serif;
	--harpist-font-marginalia: "IM Fell English", "Iowan Old Style", Georgia, serif;
	--harpist-font-sans: "Geist", Helvetica, Arial, ui-sans-serif, system-ui, sans-serif;
	--harpist-font-mono: "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace;
	--harpist-color-olive-50: #f7f2e0;
	--harpist-color-olive-100: #f0e9d2;
	--harpist-color-olive-200: #e5dab6;
	--harpist-color-ink: #2b2117;
	--harpist-color-rubric: #9e0812;
	--harpist-color-oxblood: #431c14;
	--harpist-color-verdigris: #075f4a;
	--harpist-color-verdigris-dark: #1e3a36;
	--harpist-parchment-speckle: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.33 0 0 0 0 0.26 0 0 0 0 0.14 0 0 0 0.14 0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23s)'/%3E%3C/svg%3E");
	--harpist-parchment-mottle: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.008 0.011' numOctaves='3' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.45 0 0 0 0 0.36 0 0 0 0 0.18 0 0 0 0.1 0'/%3E%3C/filter%3E%3Crect width='600' height='600' filter='url(%23m)'/%3E%3C/svg%3E");
	--harpist-wavy-rule-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='144' height='12' viewBox='0 0 144 12'%3E%3Cpath d='M0 6 Q4.5 1.5 9 5.8 Q13.5 10 18 6.2 Q22.5 2 27 5.9 Q31.5 9.8 36 6 Q40.5 1.8 45 5.7 Q49.5 9.9 54 6.1 Q58.5 2.2 63 5.8 Q67.5 9.7 72 6 Q76.5 1.6 81 5.9 Q85.5 10 90 6.2 Q94.5 2 99 5.8 Q103.5 9.9 108 6 Q112.5 1.9 117 6 Q121.5 9.8 126 5.9 Q130.5 1.7 135 6.1 Q139.5 10 144 6' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E");
	color-scheme: light;
}

* {
	box-sizing: border-box;
}

html {
	min-height: 100%;
	background: var(--harpist-color-olive-100);
}

body {
	min-height: 100%;
	margin: 0;
	background-color: var(--harpist-color-olive-100);
	background-image:
		var(--harpist-parchment-speckle),
		var(--harpist-parchment-mottle);
	color: var(--harpist-color-ink);
	font-family: var(--harpist-font-sans);
	text-rendering: optimizeLegibility;
	-webkit-font-smoothing: antialiased;
}

.harpist-docs-topline {
	height: 6px;
	background: var(--harpist-color-rubric);
}

.harpist-docs-header {
	position: sticky;
	top: 0;
	z-index: 10;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	border-bottom: 1px solid rgb(43 33 23 / 0.25);
	background-color: var(--harpist-color-ink);
	background-image:
		var(--harpist-parchment-speckle),
		var(--harpist-parchment-mottle);
	color: #fff8df;
	padding: 0.45rem clamp(1rem, 3vw, 2rem);
}

.harpist-docs-brand {
	color: inherit;
	font-family: var(--harpist-font-display);
	font-size: clamp(2rem, 5vw, 2.45rem);
	line-height: 1;
	text-decoration: none;
}

.harpist-docs-title {
	min-width: 0;
	text-align: right;
}

.harpist-docs-title span {
	display: block;
	color: rgb(255 248 223 / 0.68);
	font-family: var(--harpist-font-marginalia);
	font-size: 0.875rem;
	font-style: italic;
	line-height: 1;
}

.harpist-docs-title strong {
	display: block;
	overflow: hidden;
	max-width: min(52vw, 34rem);
	color: var(--harpist-color-olive-50);
	font-family: var(--harpist-font-heading);
	font-size: clamp(1.15rem, 3vw, 1.55rem);
	line-height: 1.1;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.harpist-docs-rule {
	height: 10px;
	background-color: var(--harpist-color-rubric);
	mask-image: var(--harpist-wavy-rule-mask);
	mask-position: center;
	mask-repeat: repeat-x;
	mask-size: 144px 12px;
}

#app {
	min-height: calc(100vh - 4.5rem);
}

.light-mode {
	--scalar-font: var(--harpist-font-sans);
	--scalar-font-code: var(--harpist-font-mono);
	--scalar-color-1: var(--harpist-color-ink);
	--scalar-color-2: #51402f;
	--scalar-color-3: #79664c;
	--scalar-color-accent: var(--harpist-color-rubric);
	--scalar-background-1: var(--harpist-color-olive-50);
	--scalar-background-2: var(--harpist-color-olive-100);
	--scalar-background-3: var(--harpist-color-olive-200);
	--scalar-background-accent: rgb(158 8 18 / 0.08);
	--scalar-border-color: rgb(67 28 20 / 0.24);
	--scalar-color-green: var(--harpist-color-verdigris);
	--scalar-color-red: var(--harpist-color-rubric);
	--scalar-color-orange: #9a5a14;
	--scalar-radius: 8px;
	--scalar-radius-lg: 8px;
}

.scalar-api-reference,
.scalar-app,
.references-layout {
	background: transparent !important;
	font-family: var(--harpist-font-sans) !important;
}

.scalar-card,
.request-card,
.response-card,
.endpoint,
.section-container {
	border-color: rgb(67 28 20 / 0.22) !important;
}

code,
pre,
kbd,
samp {
	font-family: var(--harpist-font-mono);
}

@media (width < 40rem) {
	.harpist-docs-header {
		align-items: flex-start;
		flex-direction: column;
		gap: 0.35rem;
		padding-block: 0.7rem;
	}

	.harpist-docs-title {
		text-align: left;
	}

	.harpist-docs-title strong {
		max-width: calc(100vw - 2rem);
	}
}
`.trim();

export const docsPage = (host: string) => {
	const escapedHost = escapeHtml(host);
	const openApiUrl = `/profiles/${encodeURIComponent(host)}/openapi.scalar.json`;

	return [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8" />',
		'<meta name="viewport" content="width=device-width, initial-scale=1" />',
		'<meta name="theme-color" content="#2b2117" />',
		`<title>Harpist · ${escapedHost}</title>`,
		'<link rel="preconnect" href="https://fonts.googleapis.com" />',
		'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
		'<link href="https://fonts.googleapis.com/css2?family=Jacquard+24&family=Grenze:ital,wght@0,100..900;1,100..900&family=Geist:ital,wght@0,100..900;1,100..900&family=IM+Fell+English:ital@0;1&display=swap" rel="stylesheet" />',
		'<link rel="icon" href="https://harpist.kenobi.ai/favicon.png" />',
		"<style>",
		docsThemeStyle,
		"</style>",
		"</head>",
		"<body>",
		'<div aria-hidden="true" class="harpist-docs-topline"></div>',
		'<header class="harpist-docs-header">',
		'<a class="harpist-docs-brand" href="https://harpist.kenobi.ai/">harpist</a>',
		'<div class="harpist-docs-title">',
		"<span>generated api docs</span>",
		`<strong title="${escapedHost}">${escapedHost}</strong>`,
		"</div>",
		"</header>",
		'<div aria-hidden="true" class="harpist-docs-rule"></div>',
		'<div id="app"></div>',
		'<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>',
		"<script>",
		"Scalar.createApiReference('#app',{",
		`url:${JSON.stringify(openApiUrl)},`,
		"defaultHttpClient:{targetKey:'shell',clientKey:'curl'},",
		"documentDownloadType:'none',",
		"forceDarkModeState:'light',",
		"hiddenClients:true,",
		"hideTestRequestButton:true,",
		"layout:'modern',",
		"showOperationId:false,",
		"theme:'default',",
		"withDefaultFonts:false,",
		"})",
		"</script>",
		"</body>",
		"</html>",
	].join("\n");
};

export const openApiWithReplayExamples = async (input: {
	openapi: unknown;
	profile: Awaited<ReturnType<BridgeStore["getProfile"]>>;
	store: BridgeStore;
}) => {
	if (!input.profile) {
		return input.openapi;
	}
	const next = cloneJson(input.openapi);
	if (!(isRecord(next) && isRecord(next.paths))) {
		return next;
	}
	const recordings = await input.store.listStoredRecordings(input.profile.host);
	for (const pathItem of Object.values(next.paths)) {
		if (!isRecord(pathItem)) {
			continue;
		}
		for (const method of httpMethods) {
			const operation = pathItem[method];
			if (!isRecord(operation)) {
				continue;
			}
			const harpist = operation["x-harpist"];
			const endpointKey =
				isRecord(harpist) && typeof harpist.endpointKey === "string"
					? harpist.endpointKey
					: undefined;
			if (!endpointKey) {
				continue;
			}
			const replayCommand =
				isRecord(harpist) && typeof harpist.replayCommand === "string"
					? harpist.replayCommand
					: `harpist auth replay ${input.profile.host} ${endpointKey}`;
			try {
				const bundle = buildReplayBundle({
					profile: input.profile,
					recordings,
					templateKey: endpointKey,
				});
				const examples = [
					{
						label: "Harpist replay command",
						lang: "Shell",
						source: replayCommandSource(replayCommand),
					},
					{
						label:
							bundle.authValueSource === "latest-auth"
								? "Latest auth curl"
								: "Recorded auth curl",
						lang: "Shell",
						source: replaySource(bundle.warnings, bundle.curl),
					},
				];
				operation["x-codeSamples"] = examples;
				operation["x-scalar-examples"] = examples;
				const runtimeAuth =
					isRecord(harpist) && isRecord(harpist.runtimeAuth)
						? harpist.runtimeAuth
						: {};
				operation["x-harpist"] = {
					...(isRecord(harpist) ? harpist : {}),
					runtimeAuth: {
						...runtimeAuth,
						bindsCredentialValues: false,
						latestAuth: bundle.latestAuth,
						source: bundle.authValueSource,
						warnings: bundle.warnings,
					},
				};
			} catch (error) {
				operation["x-codeSamples"] = [
					{
						label: "Harpist replay command",
						lang: "Shell",
						source: replayCommandSource(replayCommand),
					},
					{
						label: "Latest auth unavailable",
						lang: "Shell",
						source: `# ${error instanceof Error ? error.message : String(error)}`,
					},
				];
				operation["x-scalar-examples"] = operation["x-codeSamples"];
			}
		}
	}
	return next;
};
