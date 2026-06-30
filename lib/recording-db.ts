import type { RecordingArchive, RecordingsStore } from "./profiles";

const DATABASE_NAME = "harpist-recordings";
const DATABASE_VERSION = 1;
const STORE_NAME = "recordings";

let databasePromise: Promise<IDBDatabase> | null = null;

const openDatabase = () => {
	if (!databasePromise) {
		databasePromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
			request.onupgradeneeded = () => {
				const database = request.result;
				if (!database.objectStoreNames.contains(STORE_NAME)) {
					const store = database.createObjectStore(STORE_NAME, {
						keyPath: "key",
					});
					store.createIndex("syncedAt", "syncedAt", {
						unique: false,
					});
					store.createIndex("host", "host", {
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

const transactionDone = (transaction: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		transaction.onabort = () => reject(transaction.error);
		transaction.onerror = () => reject(transaction.error);
		transaction.oncomplete = () => resolve();
	});

const keyForRecording = (recording: Pick<RecordingArchive, "host" | "id">) =>
	`${recording.host}::${recording.id}`;

type StoredRecordingArchive = RecordingArchive & {
	key: string;
};

export const getRecordings = async (): Promise<RecordingsStore> => {
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const request = database
			.transaction(STORE_NAME, "readonly")
			.objectStore(STORE_NAME)
			.getAll();
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const recordings = request.result as StoredRecordingArchive[];
			resolve(
				Object.fromEntries(
					recordings.map((recording) => {
						const { key, ...archive } = recording;
						return [key, archive];
					}),
				),
			);
		};
	});
};

export const putRecording = async (recording: RecordingArchive) => {
	const database = await openDatabase();
	const transaction = database.transaction(STORE_NAME, "readwrite");
	transaction.objectStore(STORE_NAME).put({
		...recording,
		key: keyForRecording(recording),
	});
	await transactionDone(transaction);
};

export const putRecordings = async (recordings: RecordingsStore) => {
	const database = await openDatabase();
	const transaction = database.transaction(STORE_NAME, "readwrite");
	const store = transaction.objectStore(STORE_NAME);
	for (const recording of Object.values(recordings)) {
		store.put({
			...recording,
			key: keyForRecording(recording),
		});
	}
	await transactionDone(transaction);
};
