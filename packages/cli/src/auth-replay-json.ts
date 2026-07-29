import type { ReplayQueryValue, ReplayRequestInput } from "./replay";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const parseReplayJson = (value: string, label: string) => {
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

export const replayRequestInputFromJson = (
	value: string,
): ReplayRequestInput => {
	const parsed = parseReplayJson(value, "--json");
	if (!isRecord(parsed)) {
		throw new Error("--json must be a JSON object.");
	}
	if (parsed.params !== undefined && parsed.pathParams !== undefined) {
		throw new Error("--json cannot contain both params and pathParams.");
	}
	return {
		...(Object.hasOwn(parsed, "body") ? { body: parsed.body } : {}),
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
