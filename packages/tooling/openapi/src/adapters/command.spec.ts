import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdapterContext } from '../adapter';
import { replacePaths } from '../tree-helpers';
import commandAdapter, { type CommandAdapterOptions } from './command';

describe('command adapter', () => {
  let outDir: string;
  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'openapi-command-'));
  });
  afterEach(() => rmSync(outDir, { recursive: true, force: true }));

  const context = (options: CommandAdapterOptions, run = vi.fn()): AdapterContext<CommandAdapterOptions> => ({
    specFile: '/ws/spec.yaml',
    outDir,
    options,
    workspaceRoot: '/ws',
    client: { name: 'x-client', path: 'generated/x-client', placement: 'shared', spec: { file: 'spec.yaml' }, generator: { adapter: 'command', options: {} }, layout: 'default', pipeline: {} },
    verbose: false,
    log: () => undefined,
    run,
  });

  it('fills placeholders in command, args and env; without args/env runs the bare command', () => {
    const run = vi.fn();
    commandAdapter.generate(context({ command: '{workspaceRoot}/bin/gen', args: ['{specFile}', '{outDir}', '{clientName}:{clientPath}'], env: { OUT: '{outDir}' }, classify: {} }, run));
    expect(run).toHaveBeenCalledWith('/ws/bin/gen', ['/ws/spec.yaml', outDir, 'x-client:generated/x-client'], { env: { OUT: outDir } });
    commandAdapter.generate(context({ command: 'gen', classify: {} }, run));
    expect(run).toHaveBeenLastCalledWith('gen', [], { env: {} });
  });

  it('classify by globs, missing categories empty, declared entries passed through', () => {
    mkdirSync(join(outDir, 'model'));
    writeFileSync(join(outDir, 'model/a.ts'), '');
    writeFileSync(join(outDir, 'client.ts'), '');
    expect(commandAdapter.classify(context({ command: 'x', classify: { models: ['model/*.ts'] } }))).toEqual({ models: ['model/a.ts'], apis: [], core: [] });
    expect(commandAdapter.classify(context({ command: 'x', classify: { apis: ['*.ts'] }, entries: { api: ['client.ts'] } }))).toEqual({
      models: [],
      apis: ['client.ts'],
      core: [],
      entries: { api: ['client.ts'] },
    });
  });
});

describe('tree helpers', () => {
  it('replacePaths: libs paths, client option, json fields, nested values; other strings untouched', () => {
    expect(
      replacePaths(
        { a: '{workspaceRoot}/libs/generated/a/openapi.yaml', b: ['generated/a', 'clients.generated/a', 'generated/ab', 1], c: null },
        'generated/a',
        'booking/generated/a',
        'libs',
      ),
    ).toEqual({
      a: '{workspaceRoot}/libs/booking/generated/a/openapi.yaml',
      b: ['booking/generated/a', 'clients.booking/generated/a', 'generated/ab', 1],
      c: null,
    });
  });
});
