import type { EndpointSummary, SiteProfile } from "../../core/src/profiles";
import { visibleTagsForEndpoint } from "../../core/src/site-contract-profile";

export type ReplayOperationChoice = {
	endpoint: EndpointSummary;
	folder: string;
	group: string;
	label: string;
	selector: string;
};

const pathStopSegments = new Set(["api", "app", "service", "services", "web"]);

const splitWords = (value: string) =>
	value
		.replace(/\{[^}]+\}/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.split(/[^a-zA-Z0-9]+/)
		.map((word) => word.trim())
		.filter(Boolean);

const camelCase = (words: string[]) => {
	const [first = "endpoint", ...rest] = words;
	const normalised = [
		first.toLowerCase(),
		...rest.map(
			(word) =>
				`${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`,
		),
	].join("");
	const safe = normalised.replace(/[^a-zA-Z0-9_$]/g, "");
	return /^[a-zA-Z_$]/.test(safe) ? safe : `endpoint${safe}`;
};

export const operationNameFromSummary = (
	summary: string | undefined,
	method: string,
) => {
	const words = splitWords(summary ?? "");
	return camelCase(
		words.length > 0 ? words : [method.toLowerCase(), "endpoint"],
	);
};

export const uniqueOperationName = (name: string, used: Set<string>) => {
	if (!used.has(name)) {
		used.add(name);
		return name;
	}
	let index = 2;
	let next = `${name}${index}`;
	while (used.has(next)) {
		index += 1;
		next = `${name}${index}`;
	}
	used.add(next);
	return next;
};

const titleCase = (value: string) =>
	value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

const cleanPathSegment = (segment: string) =>
	segment.replace(/[{}]/g, "").replace(/[-_]+/g, " ").trim();

const pathFolderForEndpoint = (endpoint: EndpointSummary) => {
	const segments = endpoint.template
		.split("/")
		.filter((segment) => !/^\{[^}]+\}$/.test(segment))
		.map(cleanPathSegment)
		.filter(
			(segment) =>
				segment &&
				!pathStopSegments.has(segment.toLowerCase()) &&
				!/^v\d+$/i.test(segment),
		);
	const folder = segments.slice(0, 2).map(titleCase).join(" / ");
	return folder || "/";
};

const replayOperationSelector = (endpoint: EndpointSummary) =>
	endpoint.templateKey;

const replayOperationLabel = (endpoint: EndpointSummary) =>
	endpoint.description?.trim() ||
	endpoint.operationName?.trim() ||
	`${endpoint.method.toUpperCase()} ${endpoint.template}`;

export const replayOperationChoices = (
	profile: SiteProfile,
): ReplayOperationChoice[] =>
	profile.endpoints
		.filter((endpoint) => endpoint.included !== false)
		.map((endpoint) => ({
			endpoint,
			folder: pathFolderForEndpoint(endpoint),
			group: visibleTagsForEndpoint(profile, endpoint)[0] ?? "API",
			label: replayOperationLabel(endpoint),
			selector: replayOperationSelector(endpoint),
		}))
		.sort(
			(left, right) =>
				left.group.localeCompare(right.group) ||
				left.folder.localeCompare(right.folder) ||
				left.label.localeCompare(right.label) ||
				left.endpoint.method.localeCompare(right.endpoint.method) ||
				left.endpoint.template.localeCompare(right.endpoint.template),
		);
