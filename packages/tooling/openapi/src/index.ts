/**
 * @mo-transfer/tooling-openapi — public API (extension SPI: `./adapter`, plugin: `./plugin`, Tree helpers: `./clients`).
 */
export * from './config';
export * from './errors';
export { generateClient, generateTesting, resolveClient, serializeSpec, updateSpec } from './facade';
export * from './project-config';
export { resolveAdapterRegistry, BUILTIN_ADAPTERS, type AdapterRegistry, type ResolvedAdapter } from './registry/registry';
export * from './settings';
