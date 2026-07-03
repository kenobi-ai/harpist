import type { ExtensionDiagnostic } from "@harpist/core/profiles";
import { messageOf } from "@harpist/core/profiles";
import { browser } from "#imports";

const DIAGNOSTICS_KEY = "harpist.diagnostics";

const MAX_DIAGNOSTICS = 30;

const diagnosticId = () =>
	crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

const logToConsole = (entry: ExtensionDiagnostic) => {
	const detail = {
		context: entry.context,
		durationMs: entry.durationMs,
		id: entry.id,
		stack: entry.stack,
	};
	if (entry.level === "error") {
		console.error(`[harpist] ${entry.operation}: ${entry.message}`, detail);
		return;
	}
	if (entry.level === "warn") {
		console.warn(`[harpist] ${entry.operation}: ${entry.message}`, detail);
		return;
	}
	console.info(`[harpist] ${entry.operation}: ${entry.message}`, detail);
};

export const readDiagnostics = async (): Promise<ExtensionDiagnostic[]> => {
	const stored = await browser.storage.local.get(DIAGNOSTICS_KEY);
	return (stored[DIAGNOSTICS_KEY] as ExtensionDiagnostic[] | undefined) ?? [];
};

export const writeDiagnostic = async (
	entry: Omit<ExtensionDiagnostic, "at" | "id"> & {
		at?: string;
		id?: string;
	},
) => {
	const diagnostic: ExtensionDiagnostic = {
		...entry,
		at: entry.at ?? new Date().toISOString(),
		id: entry.id ?? diagnosticId(),
	};
	logToConsole(diagnostic);
	try {
		const diagnostics = await readDiagnostics();
		await browser.storage.local.set({
			[DIAGNOSTICS_KEY]: [diagnostic, ...diagnostics].slice(0, MAX_DIAGNOSTICS),
		});
	} catch (error) {
		console.warn("[harpist] Could not persist diagnostic", error);
	}
	return diagnostic;
};

export const writeErrorDiagnostic = (
	operation: string,
	error: unknown,
	options: {
		context?: ExtensionDiagnostic["context"];
		durationMs?: number;
		level?: ExtensionDiagnostic["level"];
	} = {},
) =>
	writeDiagnostic({
		context: options.context,
		durationMs: options.durationMs,
		level: options.level ?? "error",
		message: messageOf(error),
		operation,
		stack: error instanceof Error ? error.stack : undefined,
	});
