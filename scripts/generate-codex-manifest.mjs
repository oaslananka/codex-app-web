import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const docsRoot = path.join(repoRoot, 'codex-official-docs');
const outputPath = path.join(
  repoRoot,
  'src',
  'lib',
  'codex-runtime',
  'official-manifest.generated.ts',
);

const configSchemaCandidates = [
  'generate-json-schema/v2/ConfigReadResponse.json',
  'generate-json-schema/ConfigReadResponse.json',
];

function readText(relativePath) {
  return fs.readFileSync(path.join(docsRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function tryReadText(relativePath) {
  const absolutePath = path.join(docsRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  return fs.readFileSync(absolutePath, 'utf8');
}

function collectMethodsFromSchemaText(relativePath) {
  const content = readText(relativePath);
  const methods = [];
  for (const match of content.matchAll(/"method": "([^"]+)"/g)) {
    methods.push(match[1]);
  }
  return [...new Set(methods)];
}

const SUPPLEMENTAL_REQUEST_METHODS = {
  'collaborationMode/list':
    'Official docs currently expose collaboration mode types but omit the list request in generated ClientRequest schema.',
};

function mergeDescriptions(descriptions) {
  return descriptions.find((value) => typeof value === 'string' && value.trim().length > 0) ?? null;
}

function dedupe(values) {
  return [...new Set(values)];
}

function resolveNode(node, definitions) {
  if (!node || typeof node !== 'object') {
    return [];
  }

  if ('$ref' in node && typeof node.$ref === 'string') {
    const ref = node.$ref.replace('#/definitions/', '');
    const target = definitions[ref];
    return target ? resolveNode(target, definitions) : [];
  }

  if (Array.isArray(node.anyOf)) {
    return node.anyOf.flatMap((item) => resolveNode(item, definitions));
  }

  if (Array.isArray(node.oneOf)) {
    return node.oneOf.flatMap((item) => resolveNode(item, definitions));
  }

  if (Array.isArray(node.allOf)) {
    return node.allOf.flatMap((item) => resolveNode(item, definitions));
  }

  return [node];
}

function summarizeSchema(schema, definitions) {
  const nodes = [schema, ...resolveNode(schema, definitions)];
  const types = [];
  const enumValues = [];
  const descriptions = [];
  let hasObjectShape = false;
  let hasArrayShape = false;

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (typeof node.description === 'string') {
      descriptions.push(node.description);
    }

    if (typeof node.type === 'string') {
      types.push(node.type);
      if (node.type === 'object') hasObjectShape = true;
      if (node.type === 'array') hasArrayShape = true;
    } else if (Array.isArray(node.type)) {
      for (const type of node.type) {
        if (typeof type !== 'string') continue;
        types.push(type);
        if (type === 'object') hasObjectShape = true;
        if (type === 'array') hasArrayShape = true;
      }
    }

    if (Array.isArray(node.enum)) {
      for (const entry of node.enum) {
        if (typeof entry === 'string') enumValues.push(entry);
      }
    }

    if (node.properties && typeof node.properties === 'object') {
      hasObjectShape = true;
    }

    if (node.items) {
      hasArrayShape = true;
    }
  }

  return {
    description: mergeDescriptions(descriptions),
    types: dedupe(types),
    enumValues: dedupe(enumValues),
    hasObjectShape,
    hasArrayShape,
  };
}

function collectObjectProperties(schema, definitions) {
  const nodes = resolveNode(schema, definitions);
  const properties = {};

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (node.properties && typeof node.properties === 'object') {
      Object.assign(properties, node.properties);
    }
  }

  return properties;
}

function flattenConfigSchema(schema, definitions, prefix = '', output = {}) {
  const properties = collectObjectProperties(schema, definitions);

  for (const [key, value] of Object.entries(properties)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const summary = summarizeSchema(value, definitions);
    const descriptionText = summary.description ?? '';
    output[fieldPath] = {
      description: summary.description,
      types: summary.types,
      enumValues: summary.enumValues,
      hasObjectShape: summary.hasObjectShape,
      hasArrayShape: summary.hasArrayShape,
      unstable:
        descriptionText.includes('[UNSTABLE]') ||
        descriptionText.toLowerCase().includes('experimental'),
      deprecated:
        descriptionText.toLowerCase().includes('deprecated') ||
        descriptionText.toLowerCase().includes('legacy'),
    };

    if (summary.hasObjectShape && summary.enumValues.length === 0) {
      flattenConfigSchema(value, definitions, fieldPath, output);
    }
  }

  return output;
}

function readConfigFieldsFromExistingManifest() {
  if (!fs.existsSync(outputPath)) return null;
  const current = fs.readFileSync(outputPath, 'utf8');
  const match = current.match(
    /export const OFFICIAL_CONFIG_FIELD_SCHEMAS = (\{[\s\S]*\}) as const satisfies/,
  );
  if (!match) return null;
  return JSON.parse(match[1]);
}

function loadConfigFields() {
  for (const candidate of configSchemaCandidates) {
    const content = tryReadText(candidate);
    if (!content) continue;
    const configSchema = JSON.parse(content);
    return sortRecordByKey(
      flattenConfigSchema(configSchema.definitions.Config, configSchema.definitions),
    );
  }

  const existing = readConfigFieldsFromExistingManifest();
  if (existing) {
    return existing;
  }

  throw new Error(
    'Unable to load official config schema metadata from codex-official-docs or existing generated manifest.',
  );
}

function sortRecordByKey(record) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}

function formatArray(name, values) {
  return `export const ${name} = ${JSON.stringify(values, null, 2)} as const;`;
}

function buildOutput() {
  const requestMethods = collectMethodsFromSchemaText('generate-ts/ClientRequest.ts');
  const notificationMethods = collectMethodsFromSchemaText('generate-ts/ServerNotification.ts');
  const serverRequestMethods = collectMethodsFromSchemaText('generate-ts/ServerRequest.ts');

  for (const method of Object.keys(SUPPLEMENTAL_REQUEST_METHODS)) {
    if (!requestMethods.includes(method)) {
      requestMethods.push(method);
    }
  }

  const configFields = loadConfigFields();

  return `// GENERATED CODE! DO NOT MODIFY BY HAND!
// Generated by scripts/generate-codex-manifest.mjs

export type OfficialConfigFieldSchema = {
  description: string | null;
  types: string[];
  enumValues: string[];
  hasObjectShape: boolean;
  hasArrayShape: boolean;
  unstable: boolean;
  deprecated: boolean;
};

export const SUPPLEMENTAL_REQUEST_METHODS = ${JSON.stringify(SUPPLEMENTAL_REQUEST_METHODS, null, 2)} as const;

${formatArray('OFFICIAL_REQUEST_METHODS', requestMethods)}

${formatArray('OFFICIAL_NOTIFICATION_METHODS', notificationMethods)}

${formatArray('OFFICIAL_SERVER_REQUEST_METHODS', serverRequestMethods)}

export const OFFICIAL_CONFIG_FIELD_SCHEMAS = ${JSON.stringify(configFields, null, 2)} as const satisfies Record<string, OfficialConfigFieldSchema>;
`;
}

function main() {
  const file = buildOutput();
  const checkOnly = process.argv.includes('--check');

  if (checkOnly) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
    if (current !== file) {
      process.stderr.write(
        'Official Codex manifest is out of date. Run `node scripts/generate-codex-manifest.mjs`.\n',
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write('Official Codex manifest is up to date.\n');
    return;
  }

  fs.writeFileSync(outputPath, file);
  process.stdout.write(
    `Generated official Codex manifest at ${path.relative(repoRoot, outputPath)}\n`,
  );
}

main();
