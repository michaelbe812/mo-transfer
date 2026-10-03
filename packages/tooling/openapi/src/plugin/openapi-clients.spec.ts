import { logger } from '@nx/devkit';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNodesV2, inferClientNodes } from './openapi-clients';

describe('plugin: client targets inferred from openapi-clients.json', () => {
  let root: string;
  const write = (path: string, content = ''): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const config = (clients: Record<string, unknown>, defaultAdapter = 'openapi-tools'): void =>
    write('openapi-clients.json', JSON.stringify({ defaultAdapter, clients }));
  const client = (clientPath: string, spec = 'openapi.yaml'): void => {
    write(`libs/${clientPath}/project.json`, '{}');
    write(`libs/${clientPath}/${spec}`, 'openapi: 3.0.3\n');
  };
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'openapi-plugin-'));
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('generate + update-spec per entry, adapter inputs of the entry (no project.json → no node)', () => {
    client('generated/pet-client');
    client('booking/generated/booking-client', 'openapi.json');
    config({
      'generated/pet-client': { adapter: 'hey-api' },
      'booking/generated/booking-client': {},
      'generated/gone-client': {},
    });
    const { projects = {} } = inferClientNodes(root, 'openapi-clients.json');

    expect(Object.keys(projects)).toEqual(['libs/generated/pet-client', 'libs/booking/generated/booking-client']);
    const pet = projects['libs/generated/pet-client'].targets;
    expect(Object.keys(pet)).toEqual(['generate', 'update-spec']);
    expect(pet['generate']['options']).toEqual({ client: 'generated/pet-client' });
    expect(pet['generate']['inputs']).toContainEqual({
      json: '{workspaceRoot}/openapi-clients.json',
      fields: ['defaultAdapter', 'clients.generated/pet-client'],
    });
    expect(pet['generate']['inputs']).toContainEqual({
      externalDependencies: ['@hey-api/openapi-ts', 'typescript', 'yaml'],
    });
    const booking = projects['libs/booking/generated/booking-client'].targets['generate']['inputs'] as unknown[];
    expect(booking[0]).toBe('{workspaceRoot}/libs/booking/generated/booking-client/openapi.json');
    expect(booking).toContainEqual({ runtime: 'java -version 2>&1' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('a broken entry never breaks the graph: warning, only update-spec', () => {
    client('generated/odd-client');
    write('libs/generated/nospec-client/project.json', '{}');
    config({ 'generated/odd-client': { adapter: 'swagger-codegen' }, 'generated/nospec-client': {} });
    const { projects = {} } = inferClientNodes(root, 'openapi-clients.json');

    expect(Object.keys(projects['libs/generated/odd-client'].targets)).toEqual(['update-spec']);
    expect(Object.keys(projects['libs/generated/nospec-client'].targets)).toEqual(['update-spec']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown adapter "swagger-codegen"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('needs exactly one spec file'));
  });

  it('unreadable file or no clients: no nodes, warning only for the unreadable file', () => {
    write('openapi-clients.json', '{ nope');
    expect(inferClientNodes(root, 'openapi-clients.json')).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('openapi-clients.json: not readable'));
    write('openapi-clients.json', '{}');
    expect(inferClientNodes(root, 'openapi-clients.json')).toEqual({ projects: {} });
  });

  it('createNodesV2: the root openapi-clients.json, results per file', async () => {
    client('generated/pet-client');
    config({ 'generated/pet-client': {} });
    const [glob, createNodes] = createNodesV2;
    expect(glob).toBe('openapi-clients.json');
    const results = await createNodes(['openapi-clients.json'], undefined, {
      workspaceRoot: root,
      nxJsonConfiguration: {},
    } as Parameters<typeof createNodes>[2]);
    expect(results).toHaveLength(1);
    expect(results[0][0]).toBe('openapi-clients.json');
    expect(Object.keys(results[0][1].projects ?? {})).toEqual(['libs/generated/pet-client']);
  });
});
