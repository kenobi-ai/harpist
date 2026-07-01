import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { buildReplayBundle } from "./replay";
import { type BridgeContext, harpistRouter } from "./router";
import type { BridgeStore } from "./store";

const shouldLog = (error: unknown) =>
	!(error instanceof ORPCError) ||
	error.code === "INTERNAL_SERVER_ERROR" ||
	error.cause !== undefined;

const logError = (error: unknown) => {
	if (shouldLog(error)) {
		console.error("[harpist] oRPC request failed", error);
	}
};

const allowedCorsOrigin = (origin: string) => {
	if (!origin) {
		return origin;
	}
	try {
		const url = new URL(origin);
		if (
			url.protocol === "chrome-extension:" ||
			url.protocol === "moz-extension:" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "localhost"
		) {
			return origin;
		}
	} catch {
		return "";
	}
	return "";
};

const docsPage = (host: string) =>
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

const httpMethods = ["delete", "get", "head", "options", "patch", "post", "put", "trace"] as const;

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

const openApiWithReplayExamples = async (input: {
	openapi: unknown;
	profile: Awaited<ReturnType<BridgeStore["getProfile"]>>;
	store: BridgeStore;
}) => {
	if (!input.profile) {
		return input.openapi;
	}
	const next = cloneJson(input.openapi);
	if (!isRecord(next) || !isRecord(next.paths)) {
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

export const createHarpistBridgeServer = (options: {
	bridgeUrl: string;
	store: BridgeStore;
}) => {
	const context: BridgeContext = {
		bridgeUrl: options.bridgeUrl,
		store: options.store,
	};
	const app = new Hono();
	const rpcHandler = new RPCHandler(harpistRouter, {
		interceptors: [onError(logError)],
	});
	const openApiHandler = new OpenAPIHandler(harpistRouter, {
		interceptors: [onError(logError)],
		plugins: [
			new OpenAPIReferencePlugin({
				docsPath: "/openapi",
				schemaConverters: [new ZodToJsonSchemaConverter()],
				specGenerateOptions: {
					info: {
						title: "Harpist Bridge API",
						version: "0.1.0",
					},
				},
				specPath: "/openapi/spec.json",
			}),
		],
	});

	app.use(
		"/rpc/*",
		cors({
			allowHeaders: ["Content-Type"],
			allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			origin: allowedCorsOrigin,
		}),
	);

	app.get("/", (c) =>
		c.json({
			docs: "/openapi",
			name: "Harpist Bridge",
			openapi: "/openapi/spec.json",
			rpc: "/rpc",
		}),
	);

	app.get("/health", (c) =>
		c.json({
			name: "harpist-bridge",
			ok: true,
			time: new Date().toISOString(),
			version: "0.1.0",
		}),
	);

	app.get("/profiles/:host/docs", (c) => c.html(docsPage(c.req.param("host"))));

	app.get("/profiles/:host/scalar", (c) =>
		c.redirect(`/profiles/${encodeURIComponent(c.req.param("host"))}/docs`),
	);

	app.get("/profiles/:host/profile.json", async (c) => {
		const profile = await options.store.getProfile(c.req.param("host"));
		if (!profile) {
			return c.json(
				{
					error: "Unknown profile.",
				},
				404,
			);
		}
		return c.json(profile);
	});

	app.get("/profiles/:host/replay.txt", async (c) => {
		const host = c.req.param("host");
		const profile = await options.store.getProfile(host);
		if (!profile) {
			return c.text("Unknown profile.", 404);
		}
		try {
			const bundle = buildReplayBundle({
				method: c.req.query("method"),
				operationName: c.req.query("operationName"),
				path: c.req.query("path"),
				profile,
				recordings: await options.store.listStoredRecordings(host),
				templateKey: c.req.query("templateKey"),
			});
			const warnings =
				bundle.warnings.length > 0
					? `${bundle.warnings
							.map((warning) => `# warning: ${warning}`)
							.join("\n")}\n`
					: "";
			return c.text(`${warnings}${bundle.curl}`);
		} catch (error) {
			return c.text(
				error instanceof Error ? error.message : String(error),
				400,
			);
		}
	});

	app.get("/profiles/:host/openapi.json", async (c) => {
		const host = c.req.param("host");
		const profile = await options.store.getProfile(host);
		const openapi = profile
			? await options.store.readProfileOpenApi(host)
			: null;
		if (!openapi) {
			return c.json(
				{
					error: "No generated OpenAPI artifact has been written yet.",
				},
				404,
			);
		}
		return c.json(openapi);
	});

	app.get("/profiles/:host/openapi.scalar.json", async (c) => {
		const host = c.req.param("host");
		const profile = await options.store.getProfile(host);
		const openapi = profile
			? await options.store.readProfileOpenApi(host)
			: null;
		if (!openapi) {
			return c.json(
				{
					error: "No generated OpenAPI artifact has been written yet.",
				},
				404,
			);
		}
		return c.json(
			await openApiWithReplayExamples({
				openapi,
				profile,
				store: options.store,
			}),
		);
	});

	app.use("/rpc/*", async (c, next) => {
		const result = await rpcHandler.handle(c.req.raw, {
			context,
			prefix: "/rpc",
		});
		return result.matched
			? c.newResponse(result.response.body, result.response)
			: next();
	});

	app.use("*", async (c, next) => {
		const result = await openApiHandler.handle(c.req.raw, {
			context,
		});
		return result.matched
			? c.newResponse(result.response.body, result.response)
			: next();
	});

	return app;
};
