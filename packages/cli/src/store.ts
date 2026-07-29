import {
	chmod,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { CredentialValidation } from "../../core/src/credentials";
import type {
	CapturedCookie,
	HarArchive,
	PendingEntry,
} from "../../core/src/har";
import {
	type ActiveRecording,
	type AuthSummary,
	applyEndpointIdentityOverrides,
	type EndpointIdentityOverride,
	type EndpointSummary,
	type LatestAuth,
	latestRecordingNeedsRefinement,
	mergeProfile,
	normaliseServerUrl,
	type ProfileArtifacts,
	type ProfilesStore,
	type RecordingSummary,
	type SiteProfile,
	summariseRecording,
} from "../../core/src/profiles";
import type { SiteArtifactFiles, SiteArtifactPaths } from "./artifacts";
import { createAuthLedgerStore, slug } from "./auth-ledger";
import { createCommandQueue } from "./command-queue";

export type StoredRecording = RecordingSummary & {
	har: HarArchive;
	host: string;
};

type StoredRecordingChunkInput = {
	chunk: {
		entries: unknown[];
		index: number;
		total: number;
	};
	profiles: SiteProfile[];
	recording: RecordingSummary & {
		harLog: Omit<HarArchive["log"], "entries">;
		host: string;
	};
};

type StoreIndex = {
	profiles: ProfilesStore;
};

const isMissing = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	(error as { code?: string }).code === "ENOENT";

const readJsonOrNull = async <T>(file: string): Promise<T | null> => {
	try {
		return JSON.parse(await readFile(file, "utf8")) as T;
	} catch (error) {
		if (isMissing(error)) {
			return null;
		}
		throw error;
	}
};

const writeAtomically = async (file: string, value: string) => {
	await mkdir(dirname(file), {
		mode: 0o700,
		recursive: true,
	});
	const temporaryFile = join(
		dirname(file),
		`.${basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`,
	);
	try {
		await writeFile(temporaryFile, value, {
			encoding: "utf8",
			mode: 0o600,
		});
		await rename(temporaryFile, file);
		await chmod(file, 0o600);
	} catch (error) {
		await rm(temporaryFile, { force: true }).catch(() => undefined);
		throw error;
	}
};

const writeJson = (file: string, value: unknown) =>
	writeAtomically(file, `${JSON.stringify(value, null, 2)}\n`);

const writeText = (file: string, value: string) => writeAtomically(file, value);

const headersFromHar = (headers: unknown): Record<string, string> => {
	if (!Array.isArray(headers)) {
		return {};
	}
	const next: Record<string, string> = {};
	for (const header of headers) {
		if (
			typeof header === "object" &&
			header !== null &&
			"name" in header &&
			"value" in header
		) {
			next[String(header.name)] = String(header.value);
		}
	}
	return next;
};

const requestCookiesFromHar = (
	request: unknown,
): CapturedCookie[] | undefined => {
	if (typeof request !== "object" || request === null) {
		return;
	}
	const harpist = (request as { _harpist?: unknown })._harpist;
	if (typeof harpist !== "object" || harpist === null) {
		return;
	}
	const requestCookies = (harpist as { requestCookies?: unknown })
		.requestCookies;
	if (!Array.isArray(requestCookies)) {
		return;
	}
	return requestCookies
		.map((cookie): CapturedCookie | null => {
			if (
				typeof cookie !== "object" ||
				cookie === null ||
				!("name" in cookie)
			) {
				return null;
			}
			return {
				domain: typeof cookie.domain === "string" ? cookie.domain : undefined,
				expiresAt:
					typeof cookie.expiresAt === "string" ? cookie.expiresAt : undefined,
				httpOnly:
					typeof cookie.httpOnly === "boolean" ? cookie.httpOnly : undefined,
				name: String(cookie.name),
				sameSite:
					typeof cookie.sameSite === "string" ? cookie.sameSite : undefined,
				secure: typeof cookie.secure === "boolean" ? cookie.secure : undefined,
				session:
					typeof cookie.session === "boolean" ? cookie.session : undefined,
				value: typeof cookie.value === "string" ? cookie.value : undefined,
			};
		})
		.filter((cookie): cookie is CapturedCookie => cookie !== null);
};

export const entriesFromHar = (har: HarArchive): PendingEntry[] =>
	har.log.entries
		.map((raw): PendingEntry | null => {
			if (typeof raw !== "object" || raw === null) {
				return null;
			}
			const entry = raw as {
				request?: {
					headers?: unknown;
					method?: unknown;
					postData?: { mimeType?: unknown; text?: unknown };
					url?: unknown;
				};
				response?: {
					content?: {
						encoding?: unknown;
						mimeType?: unknown;
						text?: unknown;
					};
					headers?: unknown;
					status?: unknown;
					statusText?: unknown;
				};
				startedDateTime?: unknown;
			};
			if (
				typeof entry.request?.method !== "string" ||
				typeof entry.request.url !== "string"
			) {
				return null;
			}
			return {
				body:
					typeof entry.response?.content?.text === "string"
						? entry.response.content.text
						: undefined,
				bodyBase64: entry.response?.content?.encoding === "base64",
				method: entry.request.method,
				postData:
					typeof entry.request.postData?.text === "string"
						? entry.request.postData.text
						: undefined,
				postDataMime:
					typeof entry.request.postData?.mimeType === "string"
						? entry.request.postData.mimeType
						: undefined,
				requestCookies: requestCookiesFromHar(entry.request),
				requestHeaders: headersFromHar(entry.request.headers),
				responseHeaders: headersFromHar(entry.response?.headers),
				responseMime:
					typeof entry.response?.content?.mimeType === "string"
						? entry.response.content.mimeType
						: undefined,
				startedDateTime:
					typeof entry.startedDateTime === "string"
						? entry.startedDateTime
						: new Date().toISOString(),
				status:
					typeof entry.response?.status === "number"
						? entry.response.status
						: undefined,
				statusText:
					typeof entry.response?.statusText === "string"
						? entry.response.statusText
						: undefined,
				url: entry.request.url,
			};
		})
		.filter((entry): entry is PendingEntry => entry !== null);

const sortProfiles = (profiles: SiteProfile[]) =>
	[...profiles].sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	);

