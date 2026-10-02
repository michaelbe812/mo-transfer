import { describe, expect, it } from 'vitest';
import { findLazyRoutes, insertRoute, lazyRouteSource, removeRoutes, renameRoutePath } from './routes';

const route = lazyRouteSource({
  path: 'x',
  specifier: '@mo-transfer/x/shell',
  exportName: 'xRoutes',
  kind: 'children',
});
const isX = (specifier: string): boolean => specifier === '@mo-transfer/x/shell';

const cases: Record<string, string> = {
  'before the redirect fallback': `export const routes: Routes = [
  { path: 'a', loadChildren: () => import('@mo-transfer/a/shell').then((m) => m.aRoutes) },
  { path: '', pathMatch: 'full', redirectTo: 'a' },
];
`,
  'append without trailing comma': `export const routes: Routes = [
  { path: 'a', loadChildren: () => import('@mo-transfer/a/shell').then((m) => m.aRoutes) }
];
`,
  'append with trailing comma': `export const routes: Routes = [
  { path: 'a', loadChildren: () => import('@mo-transfer/a/shell').then((m) => m.aRoutes) },
];
`,
  'into children when there is no lazy route yet': `export const routes: Routes = [
  { path: '', children: [{ path: '', component: Page }] },
];
`,
};

describe('route editing', () => {
  for (const [name, content] of Object.entries(cases)) {
    it(`inserts ${name}; remove restores the file byte for byte`, () => {
      const inserted = insertRoute(content, route);

      expect(findLazyRoutes(inserted).map((lazy) => lazy.specifier)).toContain('@mo-transfer/x/shell');
      expect(removeRoutes(inserted, isX).content).toBe(content);
    });
  }

  it('keeps the redirect last', () => {
    const inserted = insertRoute(cases['before the redirect fallback'], route);
    expect(inserted.indexOf("path: 'x'")).toBeLessThan(inserted.indexOf('redirectTo'));
  });

  it('empties an array whose only route is removed', () => {
    const content = `export const routes: Routes = [\n  { path: 'x', loadChildren: () => import('@mo-transfer/x/shell').then((m) => m.xRoutes) },\n];\n`;
    expect(removeRoutes(content, isX).content).toBe('export const routes: Routes = [];\n');
  });

  it('renames the path of a lazy route', () => {
    const content = cases['append with trailing comma'];
    expect(renameRoutePath(content, '@mo-transfer/a/shell', 'a', 'b')).toContain("{ path: 'b', loadChildren");
  });
});
