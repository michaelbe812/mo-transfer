import { Redacted } from 'effect';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { AccessTokens } from './config.ts';

/**
 * Who calls:
 *   ci         trusted pipelines (main/release) — the only writers of the trusted namespace
 *   dev        developer machines — share artifacts among themselves in the dev namespace
 *   read-only  PR pipelines, anyone else who should only consume trusted artifacts
 */
export type Role = 'ci' | 'dev' | 'read-only';

/**
 * Storage namespaces. CI never reads `dev`, so nothing built on a laptop can end up in a trusted build
 * (CREEP mitigation), while developers still get every trusted hit.
 */
export type Namespace = 'trusted' | 'dev';

export interface Policy {
  /** Lookup order for GET; the first hit wins. */
  readonly read: ReadonlyArray<Namespace>;
  /** Target of PUT; undefined → 403. */
  readonly write: Namespace | undefined;
}

export const policyOf = (role: Role): Policy => {
  switch (role) {
    case 'ci':
      return { read: ['trusted'], write: 'trusted' };
    case 'dev':
      return { read: ['dev', 'trusted'], write: 'dev' };
    case 'read-only':
      return { read: ['trusted'], write: undefined };
  }
};

/** Object key of a hash in a namespace (the backend adds STORAGE_KEY_PREFIX). */
export const keyOf = (namespace: Namespace, hash: string) => `${namespace}/${hash}`;

// hash first: timingSafeEqual needs equal lengths, and comparing digests leaks nothing about the token length
const digest = (value: string) => createHash('sha256').update(value).digest();
const matchesAny = (candidate: Buffer, tokens: ReadonlyArray<Redacted.Redacted>) =>
  tokens.reduce((found, token) => timingSafeEqual(candidate, digest(Redacted.value(token))) || found, false);

/** Role granted by an `Authorization: Bearer <token>` header; undefined → 401. */
export const roleOf = (authorization: string | undefined, tokens: AccessTokens): Role | undefined => {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  if (!match) return undefined;
  const candidate = digest(match[1].trim());
  if (matchesAny(candidate, tokens.ci)) return 'ci';
  if (matchesAny(candidate, tokens.dev)) return 'dev';
  if (matchesAny(candidate, tokens.readOnly)) return 'read-only';
  return undefined;
};
