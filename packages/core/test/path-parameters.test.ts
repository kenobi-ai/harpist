import { describe, expect, test } from "bun:test";
import type { EndpointSummary, SiteProfile } from "../src/profiles";
import { createRecordedSiteContractProfile } from "../src/site-contract-profile";

const endpoint = (overrides: Partial<EndpointSummary> = {}): EndpointSummary =>
	({
		exactKey: "GET https://api.example.test/v3/workspaces/123",
		host: "api.example.test",
		lastSeenAt: "2026-07-01T00:00:00.000Z",
		method: "GET",
		path: "/v3/workspaces/123",
		samples: 1,
		statuses: [200],
		template: "/v3/workspaces/{id}",
		templateKey: "GET api.example.test /v3/workspaces/{id}",
		...overrides,
	}) as EndpointSummary;

const profile = (endpoints: EndpointSummary[]): SiteProfile =>
	({
		auth: {
			confidence: "high",
			evidence: ["test"],
			label: "Browser session",
			type: "session-cookie",
		},
		displayName: "api.example.test",
		endpoints,
		host: "api.example.test",
		origin: "https://api.example.test",
		recordings: [],
	}) as SiteProfile;

describe("path parameter names", () => {
	test("infers names from parent path segments and cross-route ids", () => {
		const contractProfile = createRecordedSiteContractProfile(
			profile([
				endpoint({
					description: "Get workspace",
					operationName: "getWorkspace",
				}),
				endpoint({
					description: "Get workbook",
					exactKey: "GET https://api.example.test/v3/123/workbooks/wb_456",
					operationName: "getWorkbook",
					path: "/v3/123/workbooks/wb_456",
					template: "/v3/{id}/workbooks/{id}",
					templateKey: "GET api.example.test /v3/{id}/workbooks/{id}",
				}),
				endpoint({
					description: "Get field run status",
					exactKey:
						"GET https://api.example.test/v3/tables/t_123/views/v_456/fields/f_789/runstatus",
					operationName: "getFieldRunStatus",
					path: "/v3/tables/t_123/views/v_456/fields/f_789/runstatus",
					template: "/v3/tables/{id}/views/{id}/fields/{id}/runstatus",
					templateKey:
						"GET api.example.test /v3/tables/{id}/views/{id}/fields/{id}/runstatus",
				}),
				endpoint({
					description: "Get billing plan",
					exactKey: "GET https://api.example.test/v3/billingplans/123",
					operationName: "getBillingPlan",
					path: "/v3/billingplans/123",
					template: "/v3/billingplans/{id}",
					templateKey: "GET api.example.test /v3/billingplans/{id}",
				}),
			]),
		);

		expect(contractProfile.operations[0]?.path).toBe(
			"/v3/workspaces/{workspaceId}",
		);
		expect(contractProfile.operations[1]?.path).toBe(
			"/v3/{workspaceId}/workbooks/{workbookId}",
		);
		expect(contractProfile.operations[2]?.path).toBe(
			"/v3/tables/{tableId}/views/{viewId}/fields/{fieldId}/runstatus",
		);
		expect(contractProfile.operations[2]?.parameters.path).toEqual({
			fieldId: { required: true, schema: { type: "string" } },
			tableId: { required: true, schema: { type: "string" } },
			viewId: { required: true, schema: { type: "string" } },
		});
		expect(contractProfile.operations[3]?.path).toBe(
			"/v3/billingplans/{billingPlanId}",
		);
	});
});
