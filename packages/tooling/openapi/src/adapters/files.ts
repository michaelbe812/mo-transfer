import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** All .ts files below dir, relative + posix, sorted (deterministic). */
export function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map((file) => String(file).split('\\').join('/'))
    .filter((file) => file.endsWith('.ts'))
    .sort();
}

/** Raw output of a folder: every .ts file, relative posix path → content (client and testing preset, contract helper). */
export function readRawFiles(dir: string): Map<string, string> {
  return new Map(listTsFiles(dir).map((file) => [file, readFileSync(join(dir, file), 'utf-8')]));
}
