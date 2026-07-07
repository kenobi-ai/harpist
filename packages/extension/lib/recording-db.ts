import type { HarArchive } from "@harpist/core/har";
import type {
	RecordingArchive,
	RecordingIndexEntry,
	RecordingIndexStore,
} from "@harpist/core/profiles";

const DATABASE_NAME = "harpist-recordings";
const DATABASE_VERSION = 4;
const ARCHIVE_STORE_NAME = "recordings";
const CHUNK_STORE_NAME = "recording-chunks";
const INDEX_STORE_NAME = "recording-index";
const MAX_ARCHIVE_CHUNK_BYTES = 512_000;

let databasePromise: Promise<IDBDatabase> | null = null;

const keyForRecording = (recording: Pick<RecordingArchive, "host" | "id">) =>
	`${recording.host}::${recording.id}`;

const keyForChunk = (recordingKey: string, index: number) =>
	`${recordingKey}::chunk::${index}`;

type ChunkedArchiveStorageFormat = {
	chunkCount: number;
	entryCount: number;
	type: "entry-chunks";
	version: 1;
};

type StoredRecordingArchive = RecordingArchive & {
	key: string;
	storageFormat?: ChunkedArchiveStorageFormat | unknown;
};

type StoredRecordingChunk = {
	entries: unknown[];
	index: number;
	key: string;
	recordingKey: string;
};

type StoredRecordingIndexEntry = RecordingIndexEntry & {
	key: string;
	storageFormat?: unknown;
};

const archiveFromStored = (recording: StoredRecordingArchive) => {
	const { key: _key, storageFormat: _storageFormat, ...archive } = recording;
	return archive;
};

const indexFromStored = (recording: StoredRecordingIndexEntry) => {
	const { key: _key, storageFormat: _storageFormat, ...index } = recording;
	return index;
};

const indexFromArchive = (
	recording: RecordingArchive,
): StoredRecordingIndexEntry => {
	const { har: _har, ...index } = recording;
	return {
		...index,
		archiveEntryCount: recording.har.log.entries.length,
		key: keyForRecording(recording),
	};
};

type RecordingUploadChunk = {
	entries: unknown[];
	index: number;
	total: number;
};

type RecordingUploadPlan = {
	archiveEntryCount: number;
	chunkCount: number;
	recording: Omit<RecordingArchive, "har"> & {
		harLog: Omit<HarArchive["log"], "entries">;
	};
};

const isChunkedArchiveStorageFormat = (
	storageFormat: unknown,
): storageFormat is ChunkedArchiveStorageFormat =>
	typeof storageFormat === "object" &&
	storageFormat !== null &&
	(storageFormat as { type?: unknown }).type === "entry-chunks" &&
	(storageFormat as { version?: unknown }).version === 1 &&
	typeof (storageFormat as { chunkCount?: unknown }).chunkCount === "number";

const chunkEntries = (entries: unknown[]): unknown[][] => {
	const chunks: unknown[][] = [];
	let current: unknown[] = [];
	let currentBytes = 0;
	for (const entry of entries) {
		const entryBytes = JSON.stringify(entry).length;
		if (
			current.length > 0 &&
			currentBytes + entryBytes > MAX_ARCHIVE_CHUNK_BYTES
		) {
			chunks.push(current);
			current = [];
			currentBytes = 0;
		}
		current.push(entry);
		currentBytes += entryBytes;
	}
	if (current.length > 0 || entries.length === 0) {
		chunks.push(current);
	}
	return chunks;
};

const harLogMetadata = (
	har: HarArchive,
): Omit<HarArchive["log"], "entries"> => {
	const { entries: _entries, ...log } = har.log;
	return log;
};

const recordingMetadataForUpload = (
	recording: RecordingArchive,
): RecordingUploadPlan["recording"] => {
	const { har, ...metadata } = recording;
	return {
		...metadata,
		harLog: harLogMetadata(har),
	};
};

const readStoredArchive = async (
	database: IDBDatabase,
	recording: Pick<RecordingArchive, "host" | "id">,
) =>
	new Promise<StoredRecordingArchive | null>((resolve, reject) => {
		const request = database
			.transaction(ARCHIVE_STORE_NAME, "readonly")
			.objectStore(ARCHIVE_STORE_NAME)
			.get(keyForRecording(recording));
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			resolve((request.result as StoredRecordingArchive | undefined) ?? null);
		};
	});