const canonicalDocsUrl = (bridgeUrl: string, host: string) =>
	`${normaliseServerUrl(bridgeUrl)}/profiles/${encodeURIComponent(host)}/docs`;

const draftArtifacts = (artifacts?: ProfileArtifacts) =>
	artifacts
		? {
				...artifacts,
				status: "draft" as const,
				updatedAt: new Date().toISOString(),
			}
		: undefined;

const refreshEndpointCounts = (profile: SiteProfile): SiteProfile => {
	const scanned = new Set(profile.scannedEndpointKeys);
	for (const endpoint of profile.endpoints) {
		scanned.add(endpoint.exactKey);
	}
	const derived = new Set(
		profile.endpoints
			.filter((endpoint) => endpoint.included !== false)
			.map((endpoint) => endpoint.templateKey),
	);
	return {
		...profile,
		derivedEndpointCount: derived.size,
		endpointTemplateKeys: [...derived].sort((left, right) =>
			left.localeCompare(right),
		),
		scannedEndpointCount: scanned.size,
		scannedEndpointKeys: [...scanned].sort((left, right) =>
			left.localeCompare(right),
		),
		updatedAt: new Date().toISOString(),
	};
};

const validateEndpointIdentity = (endpoint: EndpointSummary) => {
	if (
		endpoint.method !== endpoint.method.toUpperCase() ||
		!/^[A-Z][A-Z0-9!#$%&'*+.^_`|~-]*$/.test(endpoint.method)
	) {
		throw new Error(
			`Endpoint method '${endpoint.method}' must be an uppercase HTTP token.`,
		);
	}
	for (const [name, value] of [
		["path", endpoint.path],
		["template", endpoint.template],
	] as const) {
		if (!value.startsWith("/") || /[?#]/.test(value)) {
			throw new Error(
				`Endpoint ${name} '${value}' must be an absolute path without query or fragment text.`,
			);
		}
	}
	if (!endpoint.host || /\s|[/#?]/.test(endpoint.host)) {
		throw new Error(`Endpoint host '${endpoint.host}' is invalid.`);
	}
	const exactKey = `${endpoint.method} ${endpoint.host}${endpoint.path}`;
	const templateKey = `${endpoint.method} ${endpoint.host}${endpoint.template}`;
	if (endpoint.exactKey !== exactKey) {
		throw new Error(
			`Endpoint exactKey must be '${exactKey}' for its method, host, and path.`,
		);
	}
	if (endpoint.templateKey !== templateKey) {
		throw new Error(
			`Endpoint templateKey must be '${templateKey}' for its method, host, and template.`,
		);
	}
};

const mergeEndpointIdentityOverrides = (
	incoming: EndpointIdentityOverride[] = [],
	existing: EndpointIdentityOverride[] = [],
) => {
	const byExactKey = new Map<string, EndpointIdentityOverride>();
	for (const override of incoming) {
		byExactKey.set(override.exactKey, override);
	}
	for (const override of existing) {
		byExactKey.set(override.exactKey, override);
	}
	return [...byExactKey.values()].sort((left, right) =>
		left.exactKey.localeCompare(right.exactKey),
	);
};

const newestLatestAuth = (
	left?: LatestAuth,
	right?: LatestAuth,
): LatestAuth | undefined => {
	if (!left) {
		return right;
	}
	if (!right) {
		return left;
	}
	return (right.capturedAt ?? "").localeCompare(left.capturedAt ?? "") > 0
		? right
		: left;
};

const mergeProfileSnapshot = (
	existing: SiteProfile | undefined,
	incoming: SiteProfile,
	bridgeUrl: string,
): SiteProfile => {
	const base =
		!existing || incoming.updatedAt.localeCompare(existing.updatedAt) > 0
			? incoming
			: existing;
	const endpointIdentityOverrides = mergeEndpointIdentityOverrides(
		incoming.endpointIdentityOverrides,
		existing?.endpointIdentityOverrides,
	);
	const existingRemoved = new Set(existing?.removedEndpointTemplateKeys ?? []);
	const existingEndpointKeys = new Set(
		(existing?.endpoints ?? []).map((endpoint) => endpoint.templateKey),
	);
	const removedEndpointTemplateKeys = [
		...new Set([
			...(incoming.removedEndpointTemplateKeys ?? []),
			...(existing?.removedEndpointTemplateKeys ?? []),
		]),
	]
		.filter(
			(templateKey) =>
				existingRemoved.has(templateKey) ||
				!existingEndpointKeys.has(templateKey),
		)
		.sort((left, right) => left.localeCompare(right));
	const removed = new Set(removedEndpointTemplateKeys);
	const overrideExactKeys = new Set(
		endpointIdentityOverrides.map((override) => override.exactKey),
	);
	const endpointByKey = new Map<string, EndpointSummary>();
	for (const endpoint of applyEndpointIdentityOverrides(
		existing?.endpoints ?? [],
		endpointIdentityOverrides,
	)) {
		if (removed.has(endpoint.templateKey)) {
			continue;
		}
		endpointByKey.set(endpoint.templateKey, endpoint);
	}
	for (const endpoint of applyEndpointIdentityOverrides(
		incoming.endpoints,
		endpointIdentityOverrides,
	)) {
		if (removed.has(endpoint.templateKey)) {
			continue;
		}
		const existingEndpoint = endpointByKey.get(endpoint.templateKey);
		endpointByKey.set(
			endpoint.templateKey,
			overrideExactKeys.has(endpoint.exactKey)
				? {
						...endpoint,
						...existingEndpoint,
						template: endpoint.template,
						templateKey: endpoint.templateKey,
					}
				: {
						...existingEndpoint,
						...endpoint,
					},
		);
	}
	const recordingById = new Map<string, RecordingSummary>();
	for (const recording of incoming.recordings) {
		recordingById.set(recording.id, recording);
	}
	for (const recording of existing?.recordings ?? []) {
		recordingById.set(recording.id, recording);
	}
	const latestAuth = newestLatestAuth(
		existing?.latestAuth,
		incoming.latestAuth,
	);
	const merged = refreshEndpointCounts({
		...base,
		agentNotes: existing?.agentNotes ?? incoming.agentNotes,
		artifacts: existing?.artifacts ?? incoming.artifacts,
		endpointIdentityOverrides,
		endpoints: [...endpointByKey.values()].sort((left, right) =>
			left.templateKey.localeCompare(right.templateKey),
		),
		lastBridgeMessage: "Bridge synced",
		latestAuth,
		recordings: [...recordingById.values()]
			.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
			.slice(0, 20),
		remoteDocsUrl: canonicalDocsUrl(bridgeUrl, incoming.host),
		remoteProjectId: incoming.host,
		removedEndpointTemplateKeys,
		status: "synced",
	});
	return {
		...merged,
		lastBridgeMessage: latestRecordingNeedsRefinement(merged)
			? "Ready for agent"
			: "Bridge synced",
	};
};

export const createBridgeStore = (dataDir: string) => {
	const authLedgers = createAuthLedgerStore(dataDir);
	const commands = createCommandQueue(dataDir);
	const extensionFile = join(dataDir, "extension.json");
	const indexFile = join(dataDir, "profiles.json");
	const recordingFile = (host: string, id: string) =>
		join(dataDir, "recordings", slug(host), `${id}.json`);
	const recordingChunkDirectory = (host: string, id: string) =>
		join(dataDir, "recording-chunks", slug(host), id);
	const recordingChunkFile = (host: string, id: string, index: number) =>
		join(recordingChunkDirectory(host, id), `${index}.json`);
	const siteArtifactPaths = (host: string): SiteArtifactPaths => {
		const directory = join("sites", slug(host));
		return {
			contractPath: join(directory, "contract.ts"),
			contractProfilePath: join(directory, "contract-profile.json"),
			metadataPath: join(directory, "metadata.json"),
			openapiPath: join(directory, "openapi.json"),
		};
	};
	const artifactFile = (path: string) => join(dataDir, path);

	const readIndex = async (): Promise<StoreIndex> =>
		(await readJsonOrNull<StoreIndex>(indexFile)) ?? {
			profiles: {},
		};

	const writeIndex = (index: StoreIndex) => writeJson(indexFile, index);

	const getProfile = async (host: string) => (await readIndex()).profiles[host];

	const requireProfile = async (host: string) => {
		const profile = await getProfile(host);
		if (!profile) {
			throw new Error(`Unknown profile '${host}'.`);
		}
		return profile;
	};

	const saveProfile = async (profile: SiteProfile) => {
		const index = await readIndex();
		index.profiles[profile.host] = profile;
		await writeIndex(index);
		return profile;
	};

	const readRecording = (host: string, id: string) =>
		readJsonOrNull<StoredRecording>(recordingFile(host, id));

	const mergeExtensionProfiles = async (
		index: StoreIndex,
		profiles: SiteProfile[],
		bridgeUrl: string,
	) => {
		for (const profile of profiles) {
			const merged = mergeProfileSnapshot(
				index.profiles[profile.host],
				profile,
				bridgeUrl,
			);
			index.profiles[profile.host] = merged;
			await authLedgers.getLedger(merged);
		}
	};

	const readProfileArtifactText = async (
		host: string,
		pathKey: "contractPath",
	) => {
		const profile = await requireProfile(host);
		const path = profile.artifacts?.[pathKey];
		if (!path) {
			return null;
		}
		return readFile(artifactFile(path), "utf8");
	};

	const readProfileArtifactJson = async <T>(
		host: string,
		pathKey: "contractProfilePath" | "metadataPath" | "openapiPath",
	) => {
		const profile = await requireProfile(host);
		const path = profile.artifacts?.[pathKey];
		if (!path) {
			return null;
		}
		return readJsonOrNull<T>(artifactFile(path));
	};

	const ingestRecording = async (input: {
		bridgeUrl: string;
		har: HarArchive;
		meta: ActiveRecording;
	}) => {
		const entries = entriesFromHar(input.har);
		const summary = summariseRecording(entries, input.meta, {
			startedAt: input.meta.startedAt,
		});
		const index = await readIndex();
		const remoteDocsUrl = canonicalDocsUrl(input.bridgeUrl, input.meta.host);
		const profile = {
			...mergeProfile(index.profiles[input.meta.host], input.meta, summary, {
				message: "Ready for agent",
				projectId: input.meta.host,
				serverUrl: input.bridgeUrl,
				status: "synced",
			}),
			remoteDocsUrl,
			remoteProjectId: input.meta.host,
			status: "synced" as const,
		};
		const recording: StoredRecording = {
			...summary.recording,
			har: input.har,
			host: input.meta.host,
		};
		index.profiles[profile.host] = profile;
		await writeIndex(index);
		await writeJson(recordingFile(recording.host, recording.id), recording);
		await authLedgers.getLedger(profile);
		return {
			profile,
			recording,
		};
	};

	const listProfiles = async () =>
		sortProfiles(Object.values((await readIndex()).profiles));

	const latestProfile = async (host?: string) => {
		if (host) {
			return (await readIndex()).profiles[host] ?? null;
		}
		return (await listProfiles())[0] ?? null;
	};

	const latestRecording = async (host?: string) => {
		const profile = await latestProfile(host);
		if (!profile?.lastRecordingId) {
			return null;
		}
		return readRecording(profile.host, profile.lastRecordingId);
	};

	const listStoredRecordings = async (host: string) => {
		const profile = await requireProfile(host);
		const recordings = await Promise.all(
			profile.recordings.map((recording) =>
				readRecording(profile.host, recording.id),
			),
		);
		return recordings
			.filter((recording): recording is StoredRecording => recording !== null)
			.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
	};

	const ingestExtensionSnapshot = async (input: {
		bridgeUrl: string;
		profiles: SiteProfile[];
		recordings: StoredRecording[];
	}) => {
		const index = await readIndex();
		const appliedRecordingIds: string[] = [];

		await mergeExtensionProfiles(index, input.profiles, input.bridgeUrl);

		for (const recording of input.recordings) {
			const existing = await readRecording(recording.host, recording.id);
			if (!existing) {
				await writeJson(recordingFile(recording.host, recording.id), recording);
			}
			appliedRecordingIds.push(recording.id);
		}

		await writeIndex(index);
		return {
			appliedRecordingIds,
			profiles: sortProfiles(Object.values(index.profiles)),
			syncedAt: new Date().toISOString(),
		};
	};

	const ingestExtensionRecordingChunk = async (
		input: StoredRecordingChunkInput & {
			bridgeUrl: string;
		},
	) => {
		if (input.chunk.index >= input.chunk.total) {
			throw new Error(
				`Recording chunk ${input.chunk.index} is outside total ${input.chunk.total}.`,
			);
		}

		await writeJson(
			recordingChunkFile(
				input.recording.host,
				input.recording.id,
				input.chunk.index,
			),
			input.chunk.entries,
		);

		const chunkEntries = await Promise.all(
			Array.from({ length: input.chunk.total }, (_value, index) =>
				readJsonOrNull<unknown[]>(
					recordingChunkFile(input.recording.host, input.recording.id, index),
				),
			),
		);
		const index = await readIndex();
		const syncedAt = new Date().toISOString();
		if (chunkEntries.some((entries) => entries === null)) {
			return {
				acceptedChunkIndex: input.chunk.index,
				appliedRecordingIds: [],
				complete: false,
				profiles: sortProfiles(Object.values(index.profiles)),
				syncedAt,
			};
		}

		await mergeExtensionProfiles(index, input.profiles, input.bridgeUrl);

		const { harLog, host, ...recordingMeta } = input.recording;
		const recording: StoredRecording = {
			...recordingMeta,
			har: {
				log: {
					...harLog,
					entries: chunkEntries.flatMap((entries) => entries ?? []),
				},
			},
			host,
		};
		const existing = await readRecording(recording.host, recording.id);
		if (!existing) {
			await writeJson(recordingFile(recording.host, recording.id), recording);
		}
		await writeIndex(index);
		await rm(recordingChunkDirectory(recording.host, recording.id), {
			force: true,
			recursive: true,
		});

		return {
			acceptedChunkIndex: input.chunk.index,
			appliedRecordingIds: [recording.id],
			complete: true,
			profiles: sortProfiles(Object.values(index.profiles)),
			syncedAt,
		};
	};

	const restoreExtensionProfile = async (input: {
		bridgeUrl: string;
		host: string;
		profile: SiteProfile | null;
		removedRecordingId?: string;
	}) => {
		const index = await readIndex();
		if (input.profile) {
			index.profiles[input.host] = {
				...input.profile,
				remoteDocsUrl: canonicalDocsUrl(input.bridgeUrl, input.host),
				remoteProjectId: input.host,
				status: "synced",
				updatedAt: new Date().toISOString(),
			};
			await authLedgers.getLedger(index.profiles[input.host]);
		} else {
			delete index.profiles[input.host];
		}
		if (input.removedRecordingId) {
			await rm(recordingFile(input.host, input.removedRecordingId), {
				force: true,
			});
		}
		await writeIndex(index);
		return {
			profiles: sortProfiles(Object.values(index.profiles)),
			restoredAt: new Date().toISOString(),
		};
	};

	const getAuthLedger = async (host: string) =>
		authLedgers.getLedger(await requireProfile(host));

	const getExtensionPresence = () =>
		readJsonOrNull<{ extensionId: string; lastSeenAt: string }>(extensionFile);

	const recordExtensionPresence = async (extensionId: string) => {
		const presence = {
			extensionId,
			lastSeenAt: new Date().toISOString(),
		};
		await writeJson(extensionFile, presence);
		return presence;
	};

	return {
		annotateEndpoint: async (
			host: string,
			templateKey: string,
			patch: Partial<
				Pick<
					EndpointSummary,
					"description" | "included" | "notes" | "operationName" | "tags"
				>
			>,
		) => {
			const profile = await requireProfile(host);
			if (
				!profile.endpoints.some(
					(endpoint) => endpoint.templateKey === templateKey,
				)
			) {
				throw new Error(`Unknown endpoint '${templateKey}'.`);
			}
			const endpoints = profile.endpoints.map((endpoint) =>
				endpoint.templateKey === templateKey
					? {
							...endpoint,
							...patch,
						}
					: endpoint,
			);
			return saveProfile(refreshEndpointCounts({ ...profile, endpoints }));
		},
		commands,
		getAuthLedger,
		getExtensionPresence,
		getProfile,
		getRecording: readRecording,
		getSiteArtifactPaths: siteArtifactPaths,
		ingestExtensionRecordingChunk,
		ingestExtensionSnapshot,
		ingestRecording,
		recordExtensionPresence,
		latestProfile,
		latestRecording,
		listProfiles,
		listRecordings: async (host: string) =>
			(await requireProfile(host)).recordings,
		listStoredRecordings,
		markRecordingProcessed: async (
			host: string,
			id: string,
			status: "complete" | "processing",
		) => {
			const recording = await readRecording(host, id);
			if (!recording) {
				throw new Error(`Unknown recording '${id}'.`);
			}
			const nextRecording: StoredRecording = {
				...recording,
				processedAt:
					status === "complete"
						? new Date().toISOString()
						: recording.processedAt,
				processingStatus: status,
			};
			await writeJson(recordingFile(host, id), nextRecording);
			const profile = await requireProfile(host);
			const recordings = profile.recordings.map((summary) =>
				summary.id === id
					? {
							...summary,
							processedAt: nextRecording.processedAt,
							processingStatus: status,
						}
					: summary,
			);
			await saveProfile({
				...profile,
				recordings,
				updatedAt: new Date().toISOString(),
			});
			return nextRecording;
		},
		readProfileContract: (host: string) =>
			readProfileArtifactText(host, "contractPath"),
		recordCredentialValidation: async (
			host: string,
			credentialId: string,
			validation: CredentialValidation,
		) =>
			authLedgers.recordValidation(
				await requireProfile(host),
				credentialId,
				validation,
			),
		readProfileContractProfile: (host: string) =>
			readProfileArtifactJson<unknown>(host, "contractProfilePath"),
		readProfileMetadata: (host: string) =>
			readProfileArtifactJson<unknown>(host, "metadataPath"),
		readProfileOpenApi: (host: string) =>
			readProfileArtifactJson<unknown>(host, "openapiPath"),
		removeEndpoint: async (host: string, templateKey: string) => {
			const profile = await requireProfile(host);
			if (
				!profile.endpoints.some(
					(endpoint) => endpoint.templateKey === templateKey,
				)
			) {
				throw new Error(`Unknown endpoint '${templateKey}'.`);
			}
			return saveProfile(
				refreshEndpointCounts({
					...profile,
					artifacts: draftArtifacts(profile.artifacts),
					endpoints: profile.endpoints.filter(
						(endpoint) => endpoint.templateKey !== templateKey,
					),
					lastBridgeMessage: "Endpoint edit needs documentation review",
					removedEndpointTemplateKeys: [
						...new Set([
							...(profile.removedEndpointTemplateKeys ?? []),
							templateKey,
						]),
					].sort((left, right) => left.localeCompare(right)),
				}),
			);
		},
		requireProfile,
		restoreExtensionProfile,
		saveProfile,
		setActiveCredential: async (host: string, credentialId: string | null) =>
			authLedgers.setActiveCredential(await requireProfile(host), credentialId),
		setArtifacts: async (host: string, artifacts: ProfileArtifacts) => {
			const profile = await requireProfile(host);
			return saveProfile({
				...profile,
				artifacts,
				updatedAt: new Date().toISOString(),
			});
		},
		setAuthLoginUrl: async (host: string, loginUrl: string) =>
			authLedgers.setLoginUrl(await requireProfile(host), loginUrl),
		setAuth: async (host: string, auth: AuthSummary) => {
			const profile = await requireProfile(host);
			return saveProfile({
				...profile,
				auth,
				updatedAt: new Date().toISOString(),
			});
		},
		updateProfile: async (
			host: string,
			patch: Partial<
				Pick<
					SiteProfile,
					| "agentNotes"
					| "displayName"
					| "lastBridgeMessage"
					| "remoteDocsUrl"
					| "remoteProjectId"
				>
			>,
		) => {
			const profile = await requireProfile(host);
			return saveProfile({
				...profile,
				...patch,
				updatedAt: new Date().toISOString(),
			});
		},
		upsertEndpoint: async (host: string, endpoint: EndpointSummary) => {
			validateEndpointIdentity(endpoint);
			if (endpoint.host !== host) {
				throw new Error(
					`Endpoint host '${endpoint.host}' does not match target profile '${host}'.`,
				);
			}
			const profile = await requireProfile(host);
			const endpointIdentityOverrides = mergeEndpointIdentityOverrides(
				profile.endpointIdentityOverrides,
				[
					{
						exactKey: endpoint.exactKey,
						template: endpoint.template,
						templateKey: endpoint.templateKey,
					},
				],
			);
			const existing = profile.endpoints.filter(
				(item) =>
					item.templateKey !== endpoint.templateKey &&
					item.exactKey !== endpoint.exactKey,
			);
			return saveProfile(
				refreshEndpointCounts({
					...profile,
					artifacts: draftArtifacts(profile.artifacts),
					endpointIdentityOverrides,
					endpoints: [...existing, endpoint].sort((left, right) =>
						left.templateKey.localeCompare(right.templateKey),
					),
					lastBridgeMessage: "Endpoint edit needs documentation review",
					removedEndpointTemplateKeys: (
						profile.removedEndpointTemplateKeys ?? []
					).filter((templateKey) => templateKey !== endpoint.templateKey),
				}),
			);
		},
		writeSiteArtifacts: async (host: string, files: SiteArtifactFiles) => {
			const paths = siteArtifactPaths(host);
			await writeJson(
				artifactFile(paths.contractProfilePath),
				files.contractProfile,
			);
			await writeText(artifactFile(paths.contractPath), files.contractSource);
			await writeJson(artifactFile(paths.metadataPath), files.metadata);
			await writeJson(artifactFile(paths.openapiPath), files.openapi);
			return paths;
		},
	};
};

export type BridgeStore = ReturnType<typeof createBridgeStore>;
