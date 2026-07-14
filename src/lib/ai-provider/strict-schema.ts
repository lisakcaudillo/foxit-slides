// Strict-schema transformer for OpenAI Structured Outputs.
//
// The canonical provider format (ai-provider/types.ts) uses Anthropic's tool
// shape: each tool carries a JSON-Schema `input_schema`. OpenAI Structured
// Outputs (`response_format`/function `strict: true`) accepts only a RESTRICTED
// JSON-Schema dialect. This module converts an Anthropic `input_schema` into a
// strict-mode-compatible schema, and — when a schema cannot be expressed in
// strict mode — reports that so the provider can fall back to non-strict
// function calling instead of erroring.
//
// OpenAI strict-mode rules enforced here:
//   1. Every object MUST set `additionalProperties: false`.
//   2. Every property MUST be listed in `required` (no optional keys). Originally
//      optional properties are kept required but made nullable (`type: [..,'null']`),
//      and the provider strips the resulting nulls from the response so Zod's
//      `.optional()` (which accepts `undefined`, NOT `null`) still validates.
//   3. Open-ended maps (`additionalProperties: { ... }`) are NOT representable —
//      strict mode requires every key enumerated. Such schemas are flagged
//      `strict: false` and sent as-is via non-strict function calling.
//   4. Unsupported validation keywords (minLength, pattern, minimum, …) are
//      stripped; the model is guided by `description` instead.
//   5. Untyped leaves (a property with only a `description`) are invalid in
//      strict mode — they throw here so the source schema gets a real type.

type JSONSchema = Record<string, unknown>;

// JSON-Schema keywords OpenAI strict mode does not accept on a node. They are
// dropped during transformation (the value is conveyed via `description`).
const UNSUPPORTED_KEYWORDS = new Set([
  'minLength', 'maxLength', 'pattern', 'format',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minItems', 'maxItems', 'uniqueItems',
  'minProperties', 'maxProperties',
  'default', 'examples', 'patternProperties',
]);

/** True if a node is a plain JSON-Schema object (record), not an array/primitive. */
function isSchema(node: unknown): node is JSONSchema {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

/**
 * Detect whether a schema can be expressed in OpenAI strict mode at all.
 * Disqualifiers (either one forces a non-strict fallback for the whole tool):
 *   - an open-ended map: `additionalProperties` set to a schema (not `false`) —
 *     strict mode cannot represent arbitrary keys; and
 *   - an untyped leaf: a property with neither `type` nor `enum`/`anyOf` —
 *     strict mode requires a concrete type. (toStrictSchema would otherwise
 *     throw on these; detecting here lets the provider degrade gracefully.)
 */
export function isStrictRepresentable(schema: JSONSchema): boolean {
  let ok = true;
  const walk = (node: unknown): void => {
    if (!ok || !isSchema(node)) return;

    if ('additionalProperties' in node && isSchema(node.additionalProperties)) {
      ok = false;
      return;
    }

    const hasObject = node.type === 'object' || isSchema(node.properties);
    const hasArray = node.type === 'array' || 'items' in node;
    const hasCombinator =
      Array.isArray(node.anyOf) || Array.isArray(node.oneOf) || Array.isArray(node.allOf);
    const hasType = 'type' in node || Array.isArray(node.enum) || 'const' in node;

    if (!hasObject && !hasArray && !hasCombinator && !hasType) {
      ok = false; // untyped leaf
      return;
    }

    if (isSchema(node.properties)) {
      for (const child of Object.values(node.properties)) walk(child);
    }
    if (isSchema(node.items)) walk(node.items);
    if (Array.isArray(node.items)) node.items.forEach(walk);
    for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
      if (Array.isArray(node[key])) (node[key] as unknown[]).forEach(walk);
    }
  };
  walk(schema);
  return ok;
}

/** Copy a leaf node, dropping keywords OpenAI strict mode rejects. */
function cleanLeaf(schema: JSONSchema): JSONSchema {
  const out: JSONSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Make an already-transformed child schema accept `null` (for optional keys). */
function makeNullable(child: JSONSchema): JSONSchema {
  if (Array.isArray(child.anyOf)) {
    const branches = child.anyOf as JSONSchema[];
    if (!branches.some((b) => b.type === 'null')) branches.push({ type: 'null' });
    return child;
  }
  // enum (with or without a sibling type): wrap so `null` is a valid alternative
  // without having to inject null into the enum value list.
  if (Array.isArray(child.enum)) {
    return { anyOf: [child, { type: 'null' }] };
  }
  if (typeof child.type === 'string') {
    return { ...child, type: [child.type, 'null'] };
  }
  if (Array.isArray(child.type)) {
    if (!child.type.includes('null')) child.type = [...child.type, 'null'];
    return child;
  }
  return { anyOf: [child, { type: 'null' }] };
}

/**
 * Convert an Anthropic `input_schema` into an OpenAI strict-mode schema.
 * Throws on an untyped leaf (which strict mode cannot accept) so the offending
 * source schema is fixed rather than silently mis-sent.
 *
 * Call `isStrictRepresentable` first; only transform schemas that pass.
 */
export function toStrictSchema(schema: JSONSchema, path = '$'): JSONSchema {
  // Combinators: transform each branch.
  for (const key of ['anyOf', 'oneOf'] as const) {
    if (Array.isArray(schema[key])) {
      const branches = (schema[key] as JSONSchema[]).map((s, i) =>
        toStrictSchema(s, `${path}.${key}[${i}]`),
      );
      const rest = cleanLeaf(schema);
      delete rest.anyOf;
      delete rest.oneOf;
      return { ...rest, anyOf: branches };
    }
  }

  const type = schema.type;

  // Object: force additionalProperties:false and promote every property to required.
  if (type === 'object' || isSchema(schema.properties)) {
    const props = isSchema(schema.properties) ? schema.properties : {};
    const originalRequired = new Set(
      Array.isArray(schema.required) ? (schema.required as string[]) : [],
    );
    const newProps: JSONSchema = {};
    const required: string[] = [];
    for (const propKey of Object.keys(props)) {
      let child = toStrictSchema(props[propKey] as JSONSchema, `${path}.${propKey}`);
      if (!originalRequired.has(propKey)) child = makeNullable(child);
      newProps[propKey] = child;
      required.push(propKey);
    }
    const out: JSONSchema = {
      type: 'object',
      properties: newProps,
      required,
      additionalProperties: false,
    };
    if (typeof schema.description === 'string') out.description = schema.description;
    return out;
  }

  // Array: transform items.
  if (type === 'array') {
    const out: JSONSchema = {
      type: 'array',
      items: toStrictSchema((schema.items as JSONSchema) ?? {}, `${path}[]`),
    };
    if (typeof schema.description === 'string') out.description = schema.description;
    return out;
  }

  // Leaf: must declare a type or an enum.
  if (type === undefined && !Array.isArray(schema.enum)) {
    throw new Error(
      `toStrictSchema: untyped property at ${path} — OpenAI strict mode requires ` +
        `an explicit type/enum/anyOf. Give this property a concrete type in its source schema.`,
    );
  }
  return cleanLeaf(schema);
}

/**
 * Recursively delete `null`-valued keys from a parsed tool result. OpenAI strict
 * mode emits optional-but-absent fields as explicit `null` (rule 2); Zod's
 * `.optional()` accepts `undefined`, not `null`, to convert null → absent to
 * preserve the Anthropic-path semantics the callers were written against.
 */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripNulls(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === null) continue;
      out[key] = stripNulls(val);
    }
    return out as unknown as T;
  }
  return value;
}
