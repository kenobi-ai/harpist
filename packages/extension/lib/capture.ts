import type { CapturedCookie, PendingEntry } from "@harpist/core/har";
import { browser } from "#imports";
import {
	detachCaptureTabs,
	drainCaptureBodyReads,
	safeDetachCaptureTab,
} from "./capture-cleanup";
import {
	type CaptureControllerOptions,
	type CaptureSession,
	contentTypeOf,
	cookieFromExtraInfo,
	isMissingResponseBody,
	isoFromWallTime,
	type LoadingFinished,
	mergeCookies,
	mergeHeaders,
	type RequestWillBeSent,
	type RequestWillBeSentExtraInfo,
	type ResponseBody,
	type ResponseReceived,
	requestKey,
	shouldCaptureResponseBody,
	type UnexpectedCaptureStop,
} from "./capture-network";

export type { UnexpectedCaptureStop } from "./capture-network";

export type CaptureState = {
	entryCount: number;
	recording: boolean;
	tabCount: number;
	tabId: number | null;
};

export const createCaptureController = (
	options: CaptureControllerOptions = {},
) => {
	let session: CaptureSession | null = null;
	let registered = false;

	const onRequest = (tabId: number, data: RequestWillBeSent) => {
		const active = session;
		if (!active?.tabIds.has(tabId)) {
			return;
		}
		const key = requestKey(tabId, data.requestId);
		const extraHeaders = active.extraRequestHeaders.get(key);
		const requestHeaders = mergeHeaders(data.request.headers, extraHeaders);
		active.entries.set(key, {
			method: data.request.method.toUpperCase(),
			postData: data.request.postData,
			postDataMime: contentTypeOf(requestHeaders),
			requestCookies: active.extraRequestCookies.get(key),
			requestHeaders,
			startedDateTime: isoFromWallTime(data.wallTime),
			url: data.request.url,
		});
	};

	const onRequestExtraInfo = (
		tabId: number,
		data: RequestWillBeSentExtraInfo,
	) => {
		const active = session;
		if (!active?.tabIds.has(tabId)) {
			return;
		}
		const key = requestKey(tabId, data.requestId);
		const cookies = data.associatedCookies
			?.map(cookieFromExtraInfo)
			.filter((cookie): cookie is CapturedCookie => cookie !== null);
		const entry = active.entries.get(key);
		if (entry) {
			entry.requestHeaders = mergeHeaders(entry.requestHeaders, data.headers);
			entry.requestCookies = mergeCookies(entry.requestCookies, cookies);
			entry.postDataMime =
				contentTypeOf(entry.requestHeaders) ?? entry.postDataMime;
			return;
		}
		if (data.headers) {
			active.extraRequestHeaders.set(key, data.headers);
		}
		const mergedCookies = mergeCookies(
			active.extraRequestCookies.get(key),
			cookies,
		);
		if (mergedCookies) {
			active.extraRequestCookies.set(key, mergedCookies);
		}
	};

	const onResponse = (tabId: number, data: ResponseReceived) => {
		const entry = session?.entries.get(requestKey(tabId, data.requestId));
		if (!entry) {
			return;
		}
		entry.responseHeaders = data.response.headers ?? {};
		entry.responseMime = data.response.mimeType;
		entry.status = data.response.status;
		entry.statusText = data.response.statusText;
	};

	const captureResponseBody = async (
		active: CaptureSession,
		tabId: number,
		data: LoadingFinished,
	) => {
		const entry = active.entries.get(requestKey(tabId, data.requestId));
		if (!entry || entry.status === undefined) {
			return;
		}
		if (!shouldCaptureResponseBody(entry)) {
			return;
		}
		try {
			const body = (await browser.debugger.sendCommand(
				{
					tabId,
				},
				"Network.getResponseBody",
				{
					requestId: data.requestId,
				},
			)) as ResponseBody;
			entry.body = body.body;
			entry.bodyBase64 = body.base64Encoded;
		} catch (error) {
			if (isMissingResponseBody(error)) {
				return;
			}
			console.warn("[harpist] getResponseBody failed", error);
		}
	};

	const onFinished = (tabId: number, data: LoadingFinished) => {
		const active = session;
		if (!active?.tabIds.has(tabId)) {
			return;
		}
		let task: Promise<void>;
		task = captureResponseBody(active, tabId, data).finally(() => {
			active.pendingBodyReads.delete(task);
		});
		active.pendingBodyReads.add(task);
	};

	const onDebuggerEvent = (
		source: {
			tabId?: number;
		},
		method: string,
		params?: unknown,
	) => {
		const tabId = source.tabId;
		if (
			!session ||
			tabId === undefined ||
			!session.tabIds.has(tabId) ||
			!params
		) {
			return;
		}
		if (method === "Network.requestWillBeSent") {
			onRequest(tabId, params as RequestWillBeSent);
		} else if (method === "Network.requestWillBeSentExtraInfo") {
			onRequestExtraInfo(tabId, params as RequestWillBeSentExtraInfo);
		} else if (method === "Network.responseReceived") {
			onResponse(tabId, params as ResponseReceived);
		} else if (method === "Network.loadingFinished") {
			onFinished(tabId, params as LoadingFinished);
		}
	};

	const removeListeners = () => {
		if (!registered) {
			return;
		}
		browser.debugger.onEvent.removeListener(onDebuggerEvent);
		browser.debugger.onDetach.removeListener(onDebuggerDetach);
		browser.tabs.onCreated.removeListener(onTabCreated);
		registered = false;
	};

	const finishUnexpectedly = (
		active: CaptureSession,
		reason: UnexpectedCaptureStop["reason"],
	) => {
		if (session !== active) {
			return;
		}
		session = null;
		removeListeners();
		void (async () => {
			await Promise.allSettled(active.pendingAttachments.values());
			await drainCaptureBodyReads(active);
			await detachCaptureTabs(active.tabIds);
			const result: UnexpectedCaptureStop = {
				entries: [...active.entries.values()],
				reason,
				rootTabId: active.rootTabId,
			};
			await options.onUnexpectedStop?.(result);
		})().catch((error) =>
			console.error("[harpist] unexpected stop handling failed", error),
		);
	};

	const onDebuggerDetach = (source: { tabId?: number }, reason: string) => {
		const active = session;
		const tabId = source.tabId;
		if (
			!active ||
			tabId === undefined ||
			!(active.tabIds.has(tabId) || active.pendingAttachments.has(tabId))
		) {
			return;
		}
		active.tabIds.delete(tabId);
		if (tabId === active.rootTabId || active.tabIds.size === 0) {
			finishUnexpectedly(
				active,
				reason === "canceled_by_user" || reason === "target_closed"
					? reason
					: "unknown",
			);
		}
	};

	const attachTab = (tabId: number) => {
		const active = session;
		if (
			!active ||
			active.tabIds.has(tabId) ||
			active.pendingAttachments.has(tabId)
		) {
			return Promise.resolve();
		}
		const attachment = (async () => {
			try {
				await browser.debugger.attach({ tabId }, "1.3");
				if (session !== active) {
					await safeDetachCaptureTab(tabId);
					return;
				}
				active.tabIds.add(tabId);
				await browser.debugger.sendCommand({ tabId }, "Network.enable");
				if (session !== active) {
					active.tabIds.delete(tabId);
					await safeDetachCaptureTab(tabId);
				}
			} catch (error) {
				active.tabIds.delete(tabId);
				if (tabId === active.rootTabId) {
					throw error;
				}
				await safeDetachCaptureTab(tabId);
				console.warn("[harpist] child tab attach failed", error);
			} finally {
				active.pendingAttachments.delete(tabId);
			}
		})();
		active.pendingAttachments.set(tabId, attachment);
		return attachment;
	};

	const onTabCreated = (tab: { id?: number; openerTabId?: number }) => {
		const active = session;
		if (
			!active ||
			tab.id === undefined ||
			tab.openerTabId === undefined ||
			!(
				active.tabIds.has(tab.openerTabId) ||
				active.pendingAttachments.has(tab.openerTabId)
			)
		) {
			return;
		}
		void attachTab(tab.id);
	};

	const registerListeners = () => {
		if (registered) {
			return;
		}
		browser.debugger.onEvent.addListener(onDebuggerEvent);
		browser.debugger.onDetach.addListener(onDebuggerDetach);
		browser.tabs.onCreated.addListener(onTabCreated);
		registered = true;
	};

	const stop = async (): Promise<PendingEntry[]> => {
		const active = session;
		if (!active) {
			return [];
		}
		session = null;
		removeListeners();
		await Promise.allSettled(active.pendingAttachments.values());
		await drainCaptureBodyReads(active);
		await detachCaptureTabs(active.tabIds);
		return [...active.entries.values()];
	};

	const start = async (tabId: number) => {
		await stop();
		session = {
			entries: new Map(),
			extraRequestCookies: new Map(),
			extraRequestHeaders: new Map(),
			pendingAttachments: new Map(),
			pendingBodyReads: new Set(),
			rootTabId: tabId,
			tabIds: new Set(),
		};
		registerListeners();
		try {
			await attachTab(tabId);
			if (!session) {
				throw new Error("Recording was canceled before capture started.");
			}
		} catch (error) {
			session = null;
			removeListeners();
			await safeDetachCaptureTab(tabId);
			throw error;
		}
	};

	const state = (): CaptureState => ({
		entryCount: session ? session.entries.size : 0,
		recording: session !== null,
		tabCount: session
			? new Set([...session.tabIds, ...session.pendingAttachments.keys()]).size
			: 0,
		tabId: session?.rootTabId ?? null,
	});

	const entries = (): PendingEntry[] =>
		session ? [...session.entries.values()] : [];

	return {
		entries,
		start,
		state,
		stop,
	};
};
