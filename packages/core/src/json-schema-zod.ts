import { z } from "zod";

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export type ContractJsonSchemaObject = { [key: string]: JsonValue };
export type ContractJsonSchema = boolean | ContractJsonSchemaObject;

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.null(),
		z.boolean(),
		z.number(),
		z.string(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);

export const contractJsonSchemaSchema: z.ZodType<ContractJsonSchema> = z.union([
	z.boolean(),
	z.record(z.string(), jsonValueSchema),
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const isContractJsonSchemaObject = (
	value: unknown,
): value is ContractJsonSchemaObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const isContractJsonSchema = (
	value: unknown,
): value is ContractJsonSchema =>
	typeof value === "boolean" || isContractJsonSchemaObject(value);

const jsonEqual = (left: unknown, right: unknown) =>
	JSON.stringify(left) === JSON.stringify(right);

const literalZod = (value: JsonValue): z.ZodType => {
	if (value === null) {
		return z.null();
	}
	if (typeof value === "string") {
		return z.literal(value);
	}
	if (typeof value === "number") {
		return z.literal(value);
	}
	if (typeof value === "boolean") {
		return z.literal(value);
	}
	return z.custom((candidate) => jsonEqual(candidate, value));
};

const unionZod = (items: z.ZodType[]) => {
	if (items.length === 0) {
		return z.never();
	}
	if (items.length === 1) {
		return items[0] ?? z.never();
	}
	return z.union(items as [z.ZodType, z.ZodType, ...z.ZodType[]]);
};

const schemaTypes = (schema: ContractJsonSchemaObject) => {
	const type = schema.type;
	if (typeof type === "string") {
		return [type];
	}
	if (Array.isArray(type)) {
		return type.filter((item): item is string => typeof item === "string");
	}
	return [];
};

const schemasFromKeyword = (
	value: JsonValue | undefined,
): ContractJsonSchema[] =>
	Array.isArray(value) ? value.filter(isContractJsonSchema) : [];

const objectProperties = (schema: ContractJsonSchemaObject) =>
	isRecord(schema.properties) ? schema.properties : {};

const requiredProperties = (schema: ContractJsonSchemaObject) =>
	new Set(
		Array.isArray(schema.required)
			? schema.required.filter(
					(item): item is string => typeof item === "string",
				)
			: [],
	);

export const jsonSchemaToZod = (schema: ContractJsonSchema): z.ZodType => {
	if (schema === true) {
		return z.unknown();
	}
	if (schema === false) {
		return z.never();
	}
	if ("const" in schema) {
		return literalZod(schema.const);
	}
	if (Array.isArray(schema.enum)) {
		return unionZod(schema.enum.map(literalZod));
	}

	const anyOf = schemasFromKeyword(schema.anyOf);
	if (anyOf.length > 0) {
		return unionZod(anyOf.map(jsonSchemaToZod));
	}
	const oneOf = schemasFromKeyword(schema.oneOf);
	if (oneOf.length > 0) {
		return unionZod(oneOf.map(jsonSchemaToZod));
	}

	const types = schemaTypes(schema);
	if (types.length > 1) {
		return unionZod(
			types.map((type) =>
				jsonSchemaToZod({
					...schema,
					type,
				}),
			),
		);
	}

	switch (types[0]) {
		case "array": {
			const itemSchema = isContractJsonSchema(schema.items)
				? schema.items
				: true;
			return z.array(jsonSchemaToZod(itemSchema));
		}
		case "boolean":
			return z.boolean();
		case "integer":
			return z.number().int();
		case "null":
			return z.null();
		case "number":
			return z.number();
		case "object": {
			const shape: Record<string, z.ZodType> = {};
			const required = requiredProperties(schema);
			for (const [name, value] of Object.entries(objectProperties(schema))) {
				if (isContractJsonSchema(value)) {
					const property = jsonSchemaToZod(value);
					shape[name] = required.has(name) ? property : property.optional();
				}
			}
			const object = z.object(shape);
			if (schema.additionalProperties === false) {
				return object.strict();
			}
			if (isContractJsonSchema(schema.additionalProperties)) {
				return object.catchall(jsonSchemaToZod(schema.additionalProperties));
			}
			return object.passthrough();
		}
		case "string":
			return z.string();
		default:
			return z.unknown();
	}
};

const literal = (value: unknown) => JSON.stringify(value, null, 2);

const propertyNameSource = (name: string) =>
	/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : JSON.stringify(name);

const literalZodSource = (value: JsonValue) => {
	if (value === null) {
		return "z.null()";
	}
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return `z.literal(${literal(value)})`;
	}
	return `z.custom((value) => JSON.stringify(value) === ${literal(JSON.stringify(value))})`;
};

const unionSource = (items: string[]) => {
	if (items.length === 0) {
		return "z.never()";
	}
	if (items.length === 1) {
		return items[0] ?? "z.never()";
	}
	return `z.union([${items.join(", ")}])`;
};

export const jsonSchemaToZodSource = (schema: ContractJsonSchema): string => {
	if (schema === true) {
		return "z.unknown()";
	}
	if (schema === false) {
		return "z.never()";
	}
	if ("const" in schema) {
		return literalZodSource(schema.const);
	}
	if (Array.isArray(schema.enum)) {
		return unionSource(schema.enum.map(literalZodSource));
	}

	const anyOf = schemasFromKeyword(schema.anyOf);
	if (anyOf.length > 0) {
		return unionSource(anyOf.map(jsonSchemaToZodSource));
	}
	const oneOf = schemasFromKeyword(schema.oneOf);
	if (oneOf.length > 0) {
		return unionSource(oneOf.map(jsonSchemaToZodSource));
	}

	const types = schemaTypes(schema);
	if (types.length > 1) {
		return unionSource(
			types.map((type) =>
				jsonSchemaToZodSource({
					...schema,
					type,
				}),
			),
		);
	}

	switch (types[0]) {
		case "array": {
			const itemSchema = isContractJsonSchema(schema.items)
				? schema.items
				: true;
			return `z.array(${jsonSchemaToZodSource(itemSchema)})`;
		}
		case "boolean":
			return "z.boolean()";
		case "integer":
			return "z.number().int()";
		case "null":
			return "z.null()";
		case "number":
			return "z.number()";
		case "object": {
			const required = requiredProperties(schema);
			const properties = Object.entries(objectProperties(schema))
				.filter(([, value]) => isContractJsonSchema(value))
				.map(([name, value]) => {
					const source = jsonSchemaToZodSource(value as ContractJsonSchema);
					return `${propertyNameSource(name)}: ${
						required.has(name) ? source : `${source}.optional()`
					}`;
				});
			const base = `z.object({${properties.length > 0 ? ` ${properties.join(", ")} ` : ""}})`;
			if (schema.additionalProperties === false) {
				return `${base}.strict()`;
			}
			if (isContractJsonSchema(schema.additionalProperties)) {
				return `${base}.catchall(${jsonSchemaToZodSource(schema.additionalProperties)})`;
			}
			return `${base}.passthrough()`;
		}
		case "string":
			return "z.string()";
		default:
			return "z.unknown()";
	}
};
