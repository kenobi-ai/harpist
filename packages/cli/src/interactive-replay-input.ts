import { confirm, editor, input, Separator, select } from "@inquirer/prompts";
import type { SiteProfile } from "../../core/src/profiles";
import type {
	ReplayBundle,
	ReplayQueryValue,
	ReplayRequestInput,
} from "./replay";
import { replayOperationChoices } from "./replay-display";

const mutatingMethods = new Set(["DELETE", "PATCH", "POST", "PUT"]);

export const isInteractiveTerminal = () =>
	Boolean(process.stdin.isTTY && process.stdout.isTTY);

const profileLabel = (profile: SiteProfile) =>
	profile.displayName === profile.host
		? profile.host
		: `${profile.displayName}  ${profile.host}`;

export const promptReplayProfile = async (profiles: SiteProfile[]) => {
	if (profiles.length === 0) {
		throw new Error("No Harpist profile exists yet. Record a site first.");
	}
	return select({
		choices: profiles.map((profile) => ({
			description: `${profile.derivedEndpointCount} endpoint(s), updated ${profile.updatedAt}`,
			name: profileLabel(profile),
			value: profile.host,
		})),
		message: "Site",
		pageSize: 20,
	});
};

export const promptReplayOperation = async (profile: SiteProfile) => {
	const choices = replayOperationChoices(profile);
	if (choices.length === 0) {
		throw new Error(`Profile '${profile.host}' has no replayable endpoints.`);
	}
	const selectChoices: Array<
		| Separator
		| {
				description: string;
				name: string;
				value: string;
		  }
	> = [];
	let group: string | undefined;
	let folder: string | undefined;
	for (const choice of choices) {
		if (choice.group !== group) {
			group = choice.group;
			folder = undefined;
			selectChoices.push(new Separator(group));
		}
		if (choice.folder !== folder) {
			folder = choice.folder;
			selectChoices.push(new Separator(`  ${folder}`));
		}
		selectChoices.push({
			description: `${choice.endpoint.method.toUpperCase()} ${choice.endpoint.template}`,
			name: `    ${choice.label}`,
			value: choice.selector,
		});
	}
	return select({
		choices: selectChoices,
		message: "Operation",
		pageSize: 20,
	});
};

const pathParamNames = (template: string) =>
	[...template.matchAll(/\{([^}]+)\}/g)].map((match) => match[1] ?? "");

const pathParamDefaults = (bundle: ReplayBundle) => {
	const values: Record<string, string> = {};
	const templateParts = bundle.endpoint.template.split("/").filter(Boolean);
	const pathParts = new URL(bundle.url).pathname.split("/").filter(Boolean);
	for (const [index, part] of templateParts.entries()) {
		const match = /^\{([^}]+)\}$/.exec(part);
		if (match?.[1]) {
			values[match[1]] = decodeURIComponent(pathParts[index] ?? "");
		}
	}
	return values;
};

const queryObjectFrom = (url: string) => {
	const query: Record<string, string | string[]> = {};
	const searchParams = new URL(url).searchParams;
	for (const key of new Set(searchParams.keys())) {
		const values = searchParams.getAll(key);
		query[key] = values.length > 1 ? values : (values[0] ?? "");
	}
	return query;
};

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

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

const parseJsonObject = (value: string, label: string) => {
	const parsed = parseJson(value, label);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${label} must be a JSON object.`);
	}
	return parsed as Record<string, ReplayQueryValue>;
};

const queryDefaults = (url: string) => {
	const defaults = new Map<string, string[]>();
	const searchParams = new URL(url).searchParams;
	for (const key of new Set(searchParams.keys())) {
		defaults.set(key, searchParams.getAll(key));
	}
	return defaults;
};

const parseRepeatedQueryValue = (value: string, name: string) => {
	const parsed = parseJson(value, `Query ${name}`);
	if (
		Array.isArray(parsed) &&
		parsed.every(
			(item) =>
				typeof item === "string" ||
				typeof item === "number" ||
				typeof item === "boolean",
		)
	) {
		return parsed;
	}
	throw new Error(`Query ${name} must be a JSON array of scalar values.`);
};

const promptQueryInput = async (bundle: ReplayBundle) => {
	const queryParams = bundle.endpoint.queryParams ?? [];
	if (queryParams.length === 0) {
		if (new URL(bundle.url).search === "") {
			return {};
		}
		const queryText = await input({
			default: prettyJson(queryObjectFrom(bundle.url)),
			message: "Query JSON",
			validate: (value) => {
				try {
					parseJsonObject(value, "Query JSON");
					return true;
				} catch (error) {
					return error instanceof Error ? error.message : String(error);
				}
			},
		});
		return parseJsonObject(queryText, "Query JSON");
	}
	const defaults = queryDefaults(bundle.url);
	const query: Record<string, ReplayQueryValue> = {};
	for (const param of queryParams) {
		const values = defaults.get(param.name) ?? param.values;
		if (param.repeated) {
			const value = await input({
				default: prettyJson(values),
				message: `Query ${param.name}`,
				validate: (raw) => {
					try {
						parseRepeatedQueryValue(raw, param.name);
						return true;
					} catch (error) {
						return error instanceof Error ? error.message : String(error);
					}
				},
			});
			query[param.name] = parseRepeatedQueryValue(value, param.name);
		} else {
			query[param.name] = await input({
				default: values[0] ?? "",
				message: `Query ${param.name}`,
			});
		}
	}
	return query;
};

const bodyDefault = (bundle: ReplayBundle) => {
	if (!bundle.body) {
		return "{}";
	}
	try {
		return prettyJson(JSON.parse(bundle.body));
	} catch {
		return bundle.body;
	}
};

const methodCanHaveBody = (method: string) =>
	mutatingMethods.has(method.toUpperCase());

export const promptReplayRequestInput = async (
	bundle: ReplayBundle,
): Promise<ReplayRequestInput> => {
	const params: Record<string, string> = {};
	const defaults = pathParamDefaults(bundle);
	for (const name of pathParamNames(bundle.endpoint.template)) {
		params[name] = await input({
			default: defaults[name],
			message: `Path ${name}`,
			required: true,
		});
	}

	const query = await promptQueryInput(bundle);

	if (!(methodCanHaveBody(bundle.method) || bundle.body !== undefined)) {
		return { params, query };
	}

	const bodyText = await editor({
		default: bodyDefault(bundle),
		message: "Body JSON",
		postfix: ".json",
		validate: (value) => {
			if (value.trim() === "") {
				return true;
			}
			try {
				parseJson(value, "Body JSON");
				return true;
			} catch (error) {
				return error instanceof Error ? error.message : String(error);
			}
		},
	});
	return {
		body: bodyText.trim() === "" ? undefined : parseJson(bodyText, "Body JSON"),
		params,
		query,
	};
};

export const confirmReplayExecution = (bundle: ReplayBundle) => {
	if (!mutatingMethods.has(bundle.method.toUpperCase())) {
		return Promise.resolve(true);
	}
	return confirm({
		default: false,
		message: `Send ${bundle.method} ${bundle.url}?`,
	});
};
