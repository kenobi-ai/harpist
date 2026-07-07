import type { CredentialValidation } from "./credentials";

const loginRedirectPattern = /(?:log.?in|sign.?in|sso|authenticate)/i;

const loginBodyPattern =
	/(?:type="password"|log.?in|sign.?in|session expired|authenticate)/i;

const isHtmlContentType = (headers: [string, string][]) =>
	headers.some(
		([name, value]) =>
			name.toLowerCase() === "content-type" && /html/i.test(value),
	);

/**
 * Classify a replayed response as evidence about the credentials used.
 * Only conclusive outcomes produce a validation record: 401/403 and
 * login-page redirects invalidate, plain 2xx responses validate, and
 * everything else (server errors, ambiguous HTML) returns null.
 */
export const credentialValidationFromResponse = (
	response: {
		body: string;
		headers: [string, string][];
		status: number;
	},
	options: {
		checkedAt: string;
	},
): CredentialValidation | null => {
	if (response.status === 401 || response.status === 403) {
		return {
			checkedAt: options.checkedAt,
			reason: `Replay returned HTTP ${response.status}.`,
			result: "invalid",
			statusCode: response.status,
		};
	}
	if (response.status >= 300 && response.status < 400) {
		const location = response.headers.find(
			([name]) => name.toLowerCase() === "location",
		)?.[1];
		if (location && loginRedirectPattern.test(location)) {
			return {
				checkedAt: options.checkedAt,
				reason: "Replay redirected to a login page.",
				result: "invalid",
				statusCode: response.status,
			};
		}
		return null;
	}
	if (response.status >= 200 && response.status < 300) {
		if (
			isHtmlContentType(response.headers) &&
			loginBodyPattern.test(response.body)
		) {
			return null;
		}
		return {
			checkedAt: options.checkedAt,
			reason: `Replay returned HTTP ${response.status}.`,
			result: "valid",
			statusCode: response.status,
		};
	}
	return null;
};
