import type { refineLatestProfile } from "./refine";

export const recordingSummary = (recording: unknown) => {
	if (
		typeof recording !== "object" ||
		recording === null ||
		!("har" in recording)
	) {
		return recording;
	}
	const { har: _har, ...summary } = recording as Record<string, unknown>;
	return summary;
};

export const refineSummary = (
	result: Awaited<ReturnType<typeof refineLatestProfile>>,
) => ({
	artifacts: result.profile.artifacts
		? {
				contract: result.profile.artifacts.contractPath,
				contractProfile: result.profile.artifacts.contractProfilePath,
				openapi: result.profile.artifacts.openapiPath,
				status: result.profile.artifacts.status,
				updatedAt: result.profile.artifacts.updatedAt,
			}
		: undefined,
	docs: result.profile.remoteDocsUrl,
	excludedEndpointCount: result.excludedEndpointCount,
	host: result.host,
	includedEndpointCount: result.includedEndpointCount,
	openapiPathCount: result.openapiPathCount,
	recordingId: result.recordingId,
});
