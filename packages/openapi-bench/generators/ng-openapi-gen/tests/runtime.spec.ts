/**
 * dimension: runtime (R-*) + angular (A-*) — ng-openapi-gen 1.1.0.
 * Idiomatische API: `inject(Api).invoke(fn, params, context?)` → kaltes Observable (promises: false),
 * `invoke$Response` → Observable<StrictHttpResponse<T>>. Base-URL über `provideApiConfiguration(...)`.
 */
import { inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpContext, HttpContextToken, HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { Api } from '../client/api';
import { ApiConfiguration, provideApiConfiguration } from '../client/api-configuration';
import type { Pet, WeirdNames } from '../client/models';
import { getPet } from '../client/fn/pets/get-pet';
import { listPets } from '../client/fn/pets/list-pets';
import { createPet } from '../client/fn/pets/create-pet';
import { updatePet } from '../client/fn/pets/update-pet';
import { patchPet } from '../client/fn/pets/patch-pet';
import { deletePet } from '../client/fn/pets/delete-pet';
import { multiPathParams } from '../client/fn/params/multi-path-params';
import { queryStyles } from '../client/fn/params/query-styles';
import { headerAndCookieParams } from '../client/fn/params/header-and-cookie-params';
import { reservedParamNames } from '../client/fn/params/reserved-param-names';
import { submitForm } from '../client/fn/bodies/submit-form';
import { uploadFiles } from '../client/fn/bodies/upload-files';
import { uploadBinary } from '../client/fn/bodies/upload-binary';
import { postText } from '../client/fn/bodies/post-text';
import { downloadFile } from '../client/fn/responses/download-file';
import { getVendorJson } from '../client/fn/responses/get-vendor-json';
import { reportByAccept } from '../client/fn/responses/report-by-accept';
import { reportByAccept$Pdf } from '../client/fn/responses/report-by-accept-pdf';
import { getDates } from '../client/fn/responses/get-dates';
import { createShape } from '../client/fn/polymorphism/create-shape';
import { specialProperties } from '../client/fn/naming/special-properties';
import {
  PET_RESPONSE,
  PROBLEM_RESPONSE,
  TEST_BASE_URL,
  blobText,
  effectiveContentType,
  expectSingleRequest,
  pathOf,
  queryAll,
  queryEntries,
  rawQueryOf,
  serializedBody,
  setupHttp,
} from '../../../testing/http-harness';

const UUID = '7f9c3f0e-2c7c-4a43-9a43-3f6f3c1b2a10';
const PET_BODY: Pet = { id: 1, name: 'Bello', status: 'available', photoUrls: ['https://img.example.com/1.png'] };

describe('ng-openapi-gen runtime', () => {
  let http: HttpTestingController;
  let api: Api;

  beforeEach(() => {
    http = setupHttp({ providers: [provideApiConfiguration(TEST_BASE_URL)] });
    api = TestBed.inject(Api);
  });
  afterEach(() => http.verify());

  // ---------------------------------------------------------------- Parameter

  it('[R-PATH-MULTI] Mehrere Pfadparameter korrekt eingesetzt', async () => {
    const result = firstValueFrom(api.invoke(multiPathParams, { stringId: 'abc', intId: 42, uuidId: UUID, enumId: 'sold' }));
    const req = expectSingleRequest(http);
    expect(pathOf(req.request).endsWith(`/params/path/abc/42/${UUID}/sold`)).toBe(true);
    req.flush({});
    await result;
  });

  it('[R-PATH-ENCODE] Pfadparameter URL-encodiert', async () => {
    const result = firstValueFrom(api.invoke(multiPathParams, { stringId: 'a/b c?#', intId: 1, uuidId: UUID, enumId: 'sold' }));
    const req = expectSingleRequest(http);
    expect(pathOf(req.request)).toBe(`/api/params/path/a%2Fb%20c%3F%23/1/${UUID}/sold`);
    req.flush({});
    await result;
  });

  it('[R-QUERY-PRIMITIVES] Primitive Query-Parameter (0 und false werden gesendet)', async () => {
    const result = firstValueFrom(api.invoke(listPets, { limit: 10, offset: 0, status: 'sold', vaccinated: false }));
    const req = expectSingleRequest(http);
    expect(queryEntries(req.request)).toEqual([
      ['limit', '10'],
      ['offset', '0'],
      ['status', 'sold'],
      ['vaccinated', 'false'],
    ]);
    req.flush({ total: 0, limit: 10, offset: 0, items: [] });
    await result;
  });

  it('[R-QUERY-OPTIONAL-OMITTED] Undefined/fehlende Parameter nicht gesendet', async () => {
    const result = firstValueFrom(api.invoke(listPets));
    const req = expectSingleRequest(http);
    expect(rawQueryOf(req.request)).toBe('');
    expect(req.request.urlWithParams).not.toMatch(/undefined|null/);
    req.flush({ total: 0, limit: 20, offset: 0, items: [] });
    await result;
  });

  it('[R-QUERY-ARRAY-EXPLODE] form/explode=true', async () => {
    const result = firstValueFrom(api.invoke(queryStyles, { required: 'r', tagsExplode: ['a', 'b'] }));
    const req = expectSingleRequest(http);
    expect(queryAll(req.request, 'tagsExplode')).toEqual(['a', 'b']);
    expect(rawQueryOf(req.request)).toContain('tagsExplode=a&tagsExplode=b');
    req.flush({});
    await result;
  });

  it('[R-QUERY-ARRAY-NOEXPLODE] form/explode=false', async () => {
    const result = firstValueFrom(api.invoke(queryStyles, { required: 'r', tagsCsv: ['a', 'b'] }));
    const req = expectSingleRequest(http);
    expect(queryAll(req.request, 'tagsCsv')).toEqual(['a,b']);
    req.flush({});
    await result;
  });

  it('[R-QUERY-ARRAY-PIPE] pipeDelimited', async () => {
    const result = firstValueFrom(api.invoke(queryStyles, { required: 'r', tagsPipe: ['a', 'b'] }));
    const req = expectSingleRequest(http);
    expect(queryAll(req.request, 'tagsPipe')).toEqual(['a|b']);
    req.flush({});
    await result;
  });

  it('[R-QUERY-ARRAY-SPACE] spaceDelimited', async () => {
    const result = firstValueFrom(api.invoke(queryStyles, { required: 'r', tagsSpace: [1, 2] }));
    const req = expectSingleRequest(http);
    expect(queryAll(req.request, 'tagsSpace')).toEqual(['1 2']);
    expect(rawQueryOf(req.request)).toMatch(/tagsSpace=1(%20|\+)2/);
    req.flush({});
    await result;
  });

  it('[R-QUERY-DEEPOBJECT] deepObject', async () => {
    const result = firstValueFrom(api.invoke(queryStyles, { required: 'r', filter: { name: 'rex', status: 'sold' } }));
    const req = expectSingleRequest(http);
    expect(queryAll(req.request, 'filter[name]')).toEqual(['rex']);
    expect(queryAll(req.request, 'filter[status]')).toEqual(['sold']);
    req.flush({});
    await result;
  });

  it('[R-QUERY-FORM-OBJECT] form/explode Objekt', async () => {
    const result = firstValueFrom(api.invoke(queryStyles, { required: 'r', point: { x: 1, y: 2 } }));
    const req = expectSingleRequest(http);
    expect(queryAll(req.request, 'x')).toEqual(['1']);
    expect(queryAll(req.request, 'y')).toEqual(['2']);
    expect(queryAll(req.request, 'point')).toEqual([]);
    req.flush({});
    await result;
  });

  it('[R-QUERY-DATE] Datum-Query als ISO', async () => {
    // since/day sind als string typisiert → Aufrufer übergibt ISO-Strings, Client sendet sie unverändert.
    const result = firstValueFrom(api.invoke(queryStyles, { required: 'r', since: '2024-01-02T03:04:05.000Z', day: '2024-01-02' }));
    const req = expectSingleRequest(http);
    expect(queryAll(req.request, 'since')[0]).toMatch(/^2024-01-02T03:04:05(\.000)?Z$/);
    expect(queryAll(req.request, 'day')).toEqual(['2024-01-02']);
    req.flush({});
    await result;
  });

  it('[R-QUERY-BOOLEAN] Boolean-Query', async () => {
    const resultTrue = firstValueFrom(api.invoke(queryStyles, { required: 'r', flag: true }));
    const reqTrue = expectSingleRequest(http);
    expect(queryAll(reqTrue.request, 'flag')).toEqual(['true']);
    reqTrue.flush({});
    await resultTrue;
    const resultFalse = firstValueFrom(api.invoke(queryStyles, { required: 'r', flag: false }));
    const reqFalse = expectSingleRequest(http);
    expect(queryAll(reqFalse.request, 'flag')).toEqual(['false']);
    reqFalse.flush({});
    await resultFalse;
  });

  it('[R-HEADER-PARAM] Header-Parameter gesendet', async () => {
    const result = firstValueFrom(
      api.invoke(headerAndCookieParams, { 'X-Request-Id': UUID, 'X-Retry-Count': 3, 'X-Trace-Flags': ['a', 'b'] }),
    );
    const req = expectSingleRequest(http);
    expect(req.request.headers.get('X-Request-Id')).toBe(UUID);
    expect(req.request.headers.get('X-Retry-Count')).toBe('3');
    // simple-Style: 'a,b'. ng-openapi-gen hängt pro Element einen Wert an; Angulars Xhr-/Fetch-Backend joint
    // mehrere Werte mit ',' → auf dem Wire steht 'a,b' (Audit: gleiche Wire-Sicht wie orval-Test).
    expect(req.request.headers.getAll('X-Trace-Flags')?.join(',')).toBe('a,b');
    req.flush({});
    await result;
  });

  it.skip('[R-COOKIE-PARAM] Cookie-Parameter — unsupported: ng-openapi-gen verwirft Cookie-Parameter ("cannot be sent in XmlHttpRequests"), session fehlt in HeaderAndCookieParams$Params', () => {});

  it('[R-NAME-RESERVED-PARAM] Umbenannte Parameter mit Originalnamen am Wire', async () => {
    const result = firstValueFrom(api.invoke(reservedParamNames, { class: 'x', default: 'd', 'page-size': 5, 'filter.name': 'n' }));
    const req = expectSingleRequest(http);
    expect(pathOf(req.request)).toBe('/api/params/reserved/x');
    expect(queryEntries(req.request)).toEqual([
      ['default', 'd'],
      ['page-size', '5'],
      ['filter.name', 'n'],
    ]);
    req.flush({});
    await result;
  });

  // ---------------------------------------------------------------- Bodies

  it('[R-BODY-JSON] JSON-Body', async () => {
    const result = firstValueFrom(api.invoke(createPet, { body: PET_BODY }));
    const req = expectSingleRequest(http);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(PET_BODY);
    expect(effectiveContentType(req.request)).toBe('application/json');
    req.flush(PET_RESPONSE, { status: 201, statusText: 'Created' });
    await result;
  });

  it('[R-NULL-SEND] null-Felder bleiben erhalten', async () => {
    const result = firstValueFrom(api.invoke(updatePet, { petId: 1, body: { ...PET_BODY, nickname: null } }));
    const req = expectSingleRequest(http);
    const body = serializedBody(req.request);
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    expect(parsed).toHaveProperty('nickname', null);
    req.flush(PET_RESPONSE);
    await result;
  });

  it('[R-BODY-MERGE-PATCH] application/merge-patch+json', async () => {
    const result = firstValueFrom(api.invoke(patchPet, { petId: 1, body: { nickname: null, name: 'Rex' } }));
    const req = expectSingleRequest(http);
    expect(req.request.method).toBe('PATCH');
    expect(effectiveContentType(req.request)).toBe('application/merge-patch+json');
    const body = serializedBody(req.request);
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    expect(parsed).toEqual({ nickname: null, name: 'Rex' });
    req.flush(PET_RESPONSE);
    await result;
  });

  it('[R-BODY-FORM-URLENCODED] x-www-form-urlencoded', async () => {
    const result = firstValueFrom(api.invoke(submitForm, { body: { username: 'u', password: 'p', remember: true } }));
    const req = expectSingleRequest(http);
    expect(effectiveContentType(req.request)).toBe('application/x-www-form-urlencoded');
    const body = serializedBody(req.request);
    expect(typeof body).toBe('string');
    const entries = Object.fromEntries(new URLSearchParams(body as string).entries());
    expect(entries).toEqual({ username: 'u', password: 'p', remember: 'true' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
  });

  it('[R-BODY-MULTIPART] multipart/form-data', async () => {
    const file = new Blob(['file-content'], { type: 'text/plain' });
    const attachments = [new Blob(['a1']), new Blob(['a2'])];
    const result = firstValueFrom(api.invoke(uploadFiles, { body: { title: 'T', file, attachments } }));
    const req = expectSingleRequest(http);
    const body = req.request.body;
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get('title')).toBe('T');
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(await blobText(form.get('file') as Blob)).toBe('file-content');
    expect(form.getAll('attachments')).toHaveLength(2);
    expect(req.request.headers.get('Content-Type')).toBeNull();
    req.flush({ ids: ['1'] }, { status: 201, statusText: 'Created' });
    await result;
  });

  it('[R-BODY-MULTIPART-JSON-PART] JSON-Part in multipart', async () => {
    const meta = { author: 'me', tags: ['x'] };
    const result = firstValueFrom(api.invoke(uploadFiles, { body: { title: 'T', file: new Blob(['f']), meta } }));
    const req = expectSingleRequest(http);
    const part = (req.request.body as FormData).get('meta');
    const text = part instanceof Blob ? await blobText(part) : part;
    if (part instanceof Blob) expect(part.type).toBe('application/json');
    expect(text).not.toBe('[object Object]');
    expect(JSON.parse(text as string)).toEqual(meta);
    req.flush({ ids: ['1'] }, { status: 201, statusText: 'Created' });
    await result;
  });

  it('[R-BODY-OCTET] Binary-Body', async () => {
    // Blob ohne eigenen MIME-Typ (z. B. aus new Blob([bytes])) – Spec verlangt application/octet-stream.
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const result = firstValueFrom(api.invoke(uploadBinary, { body: blob }));
    const req = expectSingleRequest(http);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBe(blob);
    expect(effectiveContentType(req.request)).toBe('application/octet-stream');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
  });

  it('[R-BODY-TEXT] text/plain Body', async () => {
    const result = firstValueFrom(api.invoke(postText, { body: 'hello' }));
    const req = expectSingleRequest(http);
    expect(serializedBody(req.request)).toBe('hello');
    expect(effectiveContentType(req.request)).toBe('text/plain');
    req.flush('hello');
    await result;
  });

  it('[R-BODY-POLYMORPHIC] Polymorpher Body unverändert', async () => {
    const result = firstValueFrom(api.invoke(createShape, { body: { kind: 'circle', radius: 2 } }));
    const req = expectSingleRequest(http);
    expect(req.request.body).toEqual({ kind: 'circle', radius: 2 });
    expect(serializedBody(req.request)).toBe(JSON.stringify({ kind: 'circle', radius: 2 }));
    req.flush({ kind: 'circle', radius: 2 }, { status: 201, statusText: 'Created' });
    await result;
  });

  it('[R-NAME-SPECIAL-PROPS] Sonder-Property-Namen am Wire', async () => {
    const payload: WeirdNames = { 'x-request-id': 'r1', '@type': 't', '1stPlace': true, 'with space': 's', snake_case_prop: 'sc', $ref: '#', constructor: 'c' };
    const responseFixture: unknown = JSON.parse(JSON.stringify(payload));
    const result = firstValueFrom(api.invoke(specialProperties, { body: payload }));
    const req = expectSingleRequest(http);
    expect(JSON.parse(serializedBody(req.request) as string)).toEqual(payload);
    req.flush(responseFixture as object);
    const response = await result;
    expect(response['x-request-id']).toBe('r1');
    expect(response['@type']).toBe('t');
    expect(response['1stPlace']).toBe(true);
    expect(response['with space']).toBe('s');
  });

  // ---------------------------------------------------------------- Responses

  it('[R-RESP-204] 204 ohne Body', async () => {
    let completed = false;
    const result = new Promise<void>((resolve, reject) =>
      api.invoke(deletePet, { petId: 1 }).subscribe({ error: reject, complete: () => { completed = true; resolve(); } }),
    );
    const req = expectSingleRequest(http);
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
    expect(completed).toBe(true);
  });

  it('[R-RESP-BLOB] Binary Response als Blob', async () => {
    const result = firstValueFrom(api.invoke(downloadFile));
    const req = expectSingleRequest(http);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['binary-content']));
    const blob = await result;
    expect(blob).toBeInstanceOf(Blob);
    expect(await blobText(blob)).toBe('binary-content');
  });

  it('[R-RESP-TEXT] Text-Response', async () => {
    const result = firstValueFrom(api.invoke(postText, { body: 'hello' }));
    const req = expectSingleRequest(http);
    expect(req.request.responseType).toBe('text');
    req.flush('not { json');
    expect(await result).toBe('not { json');
  });

  it('[R-RESP-VENDOR-JSON] Vendor-JSON geparst', async () => {
    const result = firstValueFrom(api.invoke(getVendorJson));
    const req = expectSingleRequest(http);
    expect(req.request.headers.get('Accept')).toContain('application/vnd.bench.v1+json');
    expect(req.request.responseType).toBe('json');
    req.flush({ name: 'vendor' });
    expect(await result).toEqual({ name: 'vendor' });
  });

  it('[R-ACCEPT-HEADER] Accept-Header passend', async () => {
    const json = firstValueFrom(api.invoke(reportByAccept));
    const jsonReq = expectSingleRequest(http);
    expect(jsonReq.request.headers.get('Accept')).toBe('application/json');
    jsonReq.flush({ title: 'r' });
    await json;
    const pdf = firstValueFrom(api.invoke(reportByAccept$Pdf));
    const pdfReq = expectSingleRequest(http);
    expect(pdfReq.request.headers.get('Accept')).toBe('application/pdf');
    expect(pdfReq.request.responseType).toBe('blob');
    pdfReq.flush(new Blob(['%PDF']));
    await pdf;
  });

  it('[R-RESP-DATE-CONSISTENT] Datums-Typ = Laufzeitwert', async () => {
    const result = firstValueFrom(api.invoke(getDates));
    const req = expectSingleRequest(http);
    req.flush({ date: '2024-01-02', dateTime: '2024-01-02T03:04:05Z' });
    const dates = await result;
    // Typisiert als string → Laufzeitwert muss string sein.
    expect(typeof dates.dateTime).toBe('string');
    expect(typeof dates.date).toBe('string');
  });

  it('[R-RESP-201-LOCATION] Response-Header zugreifbar', async () => {
    const result = firstValueFrom(api.invoke$Response(createPet, { body: PET_BODY }));
    const req = expectSingleRequest(http);
    req.flush(PET_RESPONSE, { status: 201, statusText: 'Created', headers: { Location: 'https://x/pets/1' } });
    const response = await result;
    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe('https://x/pets/1');
    expect(response.body.name).toBe('Bello');
  });

  it('[R-ERROR-BODY] Fehler-Body erreichbar', async () => {
    const result = firstValueFrom(api.invoke(getPet, { petId: 99 }));
    const req = expectSingleRequest(http);
    req.flush(PROBLEM_RESPONSE, { status: 404, statusText: 'Not Found' });
    const error = await result.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(404);
    expect((error as HttpErrorResponse).error.title).toBe('Not Found');
  });

  // ---------------------------------------------------------------- Auth (keine Security-Unterstützung im Generator)

  it.skip('[R-AUTH-BEARER] Bearer-Token — unsupported: ng-openapi-gen ignoriert securitySchemes vollständig; README verweist auf manuelle Interceptors', () => {});
  it.skip('[R-AUTH-APIKEY-HEADER] API-Key Header — unsupported: keine Security-Konfiguration generiert', () => {});
  it.skip('[R-AUTH-APIKEY-QUERY] API-Key Query — unsupported: keine Security-Konfiguration generiert', () => {});
  it.skip('[R-AUTH-BASIC] Basic Auth — unsupported: keine Security-Konfiguration generiert', () => {});
  it.skip('[R-AUTH-OAUTH2] OAuth2 Access-Token — unsupported: keine Security-Konfiguration generiert', () => {});
  it.skip('[R-AUTH-NONE] Keine Credentials bei security: [] — unsupported: es gibt keinen konfigurierbaren Token, security: [] wird nicht ausgewertet', () => {});

  // ---------------------------------------------------------------- Angular

  it('[A-PROVIDE-FN] Standalone-Provider/Config ohne NgModule', () => {
    // setupHttp nutzt ausschließlich providers: [provideApiConfiguration(...)] — kein NgModule.forRoot.
    expect(TestBed.inject(ApiConfiguration).rootUrl).toBe(TEST_BASE_URL);
    expect(api.rootUrl).toBe(TEST_BASE_URL);
  });

  it('[A-BASEURL] Base-URL per DI konfigurierbar', async () => {
    const result = firstValueFrom(api.invoke(getPet, { petId: 1 }));
    const req = expectSingleRequest(http);
    expect(req.request.url).toBe('http://test.local/api/pets/1');
    req.flush(PET_RESPONSE);
    expect((await result).name).toBe('Bello');
  });

  it('[A-HTTPCLIENT] Nutzt Angular HttpClient', async () => {
    const result = firstValueFrom(api.invoke(getPet, { petId: 1 }));
    const req = http.expectOne(`${TEST_BASE_URL}/pets/1`);
    expect(req.request.method).toBe('GET');
    req.flush(PET_RESPONSE);
    await result;
  });

  it('[A-HTTPCONTEXT] HttpContext pro Aufruf', async () => {
    const TOKEN = new HttpContextToken<string>(() => 'default');
    const context = new HttpContext().set(TOKEN, 'per-call');
    const result = firstValueFrom(api.invoke(getPet, { petId: 1 }, context));
    const req = expectSingleRequest(http);
    expect(req.request.context.get(TOKEN)).toBe('per-call');
    req.flush(PET_RESPONSE);
    await result;
  });

  it('[A-OBSERVE-RESPONSE] observe: response / HttpResponse<Pet> typisiert', async () => {
    const response$ = api.invoke$Response(getPet, { petId: 1 });
    const result = firstValueFrom(response$);
    const req = expectSingleRequest(http);
    req.flush(PET_RESPONSE, { headers: { 'X-Custom': 'yes' } });
    const response: HttpResponse<Pet> = await result;
    expect(response).toBeInstanceOf(HttpResponse);
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Custom')).toBe('yes');
    expect(response.body?.name).toBe('Bello');
  });

  it.skip('[A-REPORT-PROGRESS] Upload-Progress — unsupported: weder Api.invoke noch fn/Service-Methoden reichen reportProgress/observe events durch (RequestBuilder.build wird ohne reportProgress aufgerufen, Events werden auf HttpResponse gefiltert)', () => {});

  it('[A-OBSERVABLE-COLD] Cold Observable / Abbruch', () => {
    const pet$ = api.invoke(getPet, { petId: 1 });
    http.expectNone(() => true);
    const subscription = pet$.subscribe();
    const req = expectSingleRequest(http);
    subscription.unsubscribe();
    expect(req.cancelled).toBe(true);
  });

  it.skip('[A-HTTPRESOURCE] httpResource/Signal-API — unsupported: ng-openapi-gen generiert nur Observable/Promise-APIs, keine httpResource/resource-Varianten', () => {});

  it('[A-ZONELESS] Zoneless lauffähig', async () => {
    expect('Zone' in globalThis).toBe(false);
    const result = firstValueFrom(api.invoke(getPet, { petId: 1 }));
    expectSingleRequest(http).flush(PET_RESPONSE);
    expect((await result).id).toBe(1);
  });
});

