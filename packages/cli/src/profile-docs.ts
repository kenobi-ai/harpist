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

export const docsPage = (host: string) =>
	[
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8" />',
		'<meta name="viewport" content="width=device-width, initial-scale=1" />',
		`<title>Harpist · ${host}</title>`,
		"<style>",
		"body{margin:0}",
		".light-mode{--scalar-color-accent:#08090b;--scalar-background-1:#ffffff;--scalar-border-color:#d4d4d8}",
		"</style>",
		"</head>",
		'<body><div id="app"></div>',
		'<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>',
		"<script>",
		"Scalar.createApiReference('#app',{",
		`url:'/profiles/${encodeURIComponent(host)}/openapi.scalar.json',`,
		"defaultHttpClient:{targetKey:'shell',clientKey:'curl'},",
		"documentDownloadType:'none',",
		"forceDarkModeState:'light',",
		"hiddenClients:true,",
		"hideTestRequestButton:true,",
		"layout:'modern',",
		"showOperationId:false,",
		"theme:'default',",
		"withDefaultFonts:true,",
		"})",
		"</script>",
		"</body>",
		"</html>",
	].join("\n");

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
