import type { CapturedCookie, PendingEntry } from "@harpist/core/har";

export type CaptureSession = {
	entries: Map<string, PendingEntry>;
	extraRequestCookies: Map<string, CapturedCookie[]>;
	extraRequestHeaders: Map<string, Record<string, string>>;
	pendingAttachments: Map<number, Promise<void>>;
	pendingBodyReads: Set<Promise<void>>;
	rootTabId: number;
	tabIds: Set<number>;
};

export type UnexpectedCaptureStop = {
	entries: PendingEntry[];
	reason: "canceled_by_user" | "target_closed" | "unknown";
	rootTabId: number;
};

export type CaptureControllerOptions = {
	onUnexpectedStop?: (result: UnexpectedCaptureStop) => Promise<void> | void;
};

export const requestKey = (tabId: number, requestId: string) =>
	`${tabId}:${requestId}`;

export type RequestWillBeSent = {
	request: {
		headers?: Record<string, string>;
		method: string;
		postData?: string;
		url: string;
	};
	requestId: string;
	wallTime?: number;
};

export type ResponseReceived = {
	requestId: string;
	response: {
		headers?: Record<string, string>;
		mimeType?: string;
		status: number;
		statusText?: string;
	};
};

export type RequestWillBeSentExtraInfo = {
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

export type LoadingFinished = {
	encodedDataLength?: number;
	requestId: string;
};

export type ResponseBody = {
	base64Encoded?: boolean;
	body?: string;
};

export const isMissingResponseBody = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	"code" in error &&
	(error as { code?: unknown }).code === -32_000;

export const shouldCaptureResponseBody = (entry: PendingEntry) => {
	const mime = entry.responseMime ?? "";
	return /(?:json|\+json|html|text\/plain)/i.test(mime);
};

export const isoFromWallTime = (wallTime?: number) =>
	wallTime ? new Date(wallTime * 1000).toISOString() : new Date().toISOString();

export const contentTypeOf = (
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

export const mergeHeaders = (
	base?: Record<string, string>,
	extra?: Record<string, string>,
) => ({
	...(base ?? {}),
	...(extra ?? {}),
});

export const cookieFromExtraInfo = (
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

export const mergeCookies = (
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
