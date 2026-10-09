/**
 * LIB-PRIVATE: `internal/` is never exported from index.ts (blueprint/no-internal-export), so no other
 * lib can reach it — deep imports are banned, relative imports across libs too.
 */
export function nextCheckinId(count: number): string {
  return `c${count + 1}`;
}
