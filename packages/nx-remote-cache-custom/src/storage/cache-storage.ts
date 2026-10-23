import { Context, type Effect, type Option, Schema } from 'effect';
import type { Readable } from 'node:stream';

/** A stored task output, streamed from the backend. */
export interface CacheEntry {
  readonly body: Readable;
  readonly contentLength: number | undefined;
}

/** The key is already stored — entries are write-once (CREEP mitigation: a later write never replaces an artifact). */
export class EntryAlreadyExists extends Schema.TaggedError<EntryAlreadyExists>()('EntryAlreadyExists', {
  key: Schema.String,
}) {}

/** Any backend failure (network, credentials, missing bucket …). */
export class StorageError extends Schema.TaggedError<StorageError>()('StorageError', {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * Storage backend of the cache: one object per key (`<namespace>/<nx task hash>`). Implementations must make `put` atomic and
 * conditional (create-only), so concurrent writers cannot overwrite an existing entry.
 */
export class CacheStorage extends Context.Service<
  CacheStorage,
  {
    readonly name: string;
    get(key: string): Effect.Effect<Option.Option<CacheEntry>, StorageError>;
    exists(key: string): Effect.Effect<boolean, StorageError>;
    put(key: string, body: Readable, contentLength: number): Effect.Effect<void, EntryAlreadyExists | StorageError>;
  }
>()('@berger-engineering/nx-remote-cache-custom/storage/CacheStorage') {}
