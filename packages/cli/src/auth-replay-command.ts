import { credentialValidationFromResponse } from "../../core/src/credential-validation";
import { shouldColorOutput } from "./auth-commands";
import {
	parseReplayJson,
	replayRequestInputFromJson,
} from "./auth-replay-json";
import {
	confirmReplayExecution,
	isInteractiveTerminal,
	promptReplayOperation,
	promptReplayProfile,
	promptReplayRequestInput,
	resolveCredentialSet,
} from "./interactive-replay-input";
import {
	applyReplayRequestInput,
	buildReplayBundle,
	executeReplayBundle,
	formatExecutedReplayResponse,
	type ReplayRequestInput,
} from "./replay";
import { replayRequiresConfirmation } from "./replay-safety";
import type { BridgeStore } from "./store";

type AuthReplayOutput = "curl" | "redacted-curl" | "response";

const usage =
	"Usage: harpist auth replay [host] [templateKey|operationName] [--auth <credentialId>] [--param k=v] [--query k=v] [--body <json>] [--json <input>] [--interactive|--no-interactive] [--curl|--redacted-curl] [--verbose] [--yes]";

const hasOwn = (value: object, key: string) => Object.hasOwn(value, key);

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
	let credentialId: string | undefined;
	let hasRequestInput = false;
	let interactive: boolean | undefined;
	let interactiveOptionSeen = false;
	let jsonOptionSeen = false;
	let output: AuthReplayOutput = "response";
	let outputOptionSeen = false;
	let requestFlagSeen = false;
	let verbose = false;
	let yes = false;
	let credentialOptionSeen = false;
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
			if (outputOptionSeen) {
				throw new Error("Pass only one of --curl or --redacted-curl.");
			}
			outputOptionSeen = true;
			output = "curl";
		} else if (arg === "--redacted-curl") {
			if (outputOptionSeen) {
				throw new Error("Pass only one of --curl or --redacted-curl.");
			}
			outputOptionSeen = true;
			output = "redacted-curl";
		} else if (arg === "--interactive") {
			if (interactiveOptionSeen) {
				throw new Error("Pass only one of --interactive or --no-interactive.");
			}
			interactiveOptionSeen = true;
			interactive = true;
		} else if (arg === "--no-interactive") {
			if (interactiveOptionSeen) {
				throw new Error("Pass only one of --interactive or --no-interactive.");
			}
			interactiveOptionSeen = true;
			interactive = false;
		} else if (arg === "--verbose") {
			if (verbose) {
				throw new Error("--verbose may only be passed once.");
			}
			verbose = true;
		} else if (arg === "--yes") {
			if (yes) {
				throw new Error("--yes may only be passed once.");
			}
			yes = true;
		} else if (arg === "--auth" || arg.startsWith("--auth=")) {
			if (credentialOptionSeen) {
				throw new Error("--auth may only be passed once.");
			}
			credentialOptionSeen = true;
			credentialId =
				arg === "--auth" ? nextValue(index, "--auth") : arg.slice(7);
			if (!credentialId) {
				throw new Error("Missing value for --auth.");
			}
			index += arg === "--auth" ? 1 : 0;
		} else if (arg === "--json" || arg.startsWith("--json=")) {
			if (jsonOptionSeen) {
				throw new Error("--json may only be passed once.");
			}
			if (requestFlagSeen) {
				throw new Error(
					"--json cannot be combined with --param, --query, or --body.",
				);
			}
			jsonOptionSeen = true;
			const value =
				arg === "--json" ? nextValue(index, "--json") : arg.slice(7);
			requestInputMerge(requestInput, replayRequestInputFromJson(value));
			hasRequestInput = true;
			index += arg === "--json" ? 1 : 0;
		} else if (arg === "--param" || arg.startsWith("--param=")) {
			if (jsonOptionSeen) {
				throw new Error(
					"--json cannot be combined with --param, --query, or --body.",
				);
			}
			requestFlagSeen = true;
			const value =
				arg === "--param" ? nextValue(index, "--param") : arg.slice(8);
			const [name, paramValue] = parseKeyValue(value, "--param");
			if (requestInput.params && hasOwn(requestInput.params, name)) {
				throw new Error(`Duplicate --param '${name}'.`);
			}
			requestInput.params = { ...requestInput.params, [name]: paramValue };
			hasRequestInput = true;
			index += arg === "--param" ? 1 : 0;
		} else if (arg === "--query" || arg.startsWith("--query=")) {
			if (jsonOptionSeen) {
				throw new Error(
					"--json cannot be combined with --param, --query, or --body.",
				);
			}
			requestFlagSeen = true;
			const value =
				arg === "--query" ? nextValue(index, "--query") : arg.slice(8);
			const [name, queryValue] = parseKeyValue(value, "--query");
			if (requestInput.query && hasOwn(requestInput.query, name)) {
				throw new Error(`Duplicate --query '${name}'.`);
			}
			requestInput.query = { ...requestInput.query, [name]: queryValue };
			hasRequestInput = true;
			index += arg === "--query" ? 1 : 0;
		} else if (arg === "--body" || arg.startsWith("--body=")) {
			if (jsonOptionSeen) {
				throw new Error(
					"--json cannot be combined with --param, --query, or --body.",
				);
			}
			if (hasOwn(requestInput, "body")) {
				throw new Error("--body may only be passed once.");
			}
			requestFlagSeen = true;
			const value =
				arg === "--body" ? nextValue(index, "--body") : arg.slice(7);
			requestInput.body = parseReplayJson(value, "--body");
			hasRequestInput = true;
			index += arg === "--body" ? 1 : 0;
		} else if (arg.startsWith("--")) {
			throw new Error(`Unknown auth replay option '${arg}'.`);
		} else {
			positional.push(arg);
		}
	}

	if (positional.length > 2) {
		throw new Error(usage);
	}
	if (yes && output !== "response") {
		throw new Error("--yes is only valid when executing a replay.");
	}
	return {
		credentialId,
		hasRequestInput,
		host: positional[0],
		interactive,
		output,
		requestInput,
		selector: positional[1],
		verbose,
		yes,
	};
};

