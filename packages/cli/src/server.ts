import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { BridgeHealthSnapshot } from "./bridge-runtime";
import { docsPage, openApiWithReplayExamples } from "./profile-docs";
import { buildReplayBundle } from "./replay";
import { type BridgeContext, harpistRouter } from "./router";
import type { BridgeStore } from "./store";
import { wakePage } from "./wake-page";

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

export const createHarpistBridgeServer = (options: {
	bridgeUrl: string;
	health: () => BridgeHealthSnapshot;
	store: BridgeStore;
}) => {
	const context: BridgeContext = {
		bridgeUrl: options.bridgeUrl,
		health: options.health,
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

	app.get("/health", (c) => c.json(options.health()));

	app.get("/wake", async (c) => {
		const presence = await options.store.getExtensionPresence();
		return c.html(wakePage(presence?.extensionId));
	});

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

	app.get("/profiles/:host/contract-profile.json", async (c) => {
		const host = c.req.param("host");
		const profile = await options.store.getProfile(host);
		const contractProfile = profile
			? await options.store.readProfileContractProfile(host)
			: null;
		if (!contractProfile) {
			return c.json(
				{
					error: "No generated contract profile artifact has been written yet.",
				},
				404,
			);
		}
		return c.json(contractProfile);
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
