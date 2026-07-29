import { chmod, link, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export type OutputOptions = {
	force: boolean;
	outputPath?: string;
};

type Fail = (message: string) => never;

export const parseOutputOptions = (values: string[], fail: Fail) => {
	const args: string[] = [];
	let force = false;
	let outputPath: string | undefined;
	for (let index = 0; index < values.length; index += 1) {
		const value = values[index] ?? "";
		if (value === "--force") {
			if (force) {
				fail("--force may only be passed once.");
			}
			force = true;
			continue;
		}
		if (value === "--output" || value.startsWith("--output=")) {
			if (outputPath !== undefined) {
				fail("--output may only be passed once.");
			}
			outputPath =
				value === "--output"
					? values[index + 1]?.startsWith("--")
						? fail("Missing value for --output.")
						: (values[index + 1] ?? fail("Missing value for --output."))
					: value.slice("--output=".length);
			if (value === "--output") {
				index += 1;
			}
			if (outputPath === "") {
				fail("Missing value for --output.");
			}
			continue;
		}
		args.push(value);
	}
	if (force && !outputPath) {
		fail("--force requires --output <path>.");
	}
	if (outputPath === "-") {
		fail("Use stdout by omitting --output; '-' is reserved for input.");
	}
	return {
		args,
		output: {
			force,
			outputPath,
		} satisfies OutputOptions,
	};
};

const isAlreadyExists = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	(error as { code?: unknown }).code === "EEXIST";

export const writeCliOutput = async (
	value: string,
	options: OutputOptions,
	format: "json" | "text",
	fail: Fail,
) => {
	if (!options.outputPath) {
		console.log(value.endsWith("\n") ? value.slice(0, -1) : value);
		return;
	}
	const outputPath = resolve(options.outputPath);
	await mkdir(dirname(outputPath), { recursive: true });
	const content = value.endsWith("\n") ? value : `${value}\n`;
	const temporaryFile = join(
		dirname(outputPath),
		`.${basename(outputPath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
	);
	try {
		await writeFile(temporaryFile, content, {
			encoding: "utf8",
			mode: 0o600,
		});
		if (options.force) {
			await rename(temporaryFile, outputPath);
		} else {
			await link(temporaryFile, outputPath);
			await rm(temporaryFile, { force: true });
		}
		await chmod(outputPath, 0o600);
	} catch (error) {
		await rm(temporaryFile, { force: true }).catch(() => undefined);
		if (isAlreadyExists(error)) {
			fail(
				`Refusing to overwrite '${outputPath}'. Pass --force to replace it.`,
			);
		}
		throw error;
	}
	console.log(
		JSON.stringify(
			{
				bytes: Buffer.byteLength(content),
				format,
				output: outputPath,
			},
			null,
			2,
		),
	);
};

export const writeJsonOutput = (
	value: unknown,
	options: OutputOptions,
	fail: Fail,
) => writeCliOutput(JSON.stringify(value, null, 2), options, "json", fail);
