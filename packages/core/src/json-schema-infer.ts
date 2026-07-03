import {
	type ContractJsonSchema,
	type ContractJsonSchemaObject,
	isContractJsonSchema,
	type JsonValue,
} from "./json-schema-zod";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

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
	const anyOf = uniqueSchemas([
		...schemasFromKeyword(left.anyOf),
		...schemasFromKeyword(right.anyOf),
		left,
		right,
	]);
	return anyOf.length === 1 ? (anyOf[0] ?? true) : { anyOf };
};

export const inferJsonSchema = (value: JsonValue): ContractJsonSchema => {
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
		const itemSchemas = value.map(inferJsonSchema);
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
		Object.entries(value).map(([name, item]) => [name, inferJsonSchema(item)]),
	);
	return {
		properties,
		required: Object.keys(properties),
		type: "object",
	};
};
