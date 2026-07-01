import { z } from "zod";
import { createORPCResourceContract, defineResourceOperations } from "./orpc";

const bridgeTags = ["Bridge"] as const;
const profileTags = ["Profiles"] as const;
const recordingTags = ["Recordings"] as const;
const endpointTags = ["Endpoints"] as const;
const authTags = ["Auth"] as const;
const handoffTags = ["Handoff"] as const;
const syncTags = ["Sync"] as const;

const authTypeSchema = z.enum([
	"anonymous-cookie",
	"api-key",
	"basic-auth",
	"bearer-token",
	"cookie-csrf",
	"mixed",
	"none",
	"public-client-key",
	"session-cookie",
	"signed-request",
	"unknown",
]);

const authMechanismSchema = z.object({
	confidence: z.enum(["high", "medium", "low"]),
	credentialed: z.boolean(),
	evidence: z.array(z.string()),
	label: z.string(),
	type: authTypeSchema,
});

const authBundleMethodSchema = z.object({
	count: z.number().int(),
	credentialed: z.boolean(),
	label: z.string(),
	replayable: z.boolean(),
	type: z.enum([
		"api-key",
		"authorization",
		"browser-session",
		"csrf-token",
		"public-client-key",
	]),
});

const authBundleSchema = z.object({
	capturedAt: z.string().optional(),
	label: z.string(),
	methods: z.array(authBundleMethodSchema),
	notes: z.string().optional(),
	recordingId: z.string().optional(),
	replayable: z.boolean(),
	status: z.enum(["needs-recording", "ready"]),
	warnings: z.array(z.string()).optional(),
});

const latestAuthValidationSchema = z.object({
	checkedAt: z.string().optional(),
	reason: z.string().optional(),
	status: z.enum(["not-checked", "valid", "validation-needed"]),
	statusCode: z.number().int().optional(),
});

const latestAuthValueSchema = z.object({
	capturedAt: z.string(),
	credentialed: z.boolean(),
	domain: z.string().optional(),
	expiresAt: z.string().optional(),
	host: z.string().optional(),
	httpOnly: z.boolean().optional(),
	kind: z.enum(["cookie", "header"]),
	name: z.string(),
	recordingId: z.string().optional(),
	replayable: z.boolean(),
	sameSite: z.string().optional(),
	secure: z.boolean().optional(),
	session: z.boolean().optional(),
	source: z.literal("recording"),
	type: z.enum([
		"anonymous-cookie",
		"api-key",
		"authorization",
		"basic-auth",
		"bearer-token",
		"browser-session",
		"cookie-csrf",
		"csrf-token",
		"mixed",
		"none",
		"public-client-key",
		"session-cookie",
		"signed-request",
		"unknown",
	]),
	url: z.string().optional(),
	validation: latestAuthValidationSchema.optional(),
	value: z.string(),
});

const latestAuthSchema = z.object({
	capturedAt: z.string().optional(),
	label: z.string(),
	recordingId: z.string().optional(),
	status: z.enum([
		"expired",
		"needs-recording",
		"ready",
		"validation-needed",
	]),
	validation: latestAuthValidationSchema,
	valueCount: z.number().int(),
	values: z.array(latestAuthValueSchema),
	warnings: z.array(z.string()).optional(),
});

const redactedLatestAuthValueSchema = latestAuthValueSchema
	.omit({
		value: true,
	})
	.extend({
		redacted: z.literal(true),
		valuePreview: z.string().optional(),
	});

const redactedLatestAuthSchema = latestAuthSchema
	.omit({
		values: true,
	})
	.extend({
		values: z.array(redactedLatestAuthValueSchema),
	});

const accessTypeSchema = z.enum([
	"api-key",
	"basic-auth",
	"bearer-token",
	"browser-context",
	"public",
	"public-client-key",
	"session-cookie",
	"signed-request",
	"unknown",
]);

const accessSummarySchema = z.object({
	confidence: z.enum(["high", "medium", "low"]),
	credentialed: z.boolean(),
	evidence: z.array(z.string()),
	label: z.string(),
	notes: z.string().optional(),
	type: accessTypeSchema,
});

const authSummarySchema = z.object({
	confidence: z.enum(["high", "medium", "low"]),
	credentialed: z.boolean().optional(),
	evidence: z.array(z.string()),
	expiresAt: z.string().optional(),
	label: z.string(),
	mechanisms: z.array(authMechanismSchema).optional(),
	notes: z.string().optional(),
	type: authTypeSchema.optional(),
});

