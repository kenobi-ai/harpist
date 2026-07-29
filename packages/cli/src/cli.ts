#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import {
	buildAgentHandoffText,
	DEFAULT_SETTINGS,
	normaliseServerUrl,
} from "../../core/src/profiles";
import { runAuthCommand } from "./auth-command";
import {
	createBridgeRuntime,
	formatDurationMs,
	isMaintenanceRequestPath,
	parseBridgeServeOptions,
} from "./bridge-runtime";
import { bunRuntime as Bun } from "./bun-runtime";
import { recordingSummary, refineSummary } from "./cli-format";
import { purgeDataDir, readCliVersion } from "./cli-maintenance";
import { applyProfileDocs, reviewProfileDocs } from "./docs";
import { runEndpointCommand } from "./endpoint-command";
import { parseOutputOptions, writeCliOutput, writeJsonOutput } from "./output";
import { refineLatestProfile } from "./refine";
import { createHarpistBridgeServer } from "./server";
import { createBridgeStore } from "./store";
import { renderHarpistCliUsage } from "./surface";

const port = Number(process.env.HARPIST_PORT ?? 4277);
const hostname = process.env.HARPIST_HOST ?? "127.0.0.1";
const dataDir = resolve(
	process.env.HARPIST_DATA_DIR ?? join(homedir(), ".harpist-data"),
);
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

const rejectUnknownOptions = (values: string[]) => {
	const option = values.find((value) => value.startsWith("--"));
	if (option) {
		fail(`Unknown option '${option}'.`);
	}
};

const requireArgumentCount = (
	values: string[],
	minimum: number,
	maximum = minimum,
) => {
	if (values.length < minimum || values.length > maximum) {
		usage();
		process.exit(1);
	}
};

const profileForHost = async (host: string) => {
	const profile = await store.getProfile(host);
	if (!profile) {
		fail(`Unknown profile '${host}'.`);
	}
	return profile;
};

const readInputFile = async (path: string) =>
	path === "-" ? Bun.stdin.text() : readFile(path, "utf8");

const usage = () => {
	console.log(renderHarpistCliUsage());
};

const serveBridge = (bridgeArgs: string[]) => {
	const bridgeOptions = (() => {
		try {
			return parseBridgeServeOptions(bridgeArgs);
		} catch (error) {
			return fail(error instanceof Error ? error.message : String(error));
		}
	})();
	let server: ReturnType<typeof Bun.serve> | undefined;
	let runtime: ReturnType<typeof createBridgeRuntime> | undefined;
	runtime = createBridgeRuntime({
		bridgeUrl,
		dataDir,
		idleTimeoutMs: bridgeOptions.idleTimeoutMs,
		onIdle: () => {
			console.log(
				`Harpist Bridge idle for ${formatDurationMs(
					bridgeOptions.idleTimeoutMs ?? 0,
				)}; stopping.`,
			);
			server?.stop(true);
			runtime?.dispose();
			process.exit(0);
		},
		startedBy: bridgeOptions.startedBy,
	});
	const app = createHarpistBridgeServer({
		bridgeUrl,
		health: runtime.health,
		store,
	});
	server = Bun.serve({
		fetch: (request) => {
			if (!isMaintenanceRequestPath(new URL(request.url).pathname)) {
				runtime?.touch();
			}
			return app.fetch(request);
		},
		hostname,
		port,
	});
	console.log(`Harpist Bridge listening on ${bridgeUrl}`);
	console.log(`   data dir: ${dataDir}`);
	console.log(`   docs:     ${bridgeUrl}/openapi`);
	if (bridgeOptions.startedBy === "agent") {
		console.log("   mode:     agent");
	}
	if (bridgeOptions.idleTimeoutMs) {
		console.log(
			`   idle:     exits after ${formatDurationMs(
				bridgeOptions.idleTimeoutMs,
			)} without bridge traffic`,
		);
	}
};

const command = process.argv[2] ?? "help";
const args = process.argv.slice(3);

