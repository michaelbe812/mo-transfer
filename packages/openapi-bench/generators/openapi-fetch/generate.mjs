// Generiert die Typen aus beiden Specs (3.0 → client/schema.ts, 3.1 → client-31/schema.ts).
// Node-API statt CLI, weil nur die Node-API `transform` kennt (dokumentiertes Rezept „Blob types“:
// format: binary → Blob statt string). Alle übrigen Optionen entsprechen den CLI-Flags.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import openapiTS, { astToString } from 'openapi-typescript';

// ts.factory aus DERSELBEN typescript-Instanz wie openapi-typescript (5.9), nicht die Repo-TS-6.
const requireFromOpenapiTs = createRequire(createRequire(import.meta.url).resolve('openapi-typescript'));
const ts = requireFromOpenapiTs('typescript');

const BLOB = ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('Blob'));

/** @type {import('openapi-typescript').OpenAPITSOptions} */
const options = {
  readWriteMarkers: true, // $Read/$Write → openapi-fetch Readable/Writable (readOnly nicht im Request, writeOnly nicht in Response)
  rootTypes: true, // SchemaPet, SchemaUserProfile … zusätzlich zu components['schemas'][…]
  enum: true, // echte TS-Enums …
  conditionalEnums: true, // … aber NUR wo Metadaten (x-enum-varnames) existieren; sonst Literal-Unions
  // arrayLength bewusst AUS: erzeugt mit prefixItems + minItems ein falsches Tupel-Tupel (siehe NOTES.md);
  // prefixItems wird auch ohne Flag korrekt zu [number, number].
  arrayLength: false,
  defaultNonNullable: false, // default ≠ required: Property mit default bleibt im Request optional
  excludeDeprecated: false, // deprecated behalten (JSDoc @deprecated)
  transform(schemaObject) {
    // format: binary → Blob (Request-Bodies multipart/octet-stream, Binary-Responses)
    if ('format' in schemaObject && schemaObject.format === 'binary') {
      return schemaObject.nullable ? ts.factory.createUnionTypeNode([BLOB, ts.factory.createLiteralTypeNode(ts.factory.createNull())]) : BLOB;
    }
    return undefined;
  },
};

async function generate(spec, outDir) {
  const ast = await openapiTS(new URL(spec, import.meta.url), options);
  mkdirSync(new URL(`${outDir}/`, import.meta.url), { recursive: true });
  writeFileSync(new URL(`${outDir}/schema.ts`, import.meta.url), astToString(ast));
  console.log(`openapi-typescript: ${spec} → ${outDir}/schema.ts`);
}

await generate('../../spec/bench.openapi.yaml', 'client');
await generate('../../spec/bench.openapi-3.1.yaml', 'client-31');