export const runAuthReplayCommand = async (
	store: BridgeStore,
	args: string[],
) => {
	const parsed = parseAuthReplayArgs(args);
	const host =
		parsed.host ??
		(isInteractiveTerminal() && parsed.interactive !== false
			? await promptReplayProfile(await store.listProfiles())
			: undefined);
	if (!host) {
		throw new Error(
			"Missing host. Run `harpist auth replay` in a TTY to choose a site, or pass <host>.",
		);
	}
	const profile = await store.getProfile(host);
	if (!profile) {
		throw new Error(`Unknown profile '${host}'.`);
	}
	const credentialSet = await resolveCredentialSet(
		await store.getAuthLedger(host),
		parsed,
		parsed.interactive !== false && isInteractiveTerminal(),
	);
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
		credentialSet,
		operationName: selector?.includes(" ") ? undefined : selector,
		profile,
		recordings: await store.listStoredRecordings(host),
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
		if (replayRequiresConfirmation(bundle) && !parsed.yes) {
			if (!(isInteractiveTerminal() && parsed.interactive !== false)) {
				throw new Error(
					`Refusing to send ${bundle.method} ${bundle.url} without confirmation. Review it with --redacted-curl, then pass --yes only after the user approves the live mutation.`,
				);
			}
			if (!(await confirmReplayExecution(bundle))) {
				throw new Error("Replay cancelled.");
			}
		}
		const executed = await executeReplayBundle(bundle);
		if (bundle.credentialSetId) {
			const validation = credentialValidationFromResponse(executed, {
				checkedAt: new Date().toISOString(),
			});
			if (validation) {
				await store.recordCredentialValidation(
					host,
					bundle.credentialSetId,
					validation,
				);
				if (validation.result === "invalid") {
					console.error(
						`warning: ${validation.reason} Run \`harpist auth login ${host}\` to capture fresh credentials, or \`harpist auth list ${host}\` to pick another set.`,
					);
				}
			}
		}
		console.log(
			formatExecutedReplayResponse(executed, {
				color: shouldColorOutput(),
				request: parsed.verbose ? bundle : undefined,
				verbose: parsed.verbose,
			}),
		);
	}
};
