// Gesamte öffentliche API des Clients (SDK-Funktionen, Typen, Enum-Konstanten, Client-Instanz/Provider)
// + Angular-Plugin-Output (HttpRequest-Factories, httpResource-Funktionen).
export * from '../client/index';
export { client } from '../client/client.gen';
export { createClient, provideHeyApiClient } from '../client/client/client.gen';
export { createConfig } from '../client/client/utils.gen';
export type { Client, Config, RequestOptions, RequestResult } from '../client/client/types.gen';
export * from '../client/@angular/common.gen';
