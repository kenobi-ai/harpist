import type { CapturedCookie, PendingEntry } from "@harpist/core/har";
import { browser } from "#imports";

type RequestWillBeSent = {
	request: {
		headers?: Record<string, string>;
		method: string;
		postData?: string;
		url: string;
	};
	requestId: string;
	wallTime?: number;
};

type ResponseReceived = {
	requestId: string;
	response: {
		headers?: Record<string, string>;
		mimeType?: string;
		status: number;
		statusText?: string;
	};
};

type RequestWillBeSentExtraInfo = {
	associatedCookies?: Array<{
		cookie?: {
			domain?: string;
			expires?: number;
			httpOnly?: boolean;
			name?: string;
			sameSite?: string;
			secure?: boolean;
			session?: boolean;
			value?: string;
		};
	}>;
	headers?: Record<string, string>;
	requestId: string;
};

type LoadingFinished = {
	encodedDataLength?: number;
	requestId: string;
};

type ResponseBody = {
	base64Encoded?: boolean;
	body?: string;
};

const isMissingResponseBody = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	"code" in error &&
	(error as { code?: unknown }).code === -32_000;

const shouldCaptureResponseBody = (entry: PendingEntry) => {
	const mime = entry.responseMime ?? "";
	if (/(?:json|\+json)/i.test(mime)) {
		return true;
	}
	if (/(?:html|text\/plain)/i.test(mime)) {
		return true;
	}
	return false;
};

export type CaptureState = {
	entryCount: number;
	recording: boolean;
	tabId: number | null;
};

const isoFromWallTime = (wallTime?: number) =>
	wallTime ? new Date(wallTime * 1000).toISOString() : new Date().toISOString();

const contentTypeOf = (
	headers?: Record<string, string>,
): string | undefined => {
	if (!headers) {
		return;
	}
	for (const [name, value] of Object.entries(headers)) {
		if (name.toLowerCase() === "content-type") {
			return value;
		}
	}
};

const mergeHeaders = (
	base?: Record<string, string>,
	extra?: Record<string, string>,
) => ({
	...(base ?? {}),
	...(extra ?? {}),
});

const cookieFromExtraInfo = (
	item: NonNullable<RequestWillBeSentExtraInfo["associatedCookies"]>[number],
): CapturedCookie | null => {
	const cookie = item.cookie;
	if (!cookie?.name) {
		return null;
	}
	return {
		domain: cookie.domain,
		expiresAt:
			typeof cookie.expires === "number" && cookie.expires > 0
				? new Date(cookie.expires * 1000).toISOString()
				: undefined,
		httpOnly: cookie.httpOnly,
		name: cookie.name,
		sameSite: cookie.sameSite,
		secure: cookie.secure,
		session: cookie.session,
		value: cookie.value,
	};
};

const mergeCookies = (
	base?: CapturedCookie[],
	extra?: CapturedCookie[],
): CapturedCookie[] | undefined => {
	const byName = new Map<string, CapturedCookie>();
	for (const cookie of [...(base ?? []), ...(extra ?? [])]) {
		byName.set(cookie.name, {
			...byName.get(cookie.name),
			...cookie,
		});
	}
	return byName.size > 0 ? [...byName.values()] : undefined;
};

