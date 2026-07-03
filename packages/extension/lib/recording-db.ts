import type {
	RecordingArchive,
	RecordingIndexEntry,
	RecordingIndexStore,
} from "@harpist/core/profiles";

const DATABASE_NAME = "harpist-recordings";
const DATABASE_VERSION = 3;
const ARCHIVE_STORE_NAME = "recordings";
const INDEX_STORE_NAME = "recording-index";

let databasePromise: Promise<IDBDatabase> | null = null;

const keyForRecording = (recording: Pick<RecordingArchive, "host" | "id">) =>
	`${recording.host}::${recording.id}`;

type StoredRecordingArchive = RecordingArchive & {
	key: string;
};

type StoredRecordingIndexEntry = RecordingIndexEntry & {
	key: string;
	storageFormat?: unknown;
};

const archiveFromStored = (recording: StoredRecordingArchive) => {
	const { key: _key, ...archive } = recording;
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

const transactionDone = (transaction: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		transaction.onabort = () => reject(transaction.error);
		transaction.onerror = () => reject(transaction.error);
		transaction.oncomplete = () => resolve();
	});

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

export const getRecording = async (
	recording: Pick<RecordingArchive, "host" | "id">,
): Promise<RecordingArchive | null> => {
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const request = database
			.transaction(ARCHIVE_STORE_NAME, "readonly")
			.objectStore(ARCHIVE_STORE_NAME)
			.get(keyForRecording(recording));
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const result = request.result as StoredRecordingArchive | undefined;
			resolve(result ? archiveFromStored(result) : null);
		};
	});
};

export const putRecording = async (recording: RecordingArchive) => {
	const database = await openDatabase();
	const transaction = database.transaction(
		[ARCHIVE_STORE_NAME, INDEX_STORE_NAME],
		"readwrite",
	);
	transaction.objectStore(ARCHIVE_STORE_NAME).put({
		...recording,
		key: keyForRecording(recording),
	});
	transaction.objectStore(INDEX_STORE_NAME).put(indexFromArchive(recording));
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
