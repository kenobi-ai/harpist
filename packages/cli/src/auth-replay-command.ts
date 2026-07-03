import {
	buildReplayBundle,
	executeReplayBundle,
	formatExecutedReplayResponse,
} from "./replay";
import type { BridgeStore } from "./store";

type AuthReplayOutput = "curl" | "redacted-curl" | "response";

const usage =
	"Usage: harpist auth replay <host> [templateKey|operationName] [--curl|--redacted-curl]";

const parseAuthReplayArgs = (args: string[]) => {
	const positional: string[] = [];
	let output: AuthReplayOutput = "response";
	for (const arg of args.slice(1)) {
		if (arg === "--curl") {
			output = "curl";
		} else if (arg === "--redacted-curl") {
			output = "redacted-curl";
		} else if (arg.startsWith("--")) {
			throw new Error(`Unknown auth replay option '${arg}'.`);
		} else {
			positional.push(arg);
		}
	}
	if (positional.length === 0 || positional.length > 2) {
		throw new Error(usage);
	}
	return {
		host: positional[0] ?? "",
		output,
		selector: positional[1],
	};
};

export const runAuthReplayCommand = async (
	store: BridgeStore,
	args: string[],
) => {
	const { host, output, selector } = parseAuthReplayArgs(args);
	const profile = await store.getProfile(host);
	if (!profile) {
		throw new Error(`Unknown profile '${host}'.`);
	}
	const bundle = buildReplayBundle({
		operationName: selector?.includes(" ") ? undefined : selector,
		profile,
		recordings: await store.listStoredRecordings(host),
		templateKey: selector?.includes(" ") ? selector : undefined,
	});
	for (const warning of bundle.warnings) {
		console.error(`warning: ${warning}`);
	}
	if (output === "curl") {
		console.log(bundle.curl);
	} else if (output === "redacted-curl") {
		console.log(bundle.redactedCurl);
	} else {
		console.log(
			formatExecutedReplayResponse(await executeReplayBundle(bundle)),
		);
	}
};
