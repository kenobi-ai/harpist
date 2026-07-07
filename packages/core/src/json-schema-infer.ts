import {
	type ContractJsonSchema,
	type ContractJsonSchemaObject,
	isContractJsonSchema,
	type JsonValue,
} from "./json-schema-zod";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const MAX_ANY_OF_SCHEMAS = 8;
const MAX_ARRAY_SCHEMA_SAMPLES = 50;
const MAX_OBJECT_SCHEMA_PROPERTIES = 200;
const MAX_SCHEMA_DEPTH = 8;
const COMPLEX_SCHEMA_MARKER = "schema-complexity-limit";

const complexSchema = (): ContractJsonSchemaObject => ({
	"x-harpist-inference": COMPLEX_SCHEMA_MARKER,
});

const isComplexSchema = (schema: ContractJsonSchema) =>
	schema !== true &&
	schema !== false &&
	schema["x-harpist-inference"] === COMPLEX_SCHEMA_MARKER;

const sampleArrayItems = <T>(items: T[]) => {
	if (items.length <= MAX_ARRAY_SCHEMA_SAMPLES) {
		return items;
	}
	const sampled: T[] = [];
	const step = (items.length - 1) / (MAX_ARRAY_SCHEMA_SAMPLES - 1);
	for (let index = 0; index < MAX_ARRAY_SCHEMA_SAMPLES; index++) {
		const item = items[Math.round(index * step)];
		if (item !== undefined) {
			sampled.push(item);
		}
	}
	return sampled;
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

const schemaAlternatives = (
	schema: ContractJsonSchema,
	seen = new Set<string>(),
): ContractJsonSchema[] => {
	if (schema === true || schema === false || isComplexSchema(schema)) {
		return [schema];
	}
	const key = schemaKey(schema);
	if (seen.has(key)) {
		return [];
	}
	seen.add(key);
	const anyOf = schemasFromKeyword(schema.anyOf);
	if (anyOf.length === 0) {
		return [schema];
	}
	return anyOf.flatMap((item) => schemaAlternatives(item, seen));
};

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

const schemaKey = (schema: ContractJsonSchema) => JSON.stringify(schema);

const uniqueSchemas = (schemas: ContractJsonSchema[]) => {
	const seen = new Set<string>();
	const next: ContractJsonSchema[] = [];
	for (const schema of schemas) {
		const key = schemaKey(schema);
		if (!seen.has(key)) {
			seen.add(key);
			next.push(schema);
		}
	}
	return next;
};

export const mergeJsonSchemas = (
	left: ContractJsonSchema,
	right: ContractJsonSchema,
): ContractJsonSchema => {
	if (isComplexSchema(left) || isComplexSchema(right)) {
		return complexSchema();
	}
	if (left === true) {
		return right;
	}
	if (right === true) {
		return left;
	}
	if (left === false || right === false) {
		return false;
	}
	const leftTypes = schemaTypes(left);
	const rightTypes = schemaTypes(right);
	if (
		leftTypes.length === 1 &&
		rightTypes.length === 1 &&
		leftTypes[0] === "object" &&
		rightTypes[0] === "object"
	) {
		const leftProperties = objectProperties(left);
		const rightProperties = objectProperties(right);
		const properties: Record<string, ContractJsonSchema> = {};
		for (const name of new Set([
			...Object.keys(leftProperties),
			...Object.keys(rightProperties),
		])) {
			const leftProperty = leftProperties[name];
			const rightProperty = rightProperties[name];
			if (
				isContractJsonSchema(leftProperty) &&
				isContractJsonSchema(rightProperty)
			) {
				properties[name] = mergeJsonSchemas(leftProperty, rightProperty);
			} else if (isContractJsonSchema(leftProperty)) {
				properties[name] = leftProperty;
			} else if (isContractJsonSchema(rightProperty)) {
				properties[name] = rightProperty;
			}
		}
		const leftRequired = requiredProperties(left);
		const rightRequired = requiredProperties(right);
		const required = [...leftRequired].filter((name) =>
			rightRequired.has(name),
		);
		return {
			...left,
			...right,
			properties,
			required,
			type: "object",
		};
	}
	if (
		leftTypes.length === 1 &&
		rightTypes.length === 1 &&
		leftTypes[0] === "array" &&
		rightTypes[0] === "array"
	) {
		const leftItems = isContractJsonSchema(left.items) ? left.items : true;
		const rightItems = isContractJsonSchema(right.items) ? right.items : true;
		return {
			...left,
			...right,
			items: mergeJsonSchemas(leftItems, rightItems),
			type: "array",
		};
	}
	if (schemaKey(left) === schemaKey(right)) {
		return left;
	}
	if (
		leftTypes.includes("number") &&
		rightTypes.includes("integer") &&
		leftTypes.length === 1 &&
		rightTypes.length === 1
	) {
		return left;
	}
	if (
		leftTypes.includes("integer") &&
		rightTypes.includes("number") &&
		leftTypes.length === 1 &&
		rightTypes.length === 1
	) {
		return right;
	}
	const anyOf = uniqueSchemas([
		...schemaAlternatives(left),
		...schemaAlternatives(right),
	]);
	if (anyOf.length > MAX_ANY_OF_SCHEMAS) {
		return complexSchema();
	}
	return anyOf.length === 1 ? (anyOf[0] ?? true) : { anyOf };
};

const inferJsonSchemaValue = (
	value: JsonValue,
	depth: number,
): ContractJsonSchema => {
	if (depth > MAX_SCHEMA_DEPTH) {
		return complexSchema();
	}
	if (value === null) {
		return { type: "null" };
	}
	if (typeof value === "boolean") {
		return { type: "boolean" };
	}
	if (typeof value === "number") {
		return { type: Number.isInteger(value) ? "integer" : "number" };
	}
	if (typeof value === "string") {
		return { type: "string" };
	}
	if (Array.isArray(value)) {
		const itemSchemas = sampleArrayItems(value).map((item) =>
			inferJsonSchemaValue(item, depth + 1),
		);
		const items = itemSchemas.reduce<ContractJsonSchema | undefined>(
			(merged, schema) => (merged ? mergeJsonSchemas(merged, schema) : schema),
			undefined,
		);
		return {
			items: items ?? true,
			type: "array",
		};
	}
	const properties = Object.fromEntries(
		Object.entries(value)
			.slice(0, MAX_OBJECT_SCHEMA_PROPERTIES)
			.map(([name, item]) => [name, inferJsonSchemaValue(item, depth + 1)]),
	);
	return {
		...(Object.keys(value).length > MAX_OBJECT_SCHEMA_PROPERTIES
			? { additionalProperties: true }
			: {}),
		properties,
		required: Object.keys(properties),
		type: "object",
	};
};

export const inferJsonSchema = (value: JsonValue): ContractJsonSchema =>
	inferJsonSchemaValue(value, 0);
