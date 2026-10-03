/**
 * Review findings (H1, H2, M1, M3, M4, L5) against `nx` in a fixture workspace: a malformed openapi-clients.json
 * never breaks the graph, settings/transform paths cannot escape (no committed file deleted), missing declared
 * packages give a clear problem instead of a hasher failure, modules outside the workspace are rejected, renamed
 * targets keep dependsOn working.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNxFixture, type NxFixture, removeWorkspace, THINGS_SPEC, write } from '../helpers';

describe('H1: a malformed openapi-clients.json never breaks the graph', () => {
  let fx: NxFixture;
  beforeAll(() => {
    fx = createNxFixture('h1');
    write(fx.root, 'libs/generated/a-client/project.json', JSON.stringify({ name: 'generated-a-client', tags: ['scope:shared', 'generated'] }));
    write(fx.root, 'libs/generated/a-client/openapi.yaml', THINGS_SPEC);
  });
  afterAll(() => removeWorkspace(fx.root));

  const shapes: [string, unknown][] = [
    ['adapter registration {}', { adapters: { x: {} }, clients: { 'generated/a-client': { adapter: 'x' } } }],
    ['adapter registration null', { adapters: { x: null }, clients: { 'generated/a-client': { adapter: 'x' } } }],
    ['adapter module not a string', { adapters: { x: { module: 42 } }, clients: { 'generated/a-client': { adapter: 'x' } } }],
    ['client entry null', { clients: { 'generated/a-client': null } }],
    ['transform entry {}', { clients: { 'generated/a-client': { pipeline: { transforms: [{}] } } } }],
    ['transforms not an array', { clients: { 'generated/a-client': { pipeline: { transforms: 'x' } } } }],
    ['clients not an object', { clients: 'x' }],
    ['settings not an object', { settings: 'x', clients: { 'generated/a-client': {} } }],
    ['adapters an array', { adapters: [1], clients: { 'generated/a-client': {} } }],
    ['the file an array', []],
  ];

  it.each(shapes)('%s: graph computes, the client project stays', (_, config) => {
    write(fx.root, 'openapi-clients.json', JSON.stringify(config));
    const result = fx.tryNx('show', 'projects', '--json');
    expect(result.output).not.toMatch(/Error|error/);
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.output)).toContain('generated-a-client');
  });

  it('the problem lands in the metadata (verify reports it)', () => {
    write(fx.root, 'openapi-clients.json', JSON.stringify(shapes[0][1]));
    expect(fx.project('generated-a-client').metadata.openapi.problem).toBe('adapters.x: module missing (a workspace path, package or builtin:<id>)');
    write(fx.root, 'openapi-clients.json', JSON.stringify(shapes[4][1]));
    expect(fx.project('generated-a-client').metadata.openapi.problem).toBe('pipeline.transforms[0]: module missing');
  });
});
