import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CapturedCookie, HarArchive, PendingEntry } from "@harpist/core/har";
import {
	type ActiveRecording,
	type AuthSummary,
	type EndpointSummary,
	mergeProfile,
	normaliseServerUrl,
	type ProfileArtifacts,
	type ProfilesStore,
	type RecordingSummary,
	type SiteProfile,
	summariseRecording,
} from "@harpist/core/profiles";

export type StoredRecording = RecordingSummary & {
	har: HarArchive;
	host: string;
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

const writeJson = async (file: string, value: unknown) => {
	await mkdir(dirname(file), {
		recursive: true,
	});
	await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const slug = (value: string) =>
	encodeURIComponent(value).replace(/%/g, "_").replace(/\./g, "-");

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

const requestCookiesFromHar = (request: unknown): CapturedCookie[] | undefined => {
	if (typeof request !== "object" || request === null) {
		return undefined;
	}
	const harpist = (request as { _harpist?: unknown })._harpist;
	if (typeof harpist !== "object" || harpist === null) {
		return undefined;
	}
	const requestCookies = (harpist as { requestCookies?: unknown }).requestCookies;
	if (!Array.isArray(requestCookies)) {
		return undefined;
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
				domain:
					typeof cookie.domain === "string" ? cookie.domain : undefined,
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

const entriesFromHar = (har: HarArchive): PendingEntry[] =>
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

const refreshEndpointCounts = (profile: SiteProfile): SiteProfile => {
	const scanned = new Set(
		profile.endpoints.map((endpoint) => endpoint.exactKey),
	);
	const derived = new Set(
		profile.endpoints
			.filter((endpoint) => endpoint.included !== false)
			.map((endpoint) => endpoint.templateKey),
	);
	return {
		...profile,
		derivedEndpointCount: derived.size,
		endpointTemplateKeys: [...derived],
		scannedEndpointCount: scanned.size,
		scannedEndpointKeys: [...scanned],
		updatedAt: new Date().toISOString(),
	};
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
	const endpointByKey = new Map<string, EndpointSummary>();
	for (const endpoint of existing?.endpoints ?? []) {
		endpointByKey.set(endpoint.templateKey, endpoint);
	}
	for (const endpoint of incoming.endpoints) {
		endpointByKey.set(endpoint.templateKey, {
			...endpointByKey.get(endpoint.templateKey),
			...endpoint,
		});
	}
	const recordingById = new Map<string, RecordingSummary>();
	for (const recording of incoming.recordings) {
		recordingById.set(recording.id, recording);
	}
	for (const recording of existing?.recordings ?? []) {
		recordingById.set(recording.id, recording);
	}
	return refreshEndpointCounts({
		...base,
		agentNotes: existing?.agentNotes ?? incoming.agentNotes,
		artifacts: existing?.artifacts ?? incoming.artifacts,
		endpoints: [...endpointByKey.values()].sort((left, right) =>
			left.templateKey.localeCompare(right.templateKey),
		),
		lastBridgeMessage: "Bridge synced",
		recordings: [...recordingById.values()]
			.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
			.slice(0, 20),
		remoteDocsUrl: canonicalDocsUrl(bridgeUrl, incoming.host),
		remoteProjectId: incoming.host,
		status: "synced",
	});
};

export const createBridgeStore = (dataDir: string) => {
	const indexFile = join(dataDir, "profiles.json");
	const recordingFile = (host: string, id: string) =>
		join(dataDir, "recordings", slug(host), `${id}.json`);

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
				message: "Bridge active",
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

		for (const profile of input.profiles) {
			index.profiles[profile.host] = mergeProfileSnapshot(
				index.profiles[profile.host],
				profile,
				input.bridgeUrl,
			);
		}

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
		getProfile,
		getRecording: readRecording,
		ingestRecording,
		ingestExtensionSnapshot,
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
		removeEndpoint: async (host: string, templateKey: string) => {
			const profile = await requireProfile(host);
			return saveProfile(
				refreshEndpointCounts({
					...profile,
					endpoints: profile.endpoints.filter(
						(endpoint) => endpoint.templateKey !== templateKey,
					),
				}),
			);
		},
		requireProfile,
		saveProfile,
		setArtifacts: async (host: string, artifacts: ProfileArtifacts) => {
			const profile = await requireProfile(host);
			return saveProfile({
				...profile,
				artifacts,
				updatedAt: new Date().toISOString(),
			});
		},
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
			const profile = await requireProfile(host);
			const existing = profile.endpoints.filter(
				(item) => item.templateKey !== endpoint.templateKey,
			);
			return saveProfile(
				refreshEndpointCounts({
					...profile,
					endpoints: [...existing, endpoint].sort((left, right) =>
						left.templateKey.localeCompare(right.templateKey),
					),
				}),
			);
		},
	};
};

export type BridgeStore = ReturnType<typeof createBridgeStore>;