const readStoredChunk = async (
	database: IDBDatabase,
	recordingKey: string,
	index: number,
) =>
	new Promise<StoredRecordingChunk | null>((resolve, reject) => {
		const request = database
			.transaction(CHUNK_STORE_NAME, "readonly")
			.objectStore(CHUNK_STORE_NAME)
			.get(keyForChunk(recordingKey, index));
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			resolve((request.result as StoredRecordingChunk | undefined) ?? null);
		};
	});

const transactionDone = (transaction: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		transaction.onabort = () => reject(transaction.error);
		transaction.onerror = () => reject(transaction.error);
		transaction.oncomplete = () => resolve();
	});

const deleteChunksInTransaction = (
	transaction: IDBTransaction,
	recordingKey: string,
) => {
	const store = transaction.objectStore(CHUNK_STORE_NAME);
	const index = store.index("recordingKey");
	const request = index.openCursor(IDBKeyRange.only(recordingKey));
	request.onsuccess = () => {
		const cursor = request.result;
		if (!cursor) {
			return;
		}
		cursor.delete();
		cursor.continue();
	};
};

const openDatabase = () => {
	if (!databasePromise) {
		databasePromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
			request.onupgradeneeded = (event) => {
				const database = request.result;
				const transaction = request.transaction;
				if (
					event.oldVersion < 2 &&
					database.objectStoreNames.contains(ARCHIVE_STORE_NAME)
				) {
					database.deleteObjectStore(ARCHIVE_STORE_NAME);
				}
				const archiveStore = database.objectStoreNames.contains(
					ARCHIVE_STORE_NAME,
				)
					? transaction?.objectStore(ARCHIVE_STORE_NAME)
					: database.createObjectStore(ARCHIVE_STORE_NAME, {
							keyPath: "key",
						});

				if (archiveStore && !archiveStore.indexNames.contains("syncedAt")) {
					archiveStore.createIndex("syncedAt", "syncedAt", {
						unique: false,
					});
				}
				if (archiveStore && !archiveStore.indexNames.contains("host")) {
					archiveStore.createIndex("host", "host", {
						unique: false,
					});
				}

				const chunkStore = database.objectStoreNames.contains(CHUNK_STORE_NAME)
					? transaction?.objectStore(CHUNK_STORE_NAME)
					: database.createObjectStore(CHUNK_STORE_NAME, {
							keyPath: "key",
						});
				if (chunkStore && !chunkStore.indexNames.contains("recordingKey")) {
					chunkStore.createIndex("recordingKey", "recordingKey", {
						unique: false,
					});
				}

				const indexStore = database.objectStoreNames.contains(INDEX_STORE_NAME)
					? transaction?.objectStore(INDEX_STORE_NAME)
					: database.createObjectStore(INDEX_STORE_NAME, {
							keyPath: "key",
						});
				if (indexStore && !indexStore.indexNames.contains("syncedAt")) {
					indexStore.createIndex("syncedAt", "syncedAt", {
						unique: false,
					});
				}
				if (indexStore && !indexStore.indexNames.contains("host")) {
					indexStore.createIndex("host", "host", {
						unique: false,
					});
				}
			};
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
		});
	}
	return databasePromise;
};

const readIndexEntry = async (key: string) => {
	const database = await openDatabase();
	return new Promise<RecordingIndexEntry | null>((resolve, reject) => {
		const request = database
			.transaction(INDEX_STORE_NAME, "readonly")
			.objectStore(INDEX_STORE_NAME)
			.get(key);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const result = request.result as StoredRecordingIndexEntry | undefined;
			resolve(result ? indexFromStored(result) : null);
		};
	});
};

export const getRecordingIndex = async (): Promise<RecordingIndexStore> => {
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const request = database
			.transaction(INDEX_STORE_NAME, "readonly")
			.objectStore(INDEX_STORE_NAME)
			.getAll();
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const recordings = request.result as StoredRecordingIndexEntry[];
			resolve(
				Object.fromEntries(
					recordings.map((recording) => [
						recording.key,
						indexFromStored(recording),
					]),
				),
			);
		};
	});
};

