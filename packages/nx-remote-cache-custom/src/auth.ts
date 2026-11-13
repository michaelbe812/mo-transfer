import { Redacted } from 'effect';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { AccessToken, AccessTokens } from './config.ts';

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

/** True when `Authorization: Bearer <token>` matches one of `tokens` (constant time). */
export const hasBearer = (authorization: string | undefined, tokens: ReadonlyArray<Redacted.Redacted>): boolean => {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  return match ? matchesAny(digest(match[1].trim()), tokens) : false;
};

/** Authenticated caller: its role and the name of the matching token (metrics label `client`). */
export interface Caller {
  readonly role: Role;
  readonly client: string;
}

/** Name of the first matching token; compares against every token so timing doesn't reveal the position. */
const matchingName = (candidate: Buffer, tokens: ReadonlyArray<AccessToken>) =>
  tokens.reduce<string | undefined>(
    (found, token) =>
      timingSafeEqual(candidate, digest(Redacted.value(token.secret))) ? (found ?? token.name) : found,
    undefined,
  );

/** Caller behind an `Authorization: Bearer <token>` header; undefined → 401. */
export const callerOf = (authorization: string | undefined, tokens: AccessTokens): Caller | undefined => {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  if (!match) return undefined;
  const candidate = digest(match[1].trim());
  const byRole: ReadonlyArray<[Role, ReadonlyArray<AccessToken>]> = [
    ['ci', tokens.ci],
    ['dev', tokens.dev],
    ['read-only', tokens.readOnly],
  ];
  for (const [role, list] of byRole) {
    const client = matchingName(candidate, list);
    if (client !== undefined) return { role, client };
  }
  return undefined;
};

/** Role granted by an `Authorization: Bearer <token>` header; undefined → 401. */
export const roleOf = (authorization: string | undefined, tokens: AccessTokens): Role | undefined =>
  callerOf(authorization, tokens)?.role;