describe('ng-openapi-gen angular (eigenes TestBed)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('[A-INJECT] Injectable/inject()-kompatibel, providedIn root', async () => {
    // Keine Generator-Provider: Api + ApiConfiguration kommen aus providedIn: 'root'.
    const http = setupHttp();
    const api = TestBed.runInInjectionContext(() => inject(Api));
    expect(api).toBeInstanceOf(Api);
    const result = firstValueFrom(api.invoke(getPet, { petId: 1 }));
    const req = expectSingleRequest(http);
    // Default-Root-URL aus dem ersten Server der Spec
    expect(req.request.url).toBe('https://prod.bench.example.com/api/v1/pets/1');
    req.flush(PET_RESPONSE);
    await result;
  });

  it('[A-INTERCEPTORS] Funktionale Interceptors greifen', async () => {
    const interceptor: HttpInterceptorFn = (req, next) => next(req.clone({ setHeaders: { 'X-Intercepted': '1' } }));
    const http = setupHttp({ interceptors: [interceptor], providers: [provideApiConfiguration(TEST_BASE_URL)] });
    const api = TestBed.inject(Api);
    const result = firstValueFrom(api.invoke(getPet, { petId: 1 }));
    const req = expectSingleRequest(http);
    expect(req.request.headers.get('X-Intercepted')).toBe('1');
    req.flush(PET_RESPONSE);
    await result;
  });
});