export const getRecordingUploadPlan = async (
	recording: Pick<RecordingArchive, "host" | "id">,
): Promise<RecordingUploadPlan | null> => {
	const database = await openDatabase();
	const stored = await readStoredArchive(database, recording);
	if (!stored) {
		return null;
	}
	const archive = archiveFromStored(stored);
	if (!isChunkedArchiveStorageFormat(stored.storageFormat)) {
		const chunks = chunkEntries(archive.har.log.entries);
		return {
			archiveEntryCount: archive.har.log.entries.length,
			chunkCount: chunks.length,
			recording: recordingMetadataForUpload(archive),
		};
	}
	const storageFormat = stored.storageFormat;
	return {
		archiveEntryCount: storageFormat.entryCount,
		chunkCount: storageFormat.chunkCount,
		recording: recordingMetadataForUpload(archive),
	};
};

export const getRecordingUploadChunk = async (
	recording: Pick<RecordingArchive, "host" | "id">,
	index: number,
	total: number,
): Promise<RecordingUploadChunk | null> => {
	const database = await openDatabase();
	const recordingKey = keyForRecording(recording);
	const storedChunk = await readStoredChunk(database, recordingKey, index);
	if (storedChunk) {
		return {
			entries: storedChunk.entries,
			index,
			total,
		};
	}

	const stored = await readStoredArchive(database, recording);
	if (!stored || isChunkedArchiveStorageFormat(stored.storageFormat)) {
		return null;
	}
	const archive = archiveFromStored(stored);
	const chunks = chunkEntries(archive.har.log.entries);
	const entries = chunks[index];
	if (!entries) {
		return null;
	}
	return {
		entries,
		index,
		total: chunks.length,
	};
};

export const putRecording = async (recording: RecordingArchive) => {
	const database = await openDatabase();
	const recordingKey = keyForRecording(recording);
	const chunks = chunkEntries(recording.har.log.entries);
	const transaction = database.transaction(
		[ARCHIVE_STORE_NAME, CHUNK_STORE_NAME, INDEX_STORE_NAME],
		"readwrite",
	);
	transaction.objectStore(ARCHIVE_STORE_NAME).put({
		...recording,
		har: {
			...recording.har,
			log: {
				...recording.har.log,
				entries: [],
			},
		},
		key: recordingKey,
		storageFormat: {
			chunkCount: chunks.length,
			entryCount: recording.har.log.entries.length,
			type: "entry-chunks",
			version: 1,
		} satisfies ChunkedArchiveStorageFormat,
	});
	for (const [index, entries] of chunks.entries()) {
		transaction.objectStore(CHUNK_STORE_NAME).put({
			entries,
			index,
			key: keyForChunk(recordingKey, index),
			recordingKey,
		} satisfies StoredRecordingChunk);
	}
	transaction.objectStore(INDEX_STORE_NAME).put(indexFromArchive(recording));
	await transactionDone(transaction);
};

export const deleteRecording = async (
	recording: Pick<RecordingArchive, "host" | "id">,
) => {
	const database = await openDatabase();
	const transaction = database.transaction(
		[ARCHIVE_STORE_NAME, CHUNK_STORE_NAME, INDEX_STORE_NAME],
		"readwrite",
	);
	const key = keyForRecording(recording);
	transaction.objectStore(ARCHIVE_STORE_NAME).delete(key);
	transaction.objectStore(INDEX_STORE_NAME).delete(key);
	deleteChunksInTransaction(transaction, key);
	await transactionDone(transaction);
};

export const patchRecordingIndexEntry = async (
	recording: Pick<RecordingArchive, "host" | "id">,
	patch: Pick<
		RecordingIndexEntry,
		"lastSyncAttemptAt" | "lastSyncError" | "syncedAt"
	>,
) => {
	const key = keyForRecording(recording);
	const existing = await readIndexEntry(key);
	if (!existing) {
		return;
	}
	const database = await openDatabase();
	const transaction = database.transaction(INDEX_STORE_NAME, "readwrite");
	transaction.objectStore(INDEX_STORE_NAME).put({
		...existing,
		...patch,
		key,
	});
	await transactionDone(transaction);
};