if (command === "bridge") {
	serveBridge(args);
} else if (
	command === "version" ||
	command === "--version" ||
	command === "-v"
) {
	requireArgumentCount(args, 0);
	console.log(await readCliVersion(fail));
} else if (command === "purge") {
	requireArgumentCount(args, 0);
	await purgeDataDir(dataDir, fail);
} else if (command === "profiles") {
	const parsed = parseOutputOptions(args, fail);
	rejectUnknownOptions(parsed.args);
	const subcommand = parsed.args[0] ?? "list";
	if (subcommand === "list") {
		requireArgumentCount(parsed.args, 0, 1);
		await writeJsonOutput(await store.listProfiles(), parsed.output, fail);
	} else if (subcommand === "latest") {
		requireArgumentCount(parsed.args, 1, 2);
		await writeJsonOutput(
			await store.latestProfile(parsed.args[1]),
			parsed.output,
			fail,
		);
	} else if (subcommand === "get") {
		requireArgumentCount(parsed.args, 2);
		await writeJsonOutput(
			await profileForHost(hostArg(parsed.args[1])),
			parsed.output,
			fail,
		);
	} else {
		usage();
		process.exit(1);
	}
} else if (command === "recordings") {
	const parsed = parseOutputOptions(args, fail);
	const fullCount = parsed.args.filter((arg) => arg === "--full").length;
	if (fullCount > 1) {
		fail("--full may only be passed once.");
	}
	const positional = parsed.args.filter((arg) => arg !== "--full");
	rejectUnknownOptions(positional);
	const subcommand = positional[0] ?? "latest";
	const full = fullCount === 1;
	if (subcommand === "latest") {
		requireArgumentCount(positional, 0, 2);
		const recording = await store.latestRecording(positional[1]);
		await writeJsonOutput(
			full ? recording : recordingSummary(recording),
			parsed.output,
			fail,
		);
	} else if (subcommand === "get") {
		requireArgumentCount(positional, 3);
		const host = hostArg(positional[1]);
		const id = positional[2] ?? fail("Missing recording id.");
		const recording = await store.getRecording(host, id);
		await writeJsonOutput(
			full ? recording : recordingSummary(recording),
			parsed.output,
			fail,
		);
	} else {
		usage();
		process.exit(1);
	}
} else if (command === "refine") {
	rejectUnknownOptions(args);
	requireArgumentCount(args, 0, 2);
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
	try {
		if (!(await runAuthCommand(store, args, { bridgeUrl }))) {
			usage();
			process.exit(1);
		}
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}
} else if (command === "endpoints") {
	try {
		const result = await runEndpointCommand(store, args);
		if (!result) {
			usage();
			process.exit(1);
		}
		printJson(result);
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}
} else if (command === "contract") {
	const parsed = parseOutputOptions(args, fail);
	rejectUnknownOptions(parsed.args);
	if (parsed.args[0] !== "get") {
		usage();
		process.exit(1);
	}
	requireArgumentCount(parsed.args, 2);
	const profile = await profileForHost(hostArg(parsed.args[1]));
	const contract = await store.readProfileContract(profile.host);
	if (!contract) {
		fail(`No contract artifact for '${profile.host}'.`);
	}
	await writeCliOutput(
		contract ?? fail(`No contract artifact for '${profile.host}'.`),
		parsed.output,
		"text",
		fail,
	);
} else if (command === "contract-profile") {
	const parsed = parseOutputOptions(args, fail);
	rejectUnknownOptions(parsed.args);
	if (parsed.args[0] !== "get") {
		usage();
		process.exit(1);
	}
	requireArgumentCount(parsed.args, 2);
	const profile = await profileForHost(hostArg(parsed.args[1]));
	const contractProfile = await store.readProfileContractProfile(profile.host);
	if (!contractProfile) {
		fail(`No contract profile artifact for '${profile.host}'.`);
	}
	await writeJsonOutput(contractProfile, parsed.output, fail);
} else if (command === "openapi") {
	const parsed = parseOutputOptions(args, fail);
	rejectUnknownOptions(parsed.args);
	if (parsed.args[0] !== "get") {
		usage();
		process.exit(1);
	}
	requireArgumentCount(parsed.args, 2);
	const profile = await profileForHost(hostArg(parsed.args[1]));
	const openapi = await store.readProfileOpenApi(profile.host);
	if (!openapi) {
		fail(`No OpenAPI artifact for '${profile.host}'.`);
	}
	await writeJsonOutput(openapi, parsed.output, fail);
} else if (command === "docs") {
	rejectUnknownOptions(args);
	const subcommand = args[0];
	if (subcommand === "apply") {
		requireArgumentCount(args, 3);
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
		requireArgumentCount(args, 2);
		printJson(await reviewProfileDocs(store, { host: hostArg(args[1]) }));
	} else {
		requireArgumentCount(args, 1);
		const host = hostArg(args[0]);
		console.log(
			`${normaliseServerUrl(bridgeUrl)}/profiles/${encodeURIComponent(host)}/docs`,
		);
	}
} else if (command === "handoff") {
	rejectUnknownOptions(args);
	requireArgumentCount(args, 0, 1);
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
} else if (command === "help" || command === "--help") {
	requireArgumentCount(args, 0);
	usage();
} else {
	usage();
	process.exit(1);
}