const endpointSummarySchema = z.object({
	access: accessSummarySchema.optional(),
	description: z.string().optional(),
	exactKey: z.string(),
	host: z.string(),
	included: z.boolean().optional(),
	lastSeenAt: z.string(),
	method: z.string(),
	notes: z.string().optional(),
	operationName: z.string().optional(),
	path: z.string(),
	samples: z.number().int(),
	statuses: z.array(z.number().int()),
	tags: z.array(z.string()).optional(),
	template: z.string(),
	templateKey: z.string(),
});

const recordingSummarySchema = z.object({
	auth: authSummarySchema,
	authBundle: authBundleSchema.optional(),
	createdAt: z.string(),
	derivedEndpointCount: z.number().int(),
	durationMs: z.number().int(),
	entryCount: z.number().int(),
	id: z.string(),
	methodBreakdown: z.record(z.string(), z.number().int()),
	processedAt: z.string().optional(),
	processingStatus: z.enum(["new", "processing", "complete"]).optional(),
	sourceUrl: z.string(),
	scannedEndpointCount: z.number().int(),
	latestAuth: latestAuthSchema.optional(),
});

const profileArtifactSchema = z.object({
	auth: z.string().optional(),
	cli: z.string().optional(),
	contractExport: z.string().optional(),
	contractFormat: z.literal("orpc-typescript-source").optional(),
	contractPath: z.string().optional(),
	contractSha256: z.string().optional(),
	generatedFrom: z.literal("profile").optional(),
	metadataPath: z.string().optional(),
	metadataSha256: z.string().optional(),
	openapiPath: z.string().optional(),
	openapiSha256: z.string().optional(),
	openapiSource: z.literal("contract-file").optional(),
	sdk: z.string().optional(),
	status: z.enum(["missing", "draft", "ready"]),
	updatedAt: z.string(),
});

const siteProfileSchema = z.object({
	agentNotes: z.string().optional(),
	artifacts: profileArtifactSchema.optional(),
	auth: authSummarySchema,
	authBundle: authBundleSchema.optional(),
	createdAt: z.string(),
	derivedEndpointCount: z.number().int(),
	displayName: z.string(),
	endpointTemplateKeys: z.array(z.string()),
	endpoints: z.array(endpointSummarySchema),
	host: z.string(),
	lastBridgeMessage: z.string().optional(),
	latestAuth: latestAuthSchema.optional(),
	lastRecordingId: z.string().optional(),
	origin: z.string(),
	recordingCount: z.number().int(),
	recordings: z.array(recordingSummarySchema),
	remoteDocsUrl: z.string().optional(),
	remoteProjectId: z.string().optional(),
	scannedEndpointCount: z.number().int(),
	scannedEndpointKeys: z.array(z.string()),
	status: z.enum(["idle", "offline", "synced"]),
	updatedAt: z.string(),
});

const activePageSchema = z.object({
	host: z.string(),
	origin: z.string(),
	title: z.string(),
	url: z.string(),
});

const activeRecordingSchema = activePageSchema.extend({
	startedAt: z.string(),
	tabId: z.number().int(),
});

const harArchiveSchema = z
	.object({
		log: z
			.object({
				creator: z.object({
					name: z.string(),
					version: z.string(),
				}),
				entries: z.array(z.unknown()),
				version: z.string(),
			})
			.passthrough(),
	})
	.passthrough();

const recordingDetailSchema = recordingSummarySchema.extend({
	har: harArchiveSchema,
	host: z.string(),
});

const replayHeaderSchema = z.object({
	name: z.string(),
	redacted: z.boolean(),
	secret: z.boolean(),
	value: z.string(),
});

const replayCookieSchema = z.object({
	domain: z.string().optional(),
	expiresAt: z.string().optional(),
	httpOnly: z.boolean().optional(),
	name: z.string(),
	redacted: z.boolean(),
	sameSite: z.string().optional(),
	secure: z.boolean().optional(),
	session: z.boolean().optional(),
	value: z.string().optional(),
});

const replayBundleSchema = z.object({
	authBundle: authBundleSchema,
	authValueSource: z.enum(["latest-auth", "recording"]),
	body: z.string().optional(),
	contentType: z.string().optional(),
	cookies: z.array(replayCookieSchema),
	credentialSource: z.literal("recording"),
	curl: z.string(),
	endpoint: endpointSummarySchema,
	headers: z.array(replayHeaderSchema),
	latestAuth: redactedLatestAuthSchema.optional(),
	method: z.string(),
	recordingId: z.string(),
	redactedCurl: z.string(),
	url: z.string(),
	warnings: z.array(z.string()),
});

