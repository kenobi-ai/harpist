const BRIDGE_API_VERSION = "0.1.0";
export const DEFAULT_AGENT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export type BridgeStartedBy = "agent" | "user";

export type BridgeHealthSnapshot = {
	bridgeUrl: string;
	dataDir: string;
	idleForMs: number;
	idleTimeoutMs?: number;
	lastActivityAt: string;
	name: "harpist-bridge";
	ok: true;
	pid: number;
	startedAt: string;
	startedBy: BridgeStartedBy;
	time: string;
	uptimeMs: number;
	version: string;
};

export type BridgeServeOptions = {
	idleTimeoutMs?: number;
	startedBy: BridgeStartedBy;
};

export type BridgeRuntime = {
	dispose: () => void;
	health: () => BridgeHealthSnapshot;
	touch: () => void;
};

const durationUnits = {
	h: 60 * 60 * 1000,
	m: 60 * 1000,
	ms: 1,
	s: 1000,
} as const;

export const parseDurationMs = (value: string) => {
	const match = value.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
	if (!match) {
		throw new Error(
			`Invalid duration '${value}'. Use values like 30s, 15m, or 1h.`,
		);
	}
	const amount = Number(match[1]);
	const unit = (match[2] ?? "ms") as keyof typeof durationUnits;
	const durationMs = Math.round(amount * durationUnits[unit]);
	if (!Number.isFinite(durationMs) || durationMs <= 0) {
		throw new Error(`Invalid duration '${value}'. Duration must be positive.`);
	}
	return durationMs;
};

export const parseBridgeServeOptions = (args: string[]): BridgeServeOptions => {
	let agent = false;
	let idleTimeoutRaw: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--agent") {
			agent = true;
			continue;
		}
		if (arg === "--idle-timeout") {
			const value = args[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error("Missing value for --idle-timeout.");
			}
			idleTimeoutRaw = value;
			index += 1;
			continue;
		}
		if (arg?.startsWith("--idle-timeout=")) {
			idleTimeoutRaw = arg.slice("--idle-timeout=".length);
			continue;
		}
		throw new Error(`Unknown bridge option '${arg}'.`);
	}

	return {
		idleTimeoutMs: idleTimeoutRaw
			? parseDurationMs(idleTimeoutRaw)
			: agent
				? DEFAULT_AGENT_IDLE_TIMEOUT_MS
				: undefined,
		startedBy: agent ? "agent" : "user",
	};
};

export const formatDurationMs = (durationMs: number) => {
	if (durationMs % durationUnits.h === 0) {
		return `${durationMs / durationUnits.h}h`;
	}
	if (durationMs % durationUnits.m === 0) {
		return `${durationMs / durationUnits.m}m`;
	}
	if (durationMs % durationUnits.s === 0) {
		return `${durationMs / durationUnits.s}s`;
	}
	return `${durationMs}ms`;
};

/**
 * Paths whose traffic must not reset the bridge idle timer. The extension
 * polls these in the background (command pulls, wake pings); counting them
 * as activity would keep agent-started bridges alive past --idle-timeout.
 */
const maintenancePathPattern = /^(?:\/rpc)?\/commands(?:\/|$)|^\/wake$/;

export const isMaintenanceRequestPath = (pathname: string) =>
	maintenancePathPattern.test(pathname);

export const createBridgeRuntime = (options: {
	bridgeUrl: string;
	dataDir: string;
	idleTimeoutMs?: number;
	now?: () => Date;
	onIdle?: () => void;
	pid?: number;
	startedBy: BridgeStartedBy;
}): BridgeRuntime => {
	const now = options.now ?? (() => new Date());
	const startedAt = now();
	let lastActivityAt = startedAt;
	let timeout: ReturnType<typeof setTimeout> | undefined;

	const clearIdleTimer = () => {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
	};

	const scheduleIdleTimer = () => {
		clearIdleTimer();
		const idleTimeoutMs = options.idleTimeoutMs;
		if (!idleTimeoutMs || !options.onIdle) {
			return;
		}
		timeout = setTimeout(() => {
			const idleForMs = now().getTime() - lastActivityAt.getTime();
			if (idleForMs >= idleTimeoutMs) {
				options.onIdle?.();
				return;
			}
			scheduleIdleTimer();
		}, options.idleTimeoutMs);
		timeout.unref?.();
	};

	const touch = () => {
		lastActivityAt = now();
		scheduleIdleTimer();
	};

	scheduleIdleTimer();

	return {
		dispose: clearIdleTimer,
		health: () => {
			const current = now();
			return {
				bridgeUrl: options.bridgeUrl,
				dataDir: options.dataDir,
				idleForMs: Math.max(0, current.getTime() - lastActivityAt.getTime()),
				idleTimeoutMs: options.idleTimeoutMs,
				lastActivityAt: lastActivityAt.toISOString(),
				name: "harpist-bridge",
				ok: true,
				pid: options.pid ?? process.pid,
				startedAt: startedAt.toISOString(),
				startedBy: options.startedBy,
				time: current.toISOString(),
				uptimeMs: Math.max(0, current.getTime() - startedAt.getTime()),
				version: BRIDGE_API_VERSION,
			};
		},
		touch,
	};
};
