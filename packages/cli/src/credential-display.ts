import {
	type CredentialSet,
	type CredentialSetStatus,
	credentialSetStatus,
} from "../../core/src/credentials";

export const relativeTime = (iso: string, now = Date.now()) => {
	const time = Date.parse(iso);
	if (!Number.isFinite(time)) {
		return iso;
	}
	const diff = time - now;
	const magnitude = Math.abs(diff);
	const unit =
		magnitude < 90_000
			? undefined
			: magnitude < 90 * 60_000
				? (["m", 60_000] as const)
				: magnitude < 36 * 3_600_000
					? (["h", 3_600_000] as const)
					: (["d", 86_400_000] as const);
	if (!unit) {
		return diff <= 0 ? "just now" : "in <2m";
	}
	const amount = `${Math.round(magnitude / unit[1])}${unit[0]}`;
	return diff <= 0 ? `${amount} ago` : `in ${amount}`;
};

export const credentialStatusLabel = (
	set: CredentialSet,
	status: CredentialSetStatus = credentialSetStatus(set),
) => {
	if (status === "invalid") {
		return set.validation?.statusCode
			? `invalid (HTTP ${set.validation.statusCode}, checked ${relativeTime(
					set.validation.checkedAt,
				)})`
			: "invalid";
	}
	if (status === "valid") {
		return set.validation
			? `valid (checked ${relativeTime(set.validation.checkedAt)})`
			: "valid";
	}
	if (status === "expired") {
		return set.expiresAt ? `expired ${relativeTime(set.expiresAt)}` : "expired";
	}
	return set.expiresAt
		? `ready · expires ${relativeTime(set.expiresAt)}`
		: "ready";
};

export const describeCredentialSet = (set: CredentialSet) =>
	`${set.label} · captured ${relativeTime(set.capturedAt)} · ${credentialStatusLabel(set)}`;
