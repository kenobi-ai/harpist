import {
	confirmReplayExecution,
	isInteractiveTerminal,
	promptReplayOperation,
	promptReplayRequestInput,
} from "./interactive-replay-input";
import {
	applyReplayRequestInput,
	buildReplayBundle,
	executeReplayBundle,
	formatExecutedReplayResponse,
	type ReplayQueryValue,
	type ReplayRequestInput,
} from "./replay";
import type { BridgeStore } from "./store";

type AuthReplayOutput = "curl" | "redacted-curl" | "response";

const usage =
	"Usage: harpist auth replay <host> [templateKey|operationName] [--param k=v] [--query k=v] [--body <json>] [--json <input>] [--interactive|--no-interactive] [--curl|--redacted-curl]";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: object, key: string) => Object.hasOwn(value, key);

const parseJson = (value: string, label: string) => {
	try {
		return JSON.parse(value) as unknown;
	} catch (error) {
		throw new Error(
			`${label} must be valid JSON: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
};

const stringRecordFrom = (value: unknown, label: string) => {
	if (!isRecord(value)) {
		throw new Error(`${label} must be a JSON object.`);
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, String(item)]),
	);
};

const queryRecordFrom = (value: unknown, label: string) => {
	if (!isRecord(value)) {
		throw new Error(`${label} must be a JSON object.`);
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => {
			if (
				item === null ||
				typeof item === "string" ||
				typeof item === "number" ||
				typeof item === "boolean"
			) {
				return [key, item];
			}
			if (
				Array.isArray(item) &&
				item.every(
					(value) =>
						typeof value === "string" ||
						typeof value === "number" ||
						typeof value === "boolean",
				)
			) {
				return [key, item];
			}
			throw new Error(
				`${label}.${key} must be a string, number, boolean, null, or an array of scalar values.`,
			);
		}),
	) as Record<string, ReplayQueryValue>;
};

const requestInputFromJson = (value: string): ReplayRequestInput => {
	const parsed = parseJson(value, "--json");
	if (!isRecord(parsed)) {
		throw new Error("--json must be a JSON object.");
	}
	return {
		...(hasOwn(parsed, "body") ? { body: parsed.body } : {}),
		...(parsed.params !== undefined
			? { params: stringRecordFrom(parsed.params, "--json.params") }
			: {}),
		...(parsed.pathParams !== undefined
			? { params: stringRecordFrom(parsed.pathParams, "--json.pathParams") }
			: {}),
		...(parsed.query !== undefined
			? { query: queryRecordFrom(parsed.query, "--json.query") }
			: {}),
	};
};

const requestInputMerge = (
	target: ReplayRequestInput,
	source: ReplayRequestInput,
) => {
	if (source.params) {
		target.params = { ...target.params, ...source.params };
	}
	if (source.query) {
		target.query = { ...target.query, ...source.query };
	}
	if (hasOwn(source, "body")) {
		target.body = source.body;
	}
};

const mergedRequestInput = (
	left: ReplayRequestInput,
	right: ReplayRequestInput,
) => {
	const next: ReplayRequestInput = {};
	requestInputMerge(next, left);
	requestInputMerge(next, right);
	return next;
};

const parseKeyValue = (value: string, label: string) => {
	const index = value.indexOf("=");
	if (index <= 0) {
		throw new Error(`${label} expects key=value.`);
	}
	return [value.slice(0, index), value.slice(index + 1)] as const;
};

const parseAuthReplayArgs = (args: string[]) => {
	const positional: string[] = [];
	const requestInput: ReplayRequestInput = {};
	let hasRequestInput = false;
	let interactive: boolean | undefined;
	let output: AuthReplayOutput = "response";
	const nextValue = (index: number, name: string) => {
		const value = args[index + 1];
		if (value === undefined || value.startsWith("--")) {
			throw new Error(`Missing value for ${name}.`);
		}
		return value;
	};

	for (let index = 1; index < args.length; index += 1) {
		const arg = args[index] ?? "";
		if (arg === "--curl") {
			output = "curl";
		} else if (arg === "--redacted-curl") {
			output = "redacted-curl";
		} else if (arg === "--interactive") {
			interactive = true;
		} else if (arg === "--no-interactive") {
			interactive = false;
		} else if (arg === "--json" || arg.startsWith("--json=")) {
			const value =
				arg === "--json" ? nextValue(index, "--json") : arg.slice(7);
			requestInputMerge(requestInput, requestInputFromJson(value));
			hasRequestInput = true;
			index += arg === "--json" ? 1 : 0;
		} else if (arg === "--param" || arg.startsWith("--param=")) {
			const value =
				arg === "--param" ? nextValue(index, "--param") : arg.slice(8);
			const [name, paramValue] = parseKeyValue(value, "--param");
			requestInput.params = { ...requestInput.params, [name]: paramValue };
			hasRequestInput = true;
			index += arg === "--param" ? 1 : 0;
		} else if (arg === "--query" || arg.startsWith("--query=")) {
			const value =
				arg === "--query" ? nextValue(index, "--query") : arg.slice(8);
			const [name, queryValue] = parseKeyValue(value, "--query");
			requestInput.query = { ...requestInput.query, [name]: queryValue };
			hasRequestInput = true;
			index += arg === "--query" ? 1 : 0;
		} else if (arg === "--body" || arg.startsWith("--body=")) {
			const value =
				arg === "--body" ? nextValue(index, "--body") : arg.slice(7);
			requestInput.body = parseJson(value, "--body");
			hasRequestInput = true;
			index += arg === "--body" ? 1 : 0;
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
		hasRequestInput,
		host: positional[0] ?? "",
		interactive,
		output,
		requestInput,
		selector: positional[1],
	};
};

export const runAuthReplayCommand = async (
	store: BridgeStore,
	args: string[],
) => {
	const parsed = parseAuthReplayArgs(args);
	const profile = await store.getProfile(parsed.host);
	if (!profile) {
		throw new Error(`Unknown profile '${parsed.host}'.`);
	}
	const shouldPromptOperation =
		!parsed.selector &&
		(parsed.interactive === true ||
			(parsed.interactive !== false && isInteractiveTerminal()));
	const shouldPromptInput =
		parsed.interactive === true ||
		(!parsed.hasRequestInput &&
			parsed.output === "response" &&
			parsed.interactive !== false);
	if (
		(shouldPromptOperation || shouldPromptInput) &&
		!isInteractiveTerminal()
	) {
		throw new Error(
			"Interactive replay requires a TTY. Pass --param, --query, --body, or --json, or add --no-interactive to replay the captured request exactly.",
		);
	}

	const selector = shouldPromptOperation
		? await promptReplayOperation(profile)
		: parsed.selector;
	const baseBundle = buildReplayBundle({
		operationName: selector?.includes(" ") ? undefined : selector,
		profile,
		recordings: await store.listStoredRecordings(parsed.host),
		templateKey: selector?.includes(" ") ? selector : undefined,
	});
	const promptBaseBundle = applyReplayRequestInput(
		baseBundle,
		parsed.requestInput,
	);
	const requestInput = shouldPromptInput
		? mergedRequestInput(
				parsed.requestInput,
				await promptReplayRequestInput(promptBaseBundle),
			)
		: parsed.requestInput;
	const bundle = applyReplayRequestInput(baseBundle, requestInput);

	for (const warning of bundle.warnings) {
		console.error(`warning: ${warning}`);
	}
	if (parsed.output === "curl") {
		console.log(bundle.curl);
	} else if (parsed.output === "redacted-curl") {
		console.log(bundle.redactedCurl);
	} else {
		if (
			(shouldPromptOperation || shouldPromptInput) &&
			!(await confirmReplayExecution(bundle))
		) {
			throw new Error("Replay cancelled.");
		}
		console.log(
			formatExecutedReplayResponse(await executeReplayBundle(bundle)),
		);
	}
};
