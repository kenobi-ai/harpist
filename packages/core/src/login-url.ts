import type { PendingEntry } from "./har";
import { isSessionCookieName } from "./profiles";

const loginPathPattern =
	/(?:^|\/)(?:log.?in|sign.?in|sso|auth(?:enticate|orize)?|session)(?:$|[/?#])/i;

const headerValue = (headers: Record<string, string>, name: string) => {
	const target = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === target) {
			return value;
		}
	}
};

const setCookieNames = (headers: Record<string, string>) =>
	(headerValue(headers, "set-cookie") ?? "")
		.split("\n")
		.map((line) => line.trim().split(";")[0]?.split("=")[0]?.trim())
		.filter((name): name is string => Boolean(name));

const rootDomain = (host: string) => {
	const parts = host.split(".");
	if (parts.length <= 2) {
		return host;
	}
	const last = parts.at(-1);
	const secondLast = parts.at(-2);
	const thirdLast = parts.at(-3);
	if (last && secondLast && thirdLast && secondLast.length <= 3) {
		return `${thirdLast}.${secondLast}.${last}`;
	}
	return parts.slice(-2).join(".");
};

const sameSite = (candidate: string, host: string) => {
	const root = rootDomain(host);
	return candidate === host || candidate.endsWith(`.${root}`);
};

const urlIfSameSite = (rawUrl: string | undefined, host: string) => {
	if (!rawUrl) {
		return;
	}
	try {
		const url = new URL(rawUrl);
		if (
			(url.protocol === "http:" || url.protocol === "https:") &&
			sameSite(url.host, host)
		) {
			return url.toString();
		}
	} catch {}
};

const grantsSessionCookie = (entry: PendingEntry) =>
	setCookieNames(entry.responseHeaders ?? {}).some(isSessionCookieName);

const isHtmlDocument = (entry: PendingEntry) =>
	entry.method.toUpperCase() === "GET" &&
	/html/i.test(entry.responseMime ?? "") &&
	(entry.status ?? 0) < 400;

const pathOf = (rawUrl: string) => {
	try {
		return new URL(rawUrl).pathname;
	} catch {
		return "";
	}
};

export type CaptureAutoStopSignal = {
	grantAt?: string;
	satisfied: boolean;
};

/**
 * Decide whether an automatic login capture has seen enough: a same-site
 * response granted a session cookie, and at least one later same-site
 * request completed 2xx (the post-login page's API calls — exactly what
 * makes the fresh credentials replayable). SSO flows hop domains before
 * the cookie lands, so matching is same-site, not exact-host.
 */
export const captureAutoStopSignal = (
	entries: PendingEntry[],
	host: string,
): CaptureAutoStopSignal => {
	const grantAt = entries
		.filter(
			(entry) => grantsSessionCookie(entry) && urlIfSameSite(entry.url, host),
		)
		.map((entry) => entry.startedDateTime)
		.sort((left, right) => left.localeCompare(right))[0];
	if (!grantAt) {
		return { satisfied: false };
	}
	const satisfied = entries.some(
		(entry) =>
			(entry.status ?? 0) >= 200 &&
			(entry.status ?? 0) < 300 &&
			entry.startedDateTime.localeCompare(grantAt) > 0 &&
			urlIfSameSite(entry.url, host) !== undefined,
	);
	return { grantAt, satisfied };
};

/**
 * Infer the page a user signs in on from recorded traffic. Preference order:
 * the referer of the request that was granted a session cookie (the page the
 * login form was submitted from), then any same-site HTML page with a
 * login-looking path, then the granting request's own URL when it is a page.
 */
export const inferLoginUrl = (
	entries: PendingEntry[],
	host: string,
): string | undefined => {
	const granting = entries.filter(grantsSessionCookie);
	for (const entry of granting) {
		const referer = urlIfSameSite(
			headerValue(entry.requestHeaders, "referer"),
			host,
		);
		if (referer) {
			return referer;
		}
	}
	const loginPage = entries.find(
		(entry) =>
			isHtmlDocument(entry) &&
			loginPathPattern.test(pathOf(entry.url)) &&
			urlIfSameSite(entry.url, host),
	);
	if (loginPage) {
		return urlIfSameSite(loginPage.url, host);
	}
	for (const entry of granting) {
		if (isHtmlDocument(entry)) {
			const url = urlIfSameSite(entry.url, host);
			if (url) {
				return url;
			}
		}
	}
	return undefined;
};
