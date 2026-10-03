/**
 * Glob → RegExp for posix paths relative to the raw output: `**` (any depth, incl. none), `*` (within a segment),
 * `?`, `{a,b}`. Enough for classification rules; no negation, no character classes.
 */
const cache = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  const cached = cache.get(glob);
  if (cached) return cached;
  let pattern = '';
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      // `**/` matches zero or more folders, a trailing `**` everything below
      const slash = glob[index + 2] === '/';
      pattern += slash ? '(?:.*/)?' : '.*';
      index += slash ? 2 : 1;
    } else if (char === '*') pattern += '[^/]*';
    else if (char === '?') pattern += '[^/]';
    else if (char === '{') {
      const end = glob.indexOf('}', index);
      if (end < 0) throw new Error(`glob ${glob}: unclosed {`);
      pattern += `(?:${glob
        .slice(index + 1, end)
        .split(',')
        .map((alternative) => alternative.replace(/[.+^$()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*'))
        .join('|')})`;
      index = end;
    } else pattern += char.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  const regExp = new RegExp(`^${pattern}$`);
  cache.set(glob, regExp);
  return regExp;
}

export const matchesAny = (file: string, globs: readonly string[]): boolean =>
  globs.some((glob) => globToRegExp(glob).test(file));
