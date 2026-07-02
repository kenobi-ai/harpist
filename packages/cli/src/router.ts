import { implement, ORPCError } from "@orpc/server";
import { harpistContract } from "../../core/src/bridge-contract";
import { buildAgentHandoffText, DEFAULT_SETTINGS } from "../../core/src/profiles";
import { buildReplayBundle } from "./replay";
import type { BridgeStore } from "./store";

export type BridgeContext = {
	bridgeUrl: string;
	store: BridgeStore;
};

const os = implement(harpistContract).$context<BridgeContext>();

const notFound = (message: string) =>
	new ORPCError("NOT_FOUND", {
		message,
	});

const requireProfile = async (context: BridgeContext, host: string) => {
	const profile = await context.store.getProfile(host);
	if (!profile) {
		throw notFound(`Unknown profile '${host}'.`);
	}
	return profile;
};

const bridgeRouter = {
	health: os.bridge.health.handler(() => ({
		name: "harpist-bridge" as const,
		ok: true as const,
		time: new Date().toISOString(),
		version: "0.1.0",
	})),
};

const profilesRouter = {
	get: os.profiles.get.handler(async ({ context, input }) =>
		requireProfile(context, input.host),
	),
	latest: os.profiles.latest.handler(({ context, input }) =>
		context.store.latestProfile(input.host),
	),
	list: os.profiles.list.handler(({ context }) => context.store.listProfiles()),
	setArtifacts: os.profiles.setArtifacts.handler(({ context, input }) =>
		context.store.setArtifacts(input.host, input.artifacts),
	),
	setAuth: os.profiles.setAuth.handler(({ context, input }) =>
		context.store.setAuth(input.host, input.auth),
	),
	update: os.profiles.update.handler(({ context, input }) =>
		context.store.updateProfile(input.host, {
			agentNotes: input.agentNotes,
			displayName: input.displayName,
			lastBridgeMessage: input.lastBridgeMessage,
			remoteDocsUrl: input.remoteDocsUrl,
			remoteProjectId: input.remoteProjectId,
		}),
	),
};

const recordingsRouter = {
	get: os.recordings.get.handler(async ({ context, input }) => {
		const recording = await context.store.getRecording(input.host, input.id);
		if (!recording) {
			throw notFound(`Unknown recording '${input.id}'.`);
		}
		return recording;
	}),
	ingest: os.recordings.ingest.handler(({ context, input }) =>
		context.store.ingestRecording(input),
	),
	latest: os.recordings.latest.handler(({ context, input }) =>
		context.store.latestRecording(input.host),
	),
	list: os.recordings.list.handler(({ context, input }) =>
		context.store.listRecordings(input.host),
	),
	markProcessed: os.recordings.markProcessed.handler(({ context, input }) =>
		context.store.markRecordingProcessed(input.host, input.id, input.status),
	),
};

const endpointsRouter = {
	annotate: os.endpoints.annotate.handler(({ context, input }) =>
		context.store.annotateEndpoint(input.host, input.templateKey, {
			description: input.description,
			included: input.included,
			notes: input.notes,
			operationName: input.operationName,
			tags: input.tags,
		}),
	),
	remove: os.endpoints.remove.handler(({ context, input }) =>
		context.store.removeEndpoint(input.host, input.templateKey),
	),
	upsert: os.endpoints.upsert.handler(({ context, input }) =>
		context.store.upsertEndpoint(input.host, input.endpoint),
	),
};

const authRouter = {
	replay: os.auth.replay.handler(async ({ context, input }) => {
		const profile = await requireProfile(context, input.host);
		const recordings = await context.store.listStoredRecordings(input.host);
		try {
			return buildReplayBundle({
				method: input.method,
				operationName: input.operationName,
				path: input.path,
				profile,
				recordings,
				templateKey: input.templateKey,
			});
		} catch (error) {
			throw new ORPCError("BAD_REQUEST", {
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}),
};

const handoffRouter = {
	get: os.handoff.get.handler(async ({ context, input }) => {
		const profile = await context.store.latestProfile(input.host);
		const latestRecording = await context.store.latestRecording(input.host);
		return {
			bridge: context.bridgeUrl,
			instructions: profile
				? buildAgentHandoffText(profile, {
						...DEFAULT_SETTINGS,
						serverUrl: context.bridgeUrl,
					})
				: "No Harpist profile exists yet. Record a site first.",
			latestRecording,
			profile,
			tools: [
				{
					description: "Read and mutate website profiles.",
					name: "profiles.*",
				},
				{
					description: "Read raw HAR recordings and mark processing state.",
					name: "recordings.*",
				},
				{
					description: "Annotate, upsert, or remove inferred endpoints.",
					name: "endpoints.*",
				},
				{
					description:
						"Get the latest runnable auth/curl replay bundle for an endpoint.",
					name: "auth.replay",
				},
			],
		};
	}),
};

const syncRouter = {
	pullExtensionState: os.sync.pullExtensionState.handler(
		async ({ context }) => ({
			profiles: await context.store.listProfiles(),
			pulledAt: new Date().toISOString(),
		}),
	),
	pushExtensionSnapshot: os.sync.pushExtensionSnapshot.handler(
		async ({ context, input }) =>
			context.store.ingestExtensionSnapshot({
				bridgeUrl: context.bridgeUrl,
				profiles: input.profiles,
				recordings: input.recordings,
			}),
	),
};

export const harpistRouter = os.router({
	auth: authRouter,
	bridge: bridgeRouter,
	endpoints: endpointsRouter,
	handoff: handoffRouter,
	profiles: profilesRouter,
	recordings: recordingsRouter,
	sync: syncRouter,
});
