// Dimension angular (A-*) – Hey API: SDK-Funktionen (Promise über HttpClient), provideHeyApiClient,
// @angular/common-Plugin (HttpRequest-Factories + httpResource).
import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { ApplicationRef, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { getPetResource } from '../client/@angular/common.gen';
import { client } from '../client/client.gen';
import { createClient, provideHeyApiClient } from '../client/client/client.gen';
import { getPet } from '../client/sdk.gen';
import type { Pet } from '../client/types.gen';
import { PET_RESPONSE, TEST_BASE_URL, setupHttp } from '../../../testing/http-harness';
import { Equals, nextRequest, settle, setupHeyApi } from '../testing/hey-api-test-setup';

describe('hey-api angular', () => {
  let http: HttpTestingController;
  afterEach(() => http.verify());

  it('[A-PROVIDE-FN] Konfiguration (baseUrl) über provideXxx() in providers', async () => {
    // Einzige Provider-API: provideHeyApiClient(clientInstance) – nimmt KEINE Config, setzt nur den HttpClient.
    // Eine per Provider übergebene, konfigurierte Instanz wird von den SDK-Funktionen nicht genutzt
    // (sie verwenden das Modul-Singleton `client` aus client.gen.ts).
    client.setConfig({ baseUrl: undefined, httpClient: undefined, auth: undefined });
    http = setupHttp({ providers: [provideHeyApiClient(createClient({ baseUrl: TEST_BASE_URL }))] });
    const result = TestBed.runInInjectionContext(() => getPet({ path: { petId: 1 } }));
    const req = await nextRequest(http);
    const url = req.request.url;
    req.flush(PET_RESPONSE);
    await result;
    expect(url).toBe(`${TEST_BASE_URL}/pets/1`);
  });

  it('[A-BASEURL] Base-URL konfigurierbar (client.setConfig, global – kein DI-Token)', async () => {
    http = setupHeyApi();
    const result = getPet({ path: { petId: 1 } });
    const req = await nextRequest(http);
    expect(req.request.url).toBe(`${TEST_BASE_URL}/pets/1`);
    req.flush(PET_RESPONSE);
    expect((await result).data?.name).toBe('Bello');
  });

  it('[A-INJECT] Funktionen nehmen HttpClient aus DI-Kontext (ohne Provider)', async () => {
    http = setupHeyApi({ withProvider: false });
    const injector = TestBed.inject(Injector);
    const result = runInInjectionContext(injector, () => getPet({ path: { petId: 1 } }));
    const req = await nextRequest(http);
    req.flush(PET_RESPONSE);
    expect((await result).data).toEqual(PET_RESPONSE);
  });

  it('[A-HTTPCLIENT] Requests laufen über HttpClient', async () => {
    http = setupHeyApi();
    const result = getPet({ path: { petId: 1 } });
    const req = await nextRequest(http);
    expect(req.request.method).toBe('GET');
    req.flush(PET_RESPONSE);
    await result;
  });

  it('[A-INTERCEPTORS] funktionale Interceptors greifen', async () => {
    const intercept: HttpInterceptorFn = (req, next) => next(req.clone({ setHeaders: { 'X-Intercepted': '1' } }));
    http = setupHeyApi({ interceptors: [intercept] });
    const result = getPet({ path: { petId: 1 } });
    const req = await nextRequest(http);
    expect(req.request.headers.get('X-Intercepted')).toBe('1');
    req.flush(PET_RESPONSE);
    await result;
  });

  it.skip('[A-HTTPCONTEXT] HttpContext pro Aufruf — unsupported: SDK-Options (RequestInit-basiert) kennen kein `context`; nur Workaround über getPetRequest(...).clone({ context }) + eigenes HttpClient.request (dann ohne Auth/Interceptors des Hey-API-Clients)', () => {
    /* keine API */
  });

  it('[A-OBSERVE-RESPONSE] HttpResponse<Pet> pro Aufruf, typisiert', async () => {
    http = setupHeyApi();
    const result = getPet({ path: { petId: 1 } });
    const req = await nextRequest(http);
    req.flush(PET_RESPONSE, { headers: { 'X-Total-Count': '1' } });
    const res = await result;
    expect(res.response).toBeInstanceOf(HttpResponse);
    expect(res.response?.status).toBe(200);
    expect(res.response?.headers.get('X-Total-Count')).toBe('1');
    // Typ: response ist HttpResponse<GetPetResponses> = HttpResponse<{ 200: Pet }> statt HttpResponse<Pet>.
    // Compile-zeit-verifiziert (Zeile kompiliert nur, solange der Typ falsch ist):
    type SuccessResponse = NonNullable<Extract<typeof res, { error: undefined }>['response']>;
    const bodyTypedAsPet: Equals<SuccessResponse, HttpResponse<Pet>> = false;
    expect(bodyTypedAsPet, 'response ist HttpResponse<{200: Pet}>, nicht HttpResponse<Pet>').toBe(true);
  });

  it.skip('[A-REPORT-PROGRESS] Upload-Progress — unsupported: kein reportProgress/observe-Option; Client filtert intern auf HttpEventType.Response (keine Progress-Events nach außen)', () => {
    /* keine API */
  });

  it('[A-OBSERVABLE-COLD] kein Request vor subscribe / Abbruch', async () => {
    http = setupHeyApi();
    // SDK liefert Promise (eager) – der Request geht ohne subscribe raus; kein Abbruch möglich.
    const result = getPet({ path: { petId: 1 } });
    await settle();
    const pending = http.match(() => true);
    const sentBeforeSubscribe = pending.length;
    pending.forEach((r) => r.flush(PET_RESPONSE));
    await result;
    expect(sentBeforeSubscribe).toBe(0);
  });

  it('[A-HTTPRESOURCE] getPetResource (httpResource) → Pet', async () => {
    http = setupHeyApi();
    const resource = TestBed.runInInjectionContext(() => getPetResource(() => ({ path: { petId: 1 } })));
    TestBed.tick();
    const req = http.expectOne(`${TEST_BASE_URL}/pets/1`);
    req.flush(PET_RESPONSE);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(resource.value()).toEqual(PET_RESPONSE);
    expect(resource.status()).toBe('resolved');
  });

  it('[A-ZONELESS] läuft zoneless (provideZonelessChangeDetection)', async () => {
    http = setupHeyApi();
    expect(typeof (globalThis as { Zone?: unknown }).Zone).toBe('undefined');
    const result = getPet({ path: { petId: 1 } });
    const req = await nextRequest(http);
    req.flush(PET_RESPONSE);
    expect((await result).data?.id).toBe(1);
  });
});
