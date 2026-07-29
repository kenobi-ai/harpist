import {
	chmod,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type BridgeCommand = {
	claimedAt?: string;
	claimedBy?: string;
	completedAt?: string;
	createdAt: string;
	error?: string;
	expiresAt: string;
	id: string;
	kind: "capture-auth";
	payload: {
		host: string;
		loginUrl: string;
	};
	status: "claimed" | "done" | "expired" | "failed" | "pending";
};

type CommandQueueFile = {
	commands: BridgeCommand[];
};

const DEFAULT_TTL_MS = 2 * 60 * 1000;
const MAX_STORED_COMMANDS = 20;

const isMissing = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	(error as { code?: string }).code === "ENOENT";

const commandId = () =>
	`cmd_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

const expireStale = (commands: BridgeCommand[], now: string) =>
	commands.map((command) =>
		command.status === "pending" && command.expiresAt.localeCompare(now) <= 0
			? {
					...command,
					status: "expired" as const,
				}
			: command,
	);

/**
 * A tiny multi-process work queue in the data dir. The CLI enqueues
 * browser-facing commands, the extension claims them through the bridge.
 * Writes go through a temp-file rename so concurrent readers never see a
 * torn file; the traffic is a handful of commands, not a job system.
 */
export const createCommandQueue = (dataDir: string) => {
	const file = join(dataDir, "commands.json");

	const read = async (): Promise<CommandQueueFile> => {
		try {
			return JSON.parse(await readFile(file, "utf8")) as CommandQueueFile;
		} catch (error) {
			if (isMissing(error)) {
				return { commands: [] };
			}
			throw error;
		}
	};

	const write = async (queue: CommandQueueFile) => {
		await mkdir(dirname(file), { mode: 0o700, recursive: true });
		const temporaryFile = join(
			dirname(file),
			`.${basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`,
		);
		try {
			await writeFile(temporaryFile, `${JSON.stringify(queue, null, 2)}\n`, {
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

	const mutate = async (
		change: (commands: BridgeCommand[], now: string) => BridgeCommand[],
	) => {
		const now = new Date().toISOString();
		const queue = await read();
		const commands = change(expireStale(queue.commands, now), now).slice(
			-MAX_STORED_COMMANDS,
		);
		await write({ commands });
		return commands;
	};

	const requireCommand = (commands: BridgeCommand[], id: string) => {
		const command = commands.find((item) => item.id === id);
		if (!command) {
			throw new Error(`Unknown command '${id}'.`);
		}
		return command;
	};

	return {
		complete: async (id: string, error?: string) => {
			const commands = await mutate((current, now) => {
				requireCommand(current, id);
				return current.map((command) =>
					command.id === id
						? {
								...command,
								completedAt: now,
								...(error === undefined ? {} : { error }),
								status:
									error === undefined ? ("done" as const) : ("failed" as const),
							}
						: command,
				);
			});
			return requireCommand(commands, id);
		},
		enqueue: async (input: {
			kind: BridgeCommand["kind"];
			payload: BridgeCommand["payload"];
			ttlMs?: number;
		}) => {
			const id = commandId();
			const commands = await mutate((current, now) => [
				...current,
				{
					createdAt: now,
					expiresAt: new Date(
						Date.parse(now) + (input.ttlMs ?? DEFAULT_TTL_MS),
					).toISOString(),
					id,
					kind: input.kind,
					payload: input.payload,
					status: "pending" as const,
				},
			]);
			return requireCommand(commands, id);
		},
		expire: async (id: string) => {
			const commands = await mutate((current) =>
				current.map((command) =>
					command.id === id && command.status === "pending"
						? {
								...command,
								status: "expired" as const,
							}
						: command,
				),
			);
			return requireCommand(commands, id);
		},
		get: async (id: string) => {
			const queue = await read();
			return (
				expireStale(queue.commands, new Date().toISOString()).find(
					(command) => command.id === id,
				) ?? null
			);
		},
		pull: async (consumerId: string) => {
			const claimedIds = new Set<string>();
			const commands = await mutate((current, now) =>
				current.map((command) => {
					if (command.status !== "pending") {
						return command;
					}
					claimedIds.add(command.id);
					return {
						...command,
						claimedAt: now,
						claimedBy: consumerId,
						status: "claimed" as const,
					};
				}),
			);
			return commands.filter((command) => claimedIds.has(command.id));
		},
	};
};
