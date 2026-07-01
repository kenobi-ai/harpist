import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ProfileArtifacts, SiteProfile } from "@harpist/core/profiles";
import {
	createRecordedSiteContractSource,
	recordedSiteContractExportName,
} from "@harpist/core/site-contract";
import type { AnyContractRouter } from "@orpc/contract";
import type { OpenAPI, OpenAPIGeneratorGenerateOptions } from "@orpc/openapi";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

export type SiteArtifactPaths = {
	contractPath: string;
	metadataPath: string;
	openapiPath: string;
};

export type SiteArtifactFiles = {
	contractSource: string;
	metadata: unknown;
	openapi: OpenAPI.Document;
};

export type GeneratedSiteArtifacts = {
	files: SiteArtifactFiles;
	profileArtifacts: ProfileArtifacts;
};

const openApiGenerator = new OpenAPIGenerator({
	schemaConverters: [new ZodToJsonSchemaConverter()],
});

const sha256 = (value: string) =>
	createHash("sha256").update(value).digest("hex");

const stableJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const rewriteContractImports = (source: string) =>
	source
		.replace(
			/from\s+["']@orpc\/contract["']/g,
			`from ${JSON.stringify(import.meta.resolve("@orpc/contract"))}`,
		)
		.replace(
			/from\s+["']zod["']/g,
			`from ${JSON.stringify(import.meta.resolve("zod"))}`,
		);

const importContractSource = async (source: string, exportName: string) => {
	const rewritten = rewriteContractImports(source);
	const directory = await mkdtemp(join(tmpdir(), "harpist-contract-"));
	const file = join(directory, "contract.ts");
	try {
		await writeFile(file, rewritten, "utf8");
		const module = (await import(
			`${pathToFileURL(file).href}?sha=${sha256(rewritten)}`
		)) as Record<string, unknown>;
		const contract = module[exportName];
		if (typeof contract !== "object" || contract === null) {
			throw new Error(`Generated contract did not export '${exportName}'.`);
		}
		return contract as AnyContractRouter;
	} finally {
		await rm(directory, {
			force: true,
			recursive: true,
		});
	}
};

const openApiOptions = (
	profile: SiteProfile,
): OpenAPIGeneratorGenerateOptions => ({
	info: {
		description: `Generated from ${profile.host}'s Harpist contract.ts.`,
		title: `${profile.displayName} API`,
		version: "0.1.0",
	},
});

const buildSiteMetadata = (
	profile: SiteProfile,
	options: {
		contractExport: string;
		contractPath: string;
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
		source: "contract-file",
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
	const contractSource = createRecordedSiteContractSource(profile, {
		source: options.source,
		updatedAt: options.updatedAt,
	});
	const contract = await importContractSource(contractSource, contractExport);
	const generatedOpenApi = await openApiGenerator.generate(
		contract,
		openApiOptions(profile),
	);
	const openapi = {
		...generatedOpenApi,
		"x-harpist": {
			generatedAt: options.updatedAt,
			host: profile.host,
			source: options.source,
			sourceArtifact: "contract.ts",
		},
	} as unknown as OpenAPI.Document;
	const openapiSha256 = sha256(stableJson(openapi));
	const contractSha256 = sha256(contractSource);
	const metadata = buildSiteMetadata(profile, {
		contractExport,
		contractPath: options.paths.contractPath,
		contractSha256,
		openapiPath: options.paths.openapiPath,
		openapiSha256,
		source: options.source,
		updatedAt: options.updatedAt,
	});
	const metadataSha256 = sha256(stableJson(metadata));

	return {
		files: {
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
			contractSha256,
			generatedFrom: "profile",
			metadataPath: options.paths.metadataPath,
			metadataSha256,
			openapiPath: options.paths.openapiPath,
			openapiSha256,
			openapiSource: "contract-file",
			status: options.status ?? "ready",
			updatedAt: options.updatedAt,
		},
	};
};
