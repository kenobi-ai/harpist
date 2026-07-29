import type { ReplayBundle } from "./replay";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const methodRequiresConfirmation = (method: string) =>
	!safeMethods.has(method.toUpperCase());

export const replayRequiresConfirmation = (bundle: ReplayBundle) =>
	methodRequiresConfirmation(bundle.method);
