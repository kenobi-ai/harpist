export type CapturedCookie = {
	domain?: string;
	expiresAt?: string;
	httpOnly?: boolean;
	name: string;
	sameSite?: string;
	secure?: boolean;
	session?: boolean;
	value?: string;
};

export type PendingEntry = {
	body?: string;
	bodyBase64?: boolean;
	method: string;
	postData?: string;
	postDataMime?: string;
	requestCookies?: CapturedCookie[];
	requestHeaders: Record<string, string>;
	responseHeaders?: Record<string, string>;
	responseMime?: string;
	startedDateTime: string;
	status?: number;
	statusText?: string;
	url: string;
};

type HarHeader = {
	name: string;
	value: string;
};

export type HarArchive = {
	log: {
		creator: {
			name: string;
			version: string;
		};
		entries: unknown[];
		version: string;
	};
};

const toHeaderList = (headers: Record<string, string>): HarHeader[] =>
	Object.entries(headers).map(([name, value]) => ({
		name,
		value,
	}));

const queryFromUrl = (rawUrl: string): HarHeader[] => {
	try {
		return [...new URL(rawUrl).searchParams.entries()].map(([name, value]) => ({
			name,
			value,
		}));
	} catch {
		return [];
	}
};

const buildEntry = (entry: PendingEntry) => ({
	cache: {},
	request: {
		bodySize: entry.postData ? entry.postData.length : 0,
		headers: toHeaderList(entry.requestHeaders),
		headersSize: -1,
		httpVersion: "HTTP/1.1",
		method: entry.method,
		_harpist:
			entry.requestCookies && entry.requestCookies.length > 0
				? {
						requestCookies: entry.requestCookies,
					}
				: undefined,
		postData: entry.postData
			? {
					mimeType: entry.postDataMime ?? "application/octet-stream",
					text: entry.postData,
				}
			: undefined,
		queryString: queryFromUrl(entry.url),
		url: entry.url,
	},
	response: {
		bodySize: entry.body ? entry.body.length : 0,
		content: {
			encoding: entry.bodyBase64 ? "base64" : undefined,
			mimeType: entry.responseMime ?? "application/octet-stream",
			size: entry.body ? entry.body.length : 0,
			text: entry.body,
		},
		headers: toHeaderList(entry.responseHeaders ?? {}),
		headersSize: -1,
		httpVersion: "HTTP/1.1",
		redirectURL: "",
		status: entry.status ?? 0,
		statusText: entry.statusText ?? "",
	},
	startedDateTime: entry.startedDateTime,
	time: 0,
	timings: {
		receive: 0,
		send: 0,
		wait: 0,
	},
});

export const buildHar = (entries: PendingEntry[]): HarArchive => ({
	log: {
		creator: {
			name: "Harpist",
			version: "0.1.0",
		},
		entries: entries
			.filter((entry) => entry.status !== undefined)
			.map(buildEntry),
		version: "1.2",
	},
});

export const hostOfEntries = (entries: PendingEntry[]): string => {
	for (const entry of entries) {
		try {
			return new URL(entry.url).host;
		} catch {
			// Skip malformed captured URLs.
		}
	}
	return "";
};
