#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import {
	buildAgentHandoffText,
	DEFAULT_SETTINGS,
	normaliseServerUrl,
} from "../../core/src/profiles";
import { applyProfileDocs, reviewProfileDocs } from "./docs";
import { refineLatestProfile } from "./refine";
import { buildReplayBundle } from "./replay";
import { createHarpistBridgeServer } from "./server";
import { createBridgeStore } from "./store";
import { renderHarpistCliUsage } from "./surface";

declare const Bun: {
	stdin: {
		text: () => Promise<string>;
	};
	serve: (options: {
		fetch: (request: Request) => Response | Promise<Response>;
		hostname?: string;
		port: number;
	}) => void;
};

const port = Number(process.env.HARPIST_PORT ?? 4277);
const hostname = process.env.HARPIST_HOST ?? "127.0.0.1";
const workingDirectory = process.env.INIT_CWD ?? process.cwd();
const dataDir =
	process.env.HARPIST_DATA_DIR ?? join(workingDirectory, ".harpist-data");
const bridgeUrl = `http://${hostname}:${port}`;
const store = createBridgeStore(dataDir);

const printJson = (value: unknown) => {
	console.log(JSON.stringify(value, null, 2));
};

const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

const hostArg = (value?: string) => value ?? fail("Missing host.");

const fileArg = (value?: string) => value ?? fail("Missing file path.");

const profileForHost = async (host: string) => {
	const profile = await store.getProfile(host);
	if (!profile) {
		fail(`Unknown profile '${host}'.`);
	}
	return profile;
};

const recordingSummary = (recording: unknown) => {
	if (
		typeof recording !== "object" ||
		recording === null ||
		!("har" in recording)
	) {
		return recording;
	}
	const { har: _har, ...summary } = recording as Record<string, unknown>;
	return summary;
};

const refineSummary = (
	result: Awaited<ReturnType<typeof refineLatestProfile>>,
) => ({
	artifacts: result.profile.artifacts
		? {
				contract: result.profile.artifacts.contractPath,
				contractProfile: result.profile.artifacts.contractProfilePath,
				openapi: result.profile.artifacts.openapiPath,
				status: result.profile.artifacts.status,
				updatedAt: result.profile.artifacts.updatedAt,
			}
		: undefined,
	docs: result.profile.remoteDocsUrl,
	excludedEndpointCount: result.excludedEndpointCount,
	host: result.host,
	includedEndpointCount: result.includedEndpointCount,
	openapiPathCount: result.openapiPathCount,
	recordingId: result.recordingId,
});

const readInputFile = async (path: string) =>
	path === "-" ? Bun.stdin.text() : readFile(path, "utf8");

const usage = () => {
	console.log(renderHarpistCliUsage());
};

const serveBridge = () => {
	const app = createHarpistBridgeServer({
		bridgeUrl,
		store,
	});
	Bun.serve({
		fetch: app.fetch,
		hostname,
		port,
	});
	console.log(`Harpist Bridge listening on ${bridgeUrl}`);
	console.log(`   data dir: ${dataDir}`);
	console.log(`   docs:     ${bridgeUrl}/openapi`);
};

const command = process.argv[2] ?? "help";
const args = process.argv.slice(3);

