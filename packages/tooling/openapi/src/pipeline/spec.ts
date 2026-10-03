/**
 * Stage `spec`: the committed spec + the client's overlays (pipeline.overlays, relative to the client folder; experimental,
 * feature flag settings.features.overlays — disabled, a client with overlays fails here) →
 * the spec the generator reads. Without overlays the committed file itself (byte-identical output); with overlays
 * an effective copy below tmp/openapi/<client path>/spec/ (same format, deterministic serialization).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ClientDefinition } from '../adapter';
import { OVERLAYS_DISABLED_HINT, overlayFiles } from '../config';
import { OpenApiError } from '../errors';
import type { OpenApiSettings } from '../settings';
import { applyOverlay, type OverlayDocument } from './overlay';

export function prepareSpec(client: ClientDefinition, workspaceRoot: string, settings: OpenApiSettings, tmpDir: string): string {
  const specFile = join(workspaceRoot, client.spec.file);
  if (!existsSync(specFile)) throw new Error(`${client.spec.file} missing (url set? → nx run <client>:update-spec)`);
  if (client.pipeline.overlays?.length && !settings.features.overlays) {
    throw new OpenApiError(`pipeline.overlays set (${client.pipeline.overlays.join(', ')}), feature flag "overlays" disabled`, {
      phase: 'spec',
      hint: OVERLAYS_DISABLED_HINT,
    });
  }
  const overlays = overlayFiles(settings, client.path, client.pipeline.overlays);
  if (!overlays.length) return specFile;
  const document: unknown = parseYaml(readFileSync(specFile, 'utf-8'));
  for (const overlay of overlays) {
    const file = join(workspaceRoot, overlay);
    if (!existsSync(file)) throw new Error(`overlay ${overlay} missing (pipeline.overlays are relative to the client folder)`);
    applyOverlay(document, parseYaml(readFileSync(file, 'utf-8')) as OverlayDocument, overlay);
  }
  const effective = join(tmpDir, 'spec', basename(client.spec.file));
  mkdirSync(join(tmpDir, 'spec'), { recursive: true });
  writeFileSync(
    effective,
    effective.endsWith('.json')
      ? `${JSON.stringify(document, null, 2)}\n`
      : stringifyYaml(document, { lineWidth: 0, aliasDuplicateObjects: false }),
  );
  return effective;
}
