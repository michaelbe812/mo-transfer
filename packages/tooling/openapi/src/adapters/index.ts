/**
 * Built-in adapters, imported statically (src/registry/registry.ts → BUILTIN_ADAPTERS holds their cache inputs).
 *
 * Static on purpose: Nx loads a .ts executor through a require hook (swc, CommonJS) that it removes right after
 * loading, so built-ins must be part of the executor's module graph. They stay cheap to load: each imports its
 * generator package only inside `generate`. Consumer adapters are loaded at run time (src/registry/modules.ts).
 */
import type { AdapterDefinition } from '../adapter';
import commandAdapter from './command';
import heyApiAdapter from './hey-api';
import nxPluginOpenapiAdapter from './nx-plugin-openapi';
import openapiToolsAdapter from './openapi-tools';

export const BUILTIN_ADAPTER_MODULES: Record<string, AdapterDefinition> = {
  'openapi-tools': openapiToolsAdapter,
  'hey-api': heyApiAdapter,
  'nx-plugin-openapi': nxPluginOpenapiAdapter,
  // typed options of its own; validated against its optionsSchema before generate
  command: commandAdapter as unknown as AdapterDefinition,
};
