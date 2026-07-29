import { readFile } from "node:fs/promises";
import { endpointSummarySchema } from "../../core/src/bridge-contract";
import type { EndpointSummary } from "../../core/src/profiles";
import type { BridgeStore } from "./store";

declare const Bun: {
	stdin: {
		text: () => Promise<string>;
	};
};

const required = (value: string | undefined, message: string) => {
	if (!value) {
		throw new Error(message);
	}
	return value;
};

const readInputFile = (path: string) =>
	path === "-" ? Bun.stdin.text() : readFile(path, "utf8");

export const runEndpointCommand = async (
	store: BridgeStore,
	args: string[],
) => {
	const subcommand = args[0];
	if (subcommand !== "upsert" && subcommand !== "remove") {
		return null;
	}
	if (args.length !== 3) {
		throw new Error(
			subcommand === "upsert"
				? "Usage: harpist endpoints upsert <host> <endpoint.json|->"
				: "Usage: harpist endpoints remove <host> <templateKey>",
		);
	}
	const host = required(args[1], "Missing host.");
	if (subcommand === "upsert") {
		const raw = await readInputFile(required(args[2], "Missing file path."));
		let input: unknown;
		try {
			input = JSON.parse(raw);
		} catch (error) {
			throw new Error(
				`Invalid endpoint JSON: ${
					error instanceof Error ? error.message : error
				}`,
			);
		}
		const parsed = endpointSummarySchema.safeParse(input);
		if (!parsed.success) {
			throw new Error(
				`Invalid endpoint JSON: ${parsed.error.issues
					.map(
						(issue) =>
							`${issue.path.join(".") || "endpoint"}: ${issue.message}`,
					)
					.join("; ")}`,
			);
		}
		const endpoint = parsed.data as EndpointSummary;
		const profile = await store.upsertEndpoint(host, endpoint);
		return {
			action: "upserted",
			endpointCount: profile.endpoints.length,
			host,
			templateKey: endpoint.templateKey,
		};
	}
	const templateKey = required(args[2], "Missing template key.");
	const profile = await store.removeEndpoint(host, templateKey);
	return {
		action: "removed",
		endpointCount: profile.endpoints.length,
		host,
		templateKey,
	};
};
