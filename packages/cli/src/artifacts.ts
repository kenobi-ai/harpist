import { createHash } from "node:crypto";
import type { ProfileArtifacts, SiteProfile } from "../../core/src/profiles";
import {
	createContractProfileContractSource,
	recordedSiteContractExportName,
} from "../../core/src/site-contract";
import { createOpenApiDocumentFromContractProfile } from "../../core/src/site-contract-openapi";
import {
	CONTRACT_PROFILE_FORMAT,
	type ContractProfile,
	createRecordedSiteContractProfile,
} from "../../core/src/site-contract-profile";

export type SiteArtifactPaths = {
	contractPath: string;
	contractProfilePath: string;
	metadataPath: string;
	openapiPath: string;
};

export type SiteArtifactFiles = {
	contractProfile: ContractProfile;
	contractSource: string;
	metadata: unknown;
	openapi: unknown;
};

export type GeneratedSiteArtifacts = {
	files: SiteArtifactFiles;
	profileArtifacts: ProfileArtifacts;
};

const sha256 = (value: string) =>
	createHash("sha256").update(value).digest("hex");

const stableJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const buildSiteMetadata = (
	profile: SiteProfile,
	options: {
		contractExport: string;
		contractPath: string;
		contractProfilePath: string;
		contractProfileSha256: string;
		contractSha256: string;
		openapiPath: string;
		openapiSha256: string;
		source: string;
		updatedAt: string;
	},
) => ({
	auth: profile.auth,
	authBundle: profile.authBundle,
	authRuntime: {
		bindsCredentialValues: false,
		replay: "auth.replay",
		source: "profile.latestAuth",
	},
	contract: {
		exportName: options.contractExport,
		format: "orpc-typescript-source",
		path: options.contractPath,
		sha256: options.contractSha256,
		source: "contract-profile",
	},
	contractProfile: {
		format: CONTRACT_PROFILE_FORMAT,
		path: options.contractProfilePath,
		sha256: options.contractProfileSha256,
		source: "profile",
	},
	displayName: profile.displayName,
	endpoints: profile.endpoints.map((endpoint) => ({
		access: endpoint.access,
		description: endpoint.description,
		exactKey: endpoint.exactKey,
		host: endpoint.host,
		included: endpoint.included !== false,
		lastSeenAt: endpoint.lastSeenAt,
		method: endpoint.method,
		notes: endpoint.notes,
		operationName: endpoint.operationName,
		path: endpoint.path,
		samples: endpoint.samples,
		statuses: endpoint.statuses,
		tags: endpoint.tags,
		template: endpoint.template,
		templateKey: endpoint.templateKey,
	})),
	generatedAt: options.updatedAt,
	generator: "harpist-cli",
	host: profile.host,
	openapi: {
		path: options.openapiPath,
		sha256: options.openapiSha256,
		source: "contract-profile",
	},
	origin: profile.origin,
	recordings: profile.recordings,
	source: options.source,
	version: 1,
});

export const buildRecordedSiteArtifacts = async (
	profile: SiteProfile,
	options: {
		auth?: string;
		cli?: string;
		paths: SiteArtifactPaths;
		source: string;
		status?: ProfileArtifacts["status"];
		updatedAt: string;
	},
): Promise<GeneratedSiteArtifacts> => {
	const contractExport = recordedSiteContractExportName(profile.host);
	const contractProfile = createRecordedSiteContractProfile(profile, {
		source: options.source,
		updatedAt: options.updatedAt,
	});
	const contractSource = createContractProfileContractSource(contractProfile);
	const openapi = createOpenApiDocumentFromContractProfile(contractProfile, {
		source: options.source,
		updatedAt: options.updatedAt,
	});
	const openapiSha256 = sha256(stableJson(openapi));
	const contractProfileSha256 = sha256(stableJson(contractProfile));
	const contractSha256 = sha256(contractSource);
	const metadata = buildSiteMetadata(profile, {
		contractExport,
		contractPath: options.paths.contractPath,
		contractProfilePath: options.paths.contractProfilePath,
		contractProfileSha256,
		contractSha256,
		openapiPath: options.paths.openapiPath,
		openapiSha256,
		source: options.source,
		updatedAt: options.updatedAt,
	});
	const metadataSha256 = sha256(stableJson(metadata));

	return {
		files: {
			contractProfile,
			contractSource,
			metadata,
			openapi,
		},
		profileArtifacts: {
			auth: options.auth,
			cli: options.cli,
			contractExport,
			contractFormat: "orpc-typescript-source",
			contractPath: options.paths.contractPath,
			contractProfileFormat: CONTRACT_PROFILE_FORMAT,
			contractProfilePath: options.paths.contractProfilePath,
			contractProfileSha256,
			contractSha256,
			generatedFrom: "contract-profile",
			metadataPath: options.paths.metadataPath,
			metadataSha256,
			openapiPath: options.paths.openapiPath,
			openapiSha256,
			openapiSource: "contract-profile",
			status: options.status ?? "ready",
			updatedAt: options.updatedAt,
		},
	};
};