const extensionSnapshotSchema = z.object({
	activeHost: z.string().optional(),
	extensionId: z.string().optional(),
	profiles: z.array(siteProfileSchema),
	recordings: z.array(recordingDetailSchema),
});

export const bridgeOperations = defineResourceOperations({
	health: {
		input: z.object({}),
		output: z.object({
			name: z.literal("harpist-bridge"),
			ok: z.literal(true),
			time: z.string(),
			version: z.string(),
		}),
		route: {
			method: "GET",
			operationId: "bridge.health",
			path: "/bridge/health",
			summary: "Check bridge health",
			tags: bridgeTags,
		},
	},
});

export const profileOperations = defineResourceOperations({
	get: {
		input: z.object({ host: z.string() }),
		output: siteProfileSchema,
		route: {
			method: "GET",
			operationId: "profiles.get",
			path: "/profiles/{host}",
			summary: "Get a profile",
			tags: profileTags,
		},
	},
	latest: {
		input: z.object({ host: z.string().optional() }),
		output: siteProfileSchema.nullable(),
		route: {
			method: "GET",
			operationId: "profiles.latest",
			path: "/profiles/latest",
			summary: "Get the latest profile",
			tags: profileTags,
		},
	},
	list: {
		input: z.object({}),
		output: z.array(siteProfileSchema),
		route: {
			method: "GET",
			operationId: "profiles.list",
			path: "/profiles",
			summary: "List profiles",
			tags: profileTags,
		},
	},
	setArtifacts: {
		input: z.object({
			artifacts: profileArtifactSchema,
			host: z.string(),
		}),
		output: siteProfileSchema,
		route: {
			method: "POST",
			operationId: "profiles.setArtifacts",
			path: "/profiles/{host}/artifacts",
			summary: "Write generated artifacts to a profile",
			tags: profileTags,
		},
	},
	setAuth: {
		input: z.object({
			auth: authSummarySchema,
			host: z.string(),
		}),
		output: siteProfileSchema,
		route: {
			method: "POST",
			operationId: "profiles.setAuth",
			path: "/profiles/{host}/auth",
			summary: "Write authentication analysis to a profile",
			tags: profileTags,
		},
	},
	update: {
		input: z.object({
			agentNotes: z.string().optional(),
			displayName: z.string().optional(),
			host: z.string(),
			lastBridgeMessage: z.string().optional(),
			remoteDocsUrl: z.string().optional(),
			remoteProjectId: z.string().optional(),
		}),
		output: siteProfileSchema,
		route: {
			method: "PATCH",
			operationId: "profiles.update",
			path: "/profiles/{host}",
			summary: "Update profile metadata",
			tags: profileTags,
		},
	},
});

export const recordingOperations = defineResourceOperations({
	get: {
		input: z.object({ host: z.string(), id: z.string() }),
		output: recordingDetailSchema,
		route: {
			method: "GET",
			operationId: "recordings.get",
			path: "/profiles/{host}/recordings/{id}",
			summary: "Get a recording with HAR",
			tags: recordingTags,
		},
	},
	ingest: {
		input: z.object({
			bridgeUrl: z.string(),
			har: harArchiveSchema,
			meta: activeRecordingSchema,
		}),
		output: z.object({
			profile: siteProfileSchema,
			recording: recordingSummarySchema,
		}),
		route: {
			description:
				"Ingest a finished HAR recording, update the host profile, and store the raw HAR for agents.",
			method: "POST",
			operationId: "recordings.ingest",
			path: "/recordings",
			summary: "Ingest a recording",
			tags: recordingTags,
		},
	},
	latest: {
		input: z.object({ host: z.string().optional() }),
		output: recordingDetailSchema.nullable(),
		route: {
			method: "GET",
			operationId: "recordings.latest",
			path: "/recordings/latest",
			summary: "Get the latest recording",
			tags: recordingTags,
		},
	},
	list: {
		input: z.object({ host: z.string() }),
		output: z.array(recordingSummarySchema),
		route: {
			method: "GET",
			operationId: "recordings.list",
			path: "/profiles/{host}/recordings",
			summary: "List profile recordings",
			tags: recordingTags,
		},
	},
	markProcessed: {
		input: z.object({
			host: z.string(),
			id: z.string(),
			status: z.enum(["processing", "complete"]),
		}),
		output: recordingSummarySchema,
		route: {
			method: "POST",
			operationId: "recordings.markProcessed",
			path: "/profiles/{host}/recordings/{id}/processed",
			summary: "Mark a recording processing state",
			tags: recordingTags,
		},
	},
});

