import { describe, expect, test } from "bun:test";
import type { EndpointSummary, SiteProfile } from "../../core/src/profiles";
import {
	operationNameFromSummary,
	replayOperationChoices,
	uniqueOperationName,
} from "../src/replay-display";

const endpoint = (overrides: Partial<EndpointSummary> = {}): EndpointSummary =>
	({
		description: "Get Project",
		exactKey: "GET api.example.test/v1/projects/abc",
		host: "api.example.test",
		included: true,
		lastSeenAt: "2026-07-01T00:00:00.000Z",
		method: "GET",
		path: "/v1/projects/abc",
		samples: 1,
		statuses: [200],
		tags: ["same-site", "api", "Projects"],
		template: "/v1/projects/{id}",
		templateKey: "GET api.example.test/v1/projects/{id}",
		...overrides,
	}) as EndpointSummary;

const profile = (endpoints: EndpointSummary[]): SiteProfile =>
	({
		derivedEndpointCount: endpoints.length,
		displayName: "Example",
		endpointTemplateKeys: endpoints.map((item) => item.templateKey),
		endpoints,
		host: "example.test",
		origin: "https://example.test",
		recordingCount: 1,
		recordings: [],
		scannedEndpointCount: endpoints.length,
		scannedEndpointKeys: [],
		status: "synced",
		updatedAt: "2026-07-01T00:00:00.000Z",
	}) as SiteProfile;

describe("replay display helpers", () => {
	test("builds simple operation names from summaries", () => {
		expect(operationNameFromSummary("Get Project", "GET")).toBe("getProject");
		expect(operationNameFromSummary("Submit Login Request", "POST")).toBe(
			"submitLoginRequest",
		);
	});

	test("uniques repeated operation names", () => {
		const used = new Set<string>();
		expect(uniqueOperationName("getProject", used)).toBe("getProject");
		expect(uniqueOperationName("getProject", used)).toBe("getProject2");
	});

	test("groups replay choices by docs tag and path folder", () => {
		const choices = replayOperationChoices(
			profile([
				endpoint(),
				endpoint({
					description: "Create Task",
					method: "POST",
					path: "/v1/tasks",
					tags: ["same-site", "api", "Tasks"],
					template: "/v1/tasks",
					templateKey: "POST api.example.test/v1/tasks",
				}),
			]),
		);

		expect(
			choices.map(({ folder, group, label }) => ({ folder, group, label })),
		).toEqual([
			{ folder: "Projects", group: "Projects", label: "Get Project" },
			{ folder: "Tasks", group: "Tasks", label: "Create Task" },
		]);
	});
});
