/**
 * Generator-spezifische Test-Helfer (Hey API): globale `client`-Instanz pro Test zurücksetzen und
 * empfohlenes Angular-Setup (provideHeyApiClient) + Base-URL konfigurieren.
 */
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { client } from '../client/client.gen';
import { provideHeyApiClient } from '../client/client/client.gen';
import { HttpHarnessOptions, TEST_BASE_URL, setupHttp } from '../../../testing/http-harness';

/**
 * Der Hey-API-Client ist ein Modul-Singleton: Zustand (httpClient, auth) aus vorherigen Tests entfernen,
 * dann TestBed mit provideHeyApiClient(client) (setzt HttpClient per App-Initializer) aufsetzen.
 */
export function setupHeyApi(options: HttpHarnessOptions & { withProvider?: boolean } = {}): HttpTestingController {
  client.setConfig({ baseUrl: TEST_BASE_URL, httpClient: undefined, auth: undefined });
  const providers = [...(options.withProvider === false ? [] : [provideHeyApiClient(client)]), ...(options.providers ?? [])];
  return setupHttp({ interceptors: options.interceptors, providers });
}

/** SDK-Funktionen sind async (await vor httpClient.request) → Request erscheint erst nach Microtasks. */
export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Wartet, bis der Request abgesetzt ist, und liefert genau einen offenen Request. */
export async function nextRequest(http: HttpTestingController): Promise<TestRequest> {
  await settle();
  return http.expectOne(() => true);
}

/** Header so, wie Angulars Backends ihn auf den Draht schreiben (values.join(',')). */
export function wireHeader(req: TestRequest, name: string): string | null {
  const values = req.request.headers.getAll(name);
  return values === null ? null : values.join(',');
}

/** Exakte Typ-Gleichheit (für compile-zeit-verifizierte Fakten in Runtime-Tests). */
export type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