export const createCaptureController = () => {
	let session: {
		entries: Map<string, PendingEntry>;
		extraRequestCookies: Map<string, CapturedCookie[]>;
		extraRequestHeaders: Map<string, Record<string, string>>;
		tabId: number;
	} | null = null;
	let registered = false;

	const onRequest = (data: RequestWillBeSent) => {
		if (!session) {
			return;
		}
		const extraHeaders = session.extraRequestHeaders.get(data.requestId);
		const requestHeaders = mergeHeaders(data.request.headers, extraHeaders);
		session.entries.set(data.requestId, {
			method: data.request.method.toUpperCase(),
			postData: data.request.postData,
			postDataMime: contentTypeOf(requestHeaders),
			requestCookies: session.extraRequestCookies.get(data.requestId),
			requestHeaders,
			startedDateTime: isoFromWallTime(data.wallTime),
			url: data.request.url,
		});
	};

	const onRequestExtraInfo = (data: RequestWillBeSentExtraInfo) => {
		if (!session) {
			return;
		}
		const cookies = data.associatedCookies
			?.map(cookieFromExtraInfo)
			.filter((cookie): cookie is CapturedCookie => cookie !== null);
		const entry = session.entries.get(data.requestId);
		if (entry) {
			entry.requestHeaders = mergeHeaders(entry.requestHeaders, data.headers);
			entry.requestCookies = mergeCookies(entry.requestCookies, cookies);
			entry.postDataMime =
				contentTypeOf(entry.requestHeaders) ?? entry.postDataMime;
			return;
		}
		if (data.headers) {
			session.extraRequestHeaders.set(data.requestId, data.headers);
		}
		const mergedCookies = mergeCookies(
			session.extraRequestCookies.get(data.requestId),
			cookies,
		);
		if (mergedCookies) {
			session.extraRequestCookies.set(data.requestId, mergedCookies);
		}
	};

	const onResponse = (data: ResponseReceived) => {
		const entry = session?.entries.get(data.requestId);
		if (!entry) {
			return;
		}
		entry.responseHeaders = data.response.headers ?? {};
		entry.responseMime = data.response.mimeType;
		entry.status = data.response.status;
		entry.statusText = data.response.statusText;
	};

	const onFinished = async (data: LoadingFinished) => {
		if (!session) {
			return;
		}
		const entry = session.entries.get(data.requestId);
		if (!entry || entry.status === undefined) {
			return;
		}
		if (!shouldCaptureResponseBody(entry)) {
			return;
		}
		try {
			const body = (await browser.debugger.sendCommand(
				{
					tabId: session.tabId,
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

	const onDebuggerEvent = (
		source: {
			tabId?: number;
		},
		method: string,
		params?: unknown,
	) => {
		if (!session || source.tabId !== session.tabId || !params) {
			return;
		}
		if (method === "Network.requestWillBeSent") {
			onRequest(params as RequestWillBeSent);
		} else if (method === "Network.requestWillBeSentExtraInfo") {
			onRequestExtraInfo(params as RequestWillBeSentExtraInfo);
		} else if (method === "Network.responseReceived") {
			onResponse(params as ResponseReceived);
		} else if (method === "Network.loadingFinished") {
			void onFinished(params as LoadingFinished);
		}
	};

	const onDebuggerDetach = (source: { tabId?: number }) => {
		if (session && source.tabId === session.tabId) {
			session = null;
		}
	};

	const registerListeners = () => {
		if (registered) {
			return;
		}
		browser.debugger.onEvent.addListener(onDebuggerEvent);
		browser.debugger.onDetach.addListener(onDebuggerDetach);
		registered = true;
	};

	const removeListeners = () => {
		if (!registered) {
			return;
		}
		browser.debugger.onEvent.removeListener(onDebuggerEvent);
		browser.debugger.onDetach.removeListener(onDebuggerDetach);
		registered = false;
	};

	const stop = async (): Promise<PendingEntry[]> => {
		if (!session) {
			return [];
		}
		const { entries, tabId } = session;
		session = null;
		try {
			await browser.debugger.detach({
				tabId,
			});
		} catch (error) {
			console.warn("[harpist] detach failed", error);
		}
		removeListeners();
		return [...entries.values()];
	};

	const start = async (tabId: number) => {
		await stop();
		registerListeners();
		await browser.debugger.attach(
			{
				tabId,
			},
			"1.3",
		);
		await browser.debugger.sendCommand(
			{
				tabId,
			},
			"Network.enable",
		);
		session = {
			entries: new Map(),
			extraRequestCookies: new Map(),
			extraRequestHeaders: new Map(),
			tabId,
		};
	};

	const state = (): CaptureState => ({
		entryCount: session ? session.entries.size : 0,
		recording: session !== null,
		tabId: session?.tabId ?? null,
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
