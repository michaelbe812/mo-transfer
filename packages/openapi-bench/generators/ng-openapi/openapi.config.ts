// ng-openapi 0.4.1 Konfiguration. Default-Export = 3.0-Spec → client/ (CLI-kompatibel: `ng-openapi -c openapi.config.ts`),
// `config31` = identische Optionen für die 3.1-Delta-Spec → client-31/. Begründung siehe NOTES.md / meta.json.
import type { GeneratorConfig } from 'ng-openapi';
import { HttpResourcePlugin } from '@ng-openapi/http-resource';

const config: GeneratorConfig = {
  input: '../../spec/bench.openapi.yaml',
  output: './client',
  clientName: 'Bench',
  // Signal-API: generiert resources/*.resource.ts mit httpResource() für GET-Operationen
  plugins: [HttpResourcePlugin],
  options: {
    dateType: 'string',
    enumStyle: 'union',
    generateServices: true,
    emitAcceptHeader: true,
    useSingleRequestParameter: false,
    modelFileStructure: 'single',
    serviceDecorator: 'injectable',
  },
};

export const config31: GeneratorConfig = { ...config, input: '../../spec/bench.openapi-3.1.yaml', output: './client-31' };

export default config;
