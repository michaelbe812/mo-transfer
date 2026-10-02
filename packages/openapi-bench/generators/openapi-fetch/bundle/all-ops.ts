// Gesamte öffentliche API: generierte Typen (+ Runtime-Enum Priority) und der openapi-fetch-Runtime.
export * from '../client/schema';
export {
  default as createClient,
  createPathBasedClient,
  wrapAsPathBasedClient,
  createQuerySerializer,
  defaultBodySerializer,
  defaultPathSerializer,
  mergeHeaders,
} from 'openapi-fetch';
export type { Client, ClientOptions, FetchResponse, Middleware } from 'openapi-fetch';
