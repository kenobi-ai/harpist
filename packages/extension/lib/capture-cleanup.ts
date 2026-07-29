import { browser } from "#imports";
import type { CaptureSession } from "./capture-network";

const BODY_READ_DRAIN_MS = 1000;

export const safeDetachCaptureTab = async (tabId: number) => {
	try {
		await browser.debugger.detach({ tabId });
	} catch (error) {
		console.warn("[harpist] detach failed", error);
	}
};

export const detachCaptureTabs = (tabIds: Iterable<number>) =>
	Promise.allSettled([...tabIds].map((tabId) => safeDetachCaptureTab(tabId)));

export const drainCaptureBodyReads = async (session: CaptureSession) => {
	if (session.pendingBodyReads.size === 0) {
		return;
	}
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			Promise.allSettled([...session.pendingBodyReads]),
			new Promise<void>((resolve) => {
				timeout = setTimeout(resolve, BODY_READ_DRAIN_MS);
			}),
		]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
};
