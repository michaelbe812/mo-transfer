/**
 * Adapter modules by their registry path (registry.json → `module`), imported statically.
 *
 * Why not `import(join(__dirname, 'adapters', module))`: Nx loads a .ts executor through a require hook
 * (swc, CommonJS) that it removes again right after loading. swc also turns `import()` into `require()`.
 * An adapter imported at run time would therefore reach Node untranspiled ("Unexpected token"). Static
 * imports are part of the executor's module graph and get transpiled with it. The adapters stay cheap to
 * load: each imports its generator package only inside `generate`.
 */
import type { AdapterModule } from '../contract';
import * as heyApi from './hey-api';
import * as nxPluginOpenapi from './nx-plugin-openapi';
import * as openapiTools from './openapi-tools';

export const ADAPTER_MODULES: Record<string, AdapterModule> = {
  './openapi-tools.ts': openapiTools,
  './hey-api.ts': heyApi,
  './nx-plugin-openapi.ts': nxPluginOpenapi,
};