if (command === "bridge") {
	serveBridge();
} else if (command === "profiles") {
	const subcommand = args[0] ?? "list";
	if (subcommand === "list") {
		printJson(await store.listProfiles());
	} else if (subcommand === "latest") {
		printJson(await store.latestProfile(args[1]));
	} else if (subcommand === "get") {
		printJson(await profileForHost(hostArg(args[1])));
	} else {
		usage();
		process.exit(1);
	}
} else if (command === "recordings") {
	const subcommand = args[0] ?? "latest";
	const full = args.includes("--full");
	if (subcommand === "latest") {
		const recording = await store.latestRecording(
			args.find((arg) => arg !== "--full" && arg !== "latest"),
		);
		printJson(full ? recording : recordingSummary(recording));
	} else if (subcommand === "get") {
		const host = hostArg(args[1]);
		const id = args[2] ?? fail("Missing recording id.");
		const recording = await store.getRecording(host, id);
		printJson(full ? recording : recordingSummary(recording));
	} else {
		usage();
		process.exit(1);
	}
} else if (command === "refine") {
	const subcommand = args[0] ?? "latest";
	if (subcommand !== "latest") {
		usage();
		process.exit(1);
	}
	printJson(
		refineSummary(
			await refineLatestProfile(store, {
				bridgeUrl: normaliseServerUrl(bridgeUrl),
				host: args[1],
			}),
		),
	);
} else if (command === "auth") {
	const subcommand = args[0] ?? "replay";
	if (subcommand !== "replay") {
		usage();
		process.exit(1);
	}
	const host = hostArg(args[1]);
	const selector = args.find(
		(arg) =>
			arg !== "replay" &&
			arg !== host &&
			!arg.startsWith("--") &&
			args.indexOf(arg) > 1,
	);
	const bundle = buildReplayBundle({
		operationName: selector?.includes(" ") ? undefined : selector,
		profile: await profileForHost(host),
		recordings: await store.listStoredRecordings(host),
		templateKey: selector?.includes(" ") ? selector : undefined,
	});
	for (const warning of bundle.warnings) {
		console.error(`warning: ${warning}`);
	}
	console.log(bundle.curl);
} else if (command === "contract") {
	if (args[0] !== "get") {
		usage();
		process.exit(1);
	}
	const profile = await profileForHost(hostArg(args[1]));
	const contract = await store.readProfileContract(profile.host);
	if (!contract) {
		fail(`No contract artifact for '${profile.host}'.`);
	}
	console.log(contract);
} else if (command === "contract-profile") {
	if (args[0] !== "get") {
		usage();
		process.exit(1);
	}
	const profile = await profileForHost(hostArg(args[1]));
	const contractProfile = await store.readProfileContractProfile(profile.host);
	if (!contractProfile) {
		fail(`No contract profile artifact for '${profile.host}'.`);
	}
	printJson(contractProfile);
} else if (command === "openapi") {
	if (args[0] !== "get") {
		usage();
		process.exit(1);
	}
	const profile = await profileForHost(hostArg(args[1]));
	const openapi = await store.readProfileOpenApi(profile.host);
	if (!openapi) {
		fail(`No OpenAPI artifact for '${profile.host}'.`);
	}
	printJson(openapi);
} else if (command === "docs") {
	const subcommand = args[0];
	if (subcommand === "apply") {
		const host = hostArg(args[1]);
		const raw = await readInputFile(fileArg(args[2]));
		let input: unknown;
		try {
			input = JSON.parse(raw);
		} catch (error) {
			fail(
				`Invalid docs JSON: ${error instanceof Error ? error.message : error}`,
			);
		}
		printJson(
			await applyProfileDocs(store, {
				bridgeUrl: normaliseServerUrl(bridgeUrl),
				host,
				input,
			}),
		);
	} else if (subcommand === "review") {
		printJson(await reviewProfileDocs(store, { host: hostArg(args[1]) }));
	} else {
		const host = hostArg(args[0]);
		console.log(
			`${normaliseServerUrl(bridgeUrl)}/profiles/${encodeURIComponent(host)}/docs`,
		);
	}
} else if (command === "handoff") {
	const profile = await store.latestProfile(args[0]);
	if (!profile) {
		fail("No Harpist profile exists yet. Record a site first.");
	}
	console.log(
		buildAgentHandoffText(profile, {
			...DEFAULT_SETTINGS,
			serverUrl: bridgeUrl,
		}),
	);
} else {
	usage();
	process.exit(command === "help" || command === "--help" ? 0 : 1);
}
