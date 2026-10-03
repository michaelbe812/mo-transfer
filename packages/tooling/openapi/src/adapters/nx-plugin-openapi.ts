/**
 * Adapter `nx-plugin-openapi` (@nx-plugin-openapi/core + plugin-openapi | plugin-hey-api), without an Nx
 * executor context: the package's generator plugins directly via its GeneratorRegistry (spike S2).
 *
 * options:
 *   plugin                'openapi-tools' (default) | 'hey-api'
 *   generatorOptions      passed 1:1 to the plugin
 *   additionalProperties  openapi-tools only: typescript-angular options. plugin-openapi has no
 *                         --additional-properties, so they go into a config file (-c) in the tmp folder.
 *
 * Output = the direct adapters' output, their classification is reused.
 * Pitfalls: ctx.root = workspace root and outputPath relative to it (plugin-openapi starts
 * node_modules/@openapitools/openapi-generator-cli/main.js relative to root); the plugin empties the output
 * folder; hey-api needs an absolute spec path; the packages pin @nx/devkit 19 (peer warning under Nx 23).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { defineAdapter } from '../adapter';
import { classifyHeyApi, defaults as heyApiDefaults } from './hey-api';
import { classifyOpenApiTools, defaults as openapiToolsDefaults } from './openapi-tools';

// CommonJS package, resolved lazily (only this adapter needs it); __filename: works under swc (Nx) and Vitest
const require = createRequire(__filename);

type PluginId = 'openapi-tools' | 'hey-api';

/** The adapter's own options (openapi-clients.json → options, merged over `defaults`). */
interface NxPluginOpenapiOptions {
  plugin: string;
  generatorOptions?: Record<string, unknown>;
  additionalProperties?: Record<string, unknown>;
}

export const defaults: Record<string, unknown> = { plugin: 'openapi-tools' };

const pluginDefaults: Record<PluginId, Record<string, unknown>> = {
  // modelPackage/apiPackage fixed: the classification depends on them (plugin-openapi has flags for it)
  'openapi-tools': { modelPackage: 'model', apiPackage: 'api' },
  'hey-api': { plugins: heyApiDefaults.plugins, logs: { level: 'silent', file: false } },
};

const nxPluginOpenapiAdapter = defineAdapter<Record<string, unknown>>({
  apiVersion: 1,
  id: 'nx-plugin-openapi',
  defaults,
  optionsSchema: {
    type: 'object',
    properties: {
      plugin: { enum: ['openapi-tools', 'hey-api'] },
      generatorOptions: { type: 'object' },
      additionalProperties: { type: 'object' },
    },
    additionalProperties: false,
  },
  requires: { packages: ['@nx-plugin-openapi/core'] },
  async generate({ specFile, outDir, options, workspaceRoot }) {
    const {
      plugin: pluginId,
      generatorOptions: ownOptions,
      additionalProperties,
    } = options as unknown as NxPluginOpenapiOptions;
    if (!(pluginId in pluginDefaults)) throw new Error(`nx-plugin-openapi: unknown plugin '${pluginId}'`);
    const generatorOptions: Record<string, unknown> = {
      ...pluginDefaults[pluginId as PluginId],
      ...(ownOptions ?? {}),
    };
    if (pluginId === 'openapi-tools' && !generatorOptions.configFile) {
      const configFile = join(dirname(outDir), 'openapi-tools.config.json');
      mkdirSync(dirname(configFile), { recursive: true });
      writeFileSync(configFile, JSON.stringify({ ...openapiToolsDefaults, ...(additionalProperties ?? {}) }, null, 2));
      generatorOptions.configFile = configFile;
    }
    const { GeneratorRegistry, loadPlugin } =
      require('@nx-plugin-openapi/core') as typeof import('@nx-plugin-openapi/core');
    const registry = GeneratorRegistry.instance();
    if (!registry.has(pluginId)) registry.register(await loadPlugin(pluginId, { root: workspaceRoot }));
    const plugin = registry.get(pluginId);
    const pluginOptions = { inputSpec: specFile, outputPath: relative(workspaceRoot, outDir), generatorOptions };
    await plugin.validate?.(pluginOptions);
    const result: unknown = await plugin.generate(pluginOptions, { root: workspaceRoot });
    const failure = result as { success?: boolean; message?: string } | undefined;
    if (failure && failure.success === false)
      throw new Error(`nx-plugin-openapi/${pluginId}: ${failure.message ?? 'failed'}`);
  },
  // ctx instead of outDir only: which plugin ran is in the options (contract refinement from S2)
  classify({ outDir, options }) {
    return options.plugin === 'hey-api' ? classifyHeyApi(outDir) : classifyOpenApiTools(outDir);
  },
});
export default nxPluginOpenapiAdapter;