export const endpointOperations = defineResourceOperations({
	annotate: {
		input: z.object({
			description: z.string().optional(),
			host: z.string(),
			included: z.boolean().optional(),
			notes: z.string().optional(),
			operationName: z.string().optional(),
			tags: z.array(z.string()).optional(),
			templateKey: z.string(),
		}),
		output: siteProfileSchema,
		route: {
			method: "PATCH",
			operationId: "endpoints.annotate",
			path: "/profiles/{host}/endpoints/{templateKey}",
			summary: "Annotate a derived endpoint",
			tags: endpointTags,
		},
	},
	remove: {
		input: z.object({
			host: z.string(),
			templateKey: z.string(),
		}),
		output: siteProfileSchema,
		route: {
			method: "DELETE",
			operationId: "endpoints.remove",
			path: "/profiles/{host}/endpoints/{templateKey}",
			summary: "Remove a derived endpoint from a profile",
			tags: endpointTags,
		},
	},
	upsert: {
		input: z.object({
			endpoint: endpointSummarySchema,
			host: z.string(),
		}),
		output: siteProfileSchema,
		route: {
			method: "POST",
			operationId: "endpoints.upsert",
			path: "/profiles/{host}/endpoints",
			summary: "Create or replace a derived endpoint",
			tags: endpointTags,
		},
	},
});

export const authOperations = defineResourceOperations({
	replay: {
		input: z.object({
			host: z.string(),
			method: z.string().optional(),
			operationName: z.string().optional(),
			path: z.string().optional(),
			templateKey: z.string().optional(),
		}),
		output: replayBundleSchema,
		route: {
			description:
				"Build a curl/replay bundle from the latest sampled browser request and auth bundle for an endpoint.",
			method: "POST",
			operationId: "auth.replay",
			path: "/profiles/{host}/auth/replay",
			summary: "Build endpoint auth replay material",
			tags: authTags,
		},
	},
});

export const handoffOperations = defineResourceOperations({
	get: {
		input: z.object({ host: z.string().optional() }),
		output: z.object({
			bridge: z.string(),
			instructions: z.string(),
			latestRecording: recordingDetailSchema.nullable(),
			profile: siteProfileSchema.nullable(),
			tools: z.array(
				z.object({
					description: z.string(),
					name: z.string(),
				}),
			),
		}),
		route: {
			method: "GET",
			operationId: "handoff.get",
			path: "/handoff",
			summary: "Get an agent handoff packet",
			tags: handoffTags,
		},
	},
});

export const syncOperations = defineResourceOperations({
	pullExtensionState: {
		input: z.object({}),
		output: z.object({
			profiles: z.array(siteProfileSchema),
			pulledAt: z.string(),
		}),
		route: {
			method: "GET",
			operationId: "sync.pullExtensionState",
			path: "/sync/extension-state",
			summary: "Pull canonical profile state for the extension mirror",
			tags: syncTags,
		},
	},
	pushExtensionSnapshot: {
		input: extensionSnapshotSchema,
		output: z.object({
			appliedRecordingIds: z.array(z.string()),
			profiles: z.array(siteProfileSchema),
			syncedAt: z.string(),
		}),
		route: {
			description:
				"Accept the extension's local recording outbox and return canonical bridge profiles.",
			method: "POST",
			operationId: "sync.pushExtensionSnapshot",
			path: "/sync/extension-snapshot",
			summary: "Sync recordings from the extension",
			tags: syncTags,
		},
	},
});

export const harpistContract = {
	auth: createORPCResourceContract(authOperations),
	bridge: createORPCResourceContract(bridgeOperations),
	endpoints: createORPCResourceContract(endpointOperations),
	handoff: createORPCResourceContract(handoffOperations),
	profiles: createORPCResourceContract(profileOperations),
	recordings: createORPCResourceContract(recordingOperations),
	sync: createORPCResourceContract(syncOperations),
};

export type HarpistContract = typeof harpistContract;
export type HarpistProfile = z.infer<typeof siteProfileSchema>;
export type HarpistRecordingDetail = z.infer<typeof recordingDetailSchema>;
