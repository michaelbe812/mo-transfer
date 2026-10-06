/**
 * Runtime- (R-*) und Angular-Tests (A-*) für den NSwag-Angular-Client.
 * Idiomatische API: @Injectable({ providedIn: 'root' })-Client-Klassen pro Tag, Base-URL über InjectionToken API_BASE_URL.
 */
import { inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpContext, HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  API_BASE_URL,
  ApiException,
  AuthClient,
  BodiesClient,
  NamingClient,
  ParamsClient,
  Pet,
  PetsClient,
  PolymorphismClient,
  ResponsesClient,
  WeirdNames,
} from '../client/api';
import {
  PET_RESPONSE,
  PROBLEM_RESPONSE,
  TEST_BASE_URL,
  effectiveContentType,
  expectSingleRequest,
  pathOf,
  queryAll,
  queryEntries,
  rawQueryOf,
  serializedBody,
  setupHttp,
} from '../../../testing/http-harness';
import { flushJson, flushNoContent, flushText, start, startExpectingError } from './nswag-helpers';

const baseUrlProvider = { provide: API_BASE_URL, useValue: TEST_BASE_URL };
const UUID = '123e4567-e89b-12d3-a456-426614174000';
const ECHO = { method: 'GET', url: '/echo' };

const requestPet: Pet = { id: 1, name: 'Bello', status: 'available', photoUrls: ['https://img.example.com/1.png'] };

describe('nswag runtime', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    http = setupHttp({ providers: [baseUrlProvider] });
  });
  afterEach(() => http.verify());

  // ------------------------------------------------------------------ params
  describe('params', () => {
    let params: ParamsClient;
    beforeEach(() => (params = TestBed.inject(ParamsClient)));

    it('[R-PATH-MULTI] mehrere Pfad-Parameter', async () => {
      const result = start(params.multiPathParams('abc', 42, UUID, 'sold'));
      const req = expectSingleRequest(http);
      expect(pathOf(req.request).endsWith(`/params/path/abc/42/${UUID}/sold`)).toBe(true);
      flushJson(req, ECHO);
      await result;
    });

    it('[R-PATH-ENCODE] Pfad-Parameter encodiert (inkl. Slash)', async () => {
      const result = start(params.multiPathParams('a/b c?#', 42, UUID, 'sold'));
      const req = expectSingleRequest(http);
      expect(pathOf(req.request)).toBe(`/api/params/path/a%2Fb%20c%3F%23/42/${UUID}/sold`);
      flushJson(req, ECHO);
      await result;
    });

    it('[R-QUERY-ARRAY-EXPLODE] tagsExplode=a&tagsExplode=b', async () => {
      const result = start(params.queryStyles('r', ['a', 'b']));
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'tagsExplode')).toEqual(['a', 'b']);
      flushJson(req, ECHO);
      await result;
    });

    it('[R-QUERY-ARRAY-NOEXPLODE] tagsCsv=a,b', async () => {
      const result = start(params.queryStyles('r', undefined, ['a', 'b']));
      const req = expectSingleRequest(http);
      // NSwag ignoriert style/explode: sendet tagsCsv=a&tagsCsv=b
      expect(queryAll(req.request, 'tagsCsv')).toEqual(['a,b']);
      flushJson(req, ECHO);
      await result;
    });

    it('[R-QUERY-ARRAY-PIPE] tagsPipe=a|b', async () => {
      const result = start(params.queryStyles('r', undefined, undefined, ['a', 'b']));
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'tagsPipe')).toEqual(['a|b']);
      flushJson(req, ECHO);
      await result;
    });

    it('[R-QUERY-ARRAY-SPACE] tagsSpace=1%202', async () => {
      const result = start(params.queryStyles('r', undefined, undefined, undefined, [1, 2]));
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'tagsSpace')).toEqual(['1 2']);
      flushJson(req, ECHO);
      await result;
    });

    it('[R-QUERY-DEEPOBJECT] filter[name]=rex&filter[status]=sold', async () => {
      const result = start(params.queryStyles('r', undefined, undefined, undefined, undefined, { name: 'rex', status: 'sold' }));
      const req = expectSingleRequest(http);
      // NSwag: filter=[object Object]
      expect(queryAll(req.request, 'filter[name]')).toEqual(['rex']);
      expect(queryAll(req.request, 'filter[status]')).toEqual(['sold']);
      flushJson(req, ECHO);
      await result;
    });

    it('[R-QUERY-FORM-OBJECT] x=1&y=2', async () => {
      const result = start(
        params.queryStyles('r', undefined, undefined, undefined, undefined, undefined, { x: 1, y: 2 }),
      );
      const req = expectSingleRequest(http);
      // NSwag: point=[object Object]
      expect(queryAll(req.request, 'x')).toEqual(['1']);
      expect(queryAll(req.request, 'y')).toEqual(['2']);
      expect(queryAll(req.request, 'point')).toEqual([]);
      flushJson(req, ECHO);
      await result;
    });

    it('[R-QUERY-DATE] since/day ISO (dateTimeType String → Aufrufer übergibt ISO-String)', async () => {
      const result = start(
        params.queryStyles('r', undefined, undefined, undefined, undefined, undefined, undefined, '2024-01-02T03:04:05.000Z', '2024-01-02'),
      );
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'since')).toEqual(['2024-01-02T03:04:05.000Z']);
      expect(queryAll(req.request, 'day')).toEqual(['2024-01-02']);
      flushJson(req, ECHO);
      await result;
    });

    it('[R-QUERY-BOOLEAN] flag=true / flag=false', async () => {
      const resultTrue = start(
        params.queryStyles('r', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true),
      );
      const reqTrue = expectSingleRequest(http);
      expect(queryAll(reqTrue.request, 'flag')).toEqual(['true']);
      flushJson(reqTrue, ECHO);
      await resultTrue;

      const resultFalse = start(
        params.queryStyles('r', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, false),
      );
      const reqFalse = expectSingleRequest(http);
      expect(queryAll(reqFalse.request, 'flag')).toEqual(['false']);
      flushJson(reqFalse, ECHO);
      await resultFalse;
    });

    it('[R-HEADER-PARAM] Header-Parameter', async () => {
      const result = start(params.headerAndCookieParams(UUID, ['a', 'b'], 3));
      const req = expectSingleRequest(http);
      expect(req.request.headers.get('X-Request-Id')).toBe(UUID);
      expect(req.request.headers.get('X-Retry-Count')).toBe('3');
      expect(req.request.headers.get('X-Trace-Flags')).toBe('a,b');
      flushJson(req, ECHO);
      await result;
    });

    it('[R-COOKIE-PARAM] Cookie-Parameter wird als Cookie-Header gesendet', async () => {
      // NSwag bietet den Parameter `session` an, verwirft ihn aber stillschweigend (Parameter ungenutzt).
      const result = start(params.headerAndCookieParams(UUID, undefined, undefined, 'abc'));
      const req = expectSingleRequest(http);
      const cookie = req.request.headers.get('Cookie');
      flushJson(req, ECHO);
      await result;
      expect(cookie).toBe('session=abc');
    });

    it('[R-NAME-RESERVED-PARAM] Originalnamen class/default/page-size/filter.name', () => {
      // NSwag erzeugt für reservedParamNames ungültiges TS (Parametername `class`) → Operation per
      // excludedOperationIds ausgeschlossen, damit der Rest kompiliert. Methode existiert daher nicht.
      expect(typeof Reflect.get(params, 'reservedParamNames')).toBe('function');
    });
  });

  // ------------------------------------------------------------------ pets
  describe('pets', () => {
    let pets: PetsClient;
    beforeEach(() => (pets = TestBed.inject(PetsClient)));

    it('[R-QUERY-PRIMITIVES] limit/offset/status/vaccinated inkl. 0 und false', async () => {
      const result = start(pets.listPets(10, 0, 'sold', false));
      const req = expectSingleRequest(http);
      expect(queryEntries(req.request)).toEqual([
        ['limit', '10'],
        ['offset', '0'],
        ['status', 'sold'],
        ['vaccinated', 'false'],
      ]);
      flushJson(req, { total: 0, limit: 10, offset: 0, items: [] });
      await result;
    });

    it('[R-QUERY-OPTIONAL-OMITTED] listPets() ohne Query', async () => {
      const result = start(pets.listPets());
      const req = expectSingleRequest(http);
      expect(rawQueryOf(req.request)).toBe('');
      expect(req.request.urlWithParams).not.toMatch(/undefined|null/);
      flushJson(req, { total: 0, limit: 20, offset: 0, items: [] });
      await result;
    });

    it('[R-BODY-JSON] createPet sendet JSON', async () => {
      const result = start(pets.createPet(requestPet));
      const req = expectSingleRequest(http);
      expect(req.request.method).toBe('POST');
      const body = serializedBody(req.request);
      expect(typeof body === 'string' ? JSON.parse(body) : body).toEqual(requestPet);
      expect(effectiveContentType(req.request)).toBe('application/json');
      flushJson(req, PET_RESPONSE, { status: 201, statusText: 'Created' });
      await result;
    });

    it('[R-NULL-SEND] nickname: null bleibt im Body', async () => {
      const result = start(pets.updatePet({ ...requestPet, nickname: null }, 1));
      const req = expectSingleRequest(http);
      const body = serializedBody(req.request);
      const parsed: unknown = typeof body === 'string' ? JSON.parse(body) : body;
      expect(parsed).toHaveProperty('nickname', null);
      flushJson(req, PET_RESPONSE);
      await result;
    });

    it('[R-BODY-MERGE-PATCH] PATCH application/merge-patch+json', async () => {
      const result = start(pets.patchPet({ nickname: null, name: 'Rex' }, 1));
      const req = expectSingleRequest(http);
      expect(req.request.method).toBe('PATCH');
      expect(effectiveContentType(req.request)).toBe('application/merge-patch+json');
      const body = serializedBody(req.request);
      expect(typeof body === 'string' ? JSON.parse(body) : body).toEqual({ nickname: null, name: 'Rex' });
      flushJson(req, PET_RESPONSE);
      await result;
    });

    it('[R-RESP-204] deletePet completes bei leerem Body', async () => {
      const result = start(pets.deletePet(1));
      const req = expectSingleRequest(http);
      expect(req.request.method).toBe('DELETE');
      flushNoContent(req);
      await result;
    });

    it('[R-ERROR-BODY] 404 → Fehler mit Problem-Body', async () => {
      const error = startExpectingError(pets.getPet(99));
      const req = expectSingleRequest(http);
      flushJson(req, PROBLEM_RESPONSE, { status: 404, statusText: 'Not Found' });
      const caught = await error;
      expect(caught).toBeInstanceOf(ApiException);
      expect(ApiException.isApiException(caught)).toBe(true);
      if (!ApiException.isApiException(caught)) throw new Error('kein ApiException');
      expect(caught.status).toBe(404);
      expect(caught.result.title).toBe('Not Found');
    });
  });

  // ------------------------------------------------------------------ bodies
  describe('bodies', () => {
    let bodies: BodiesClient;
    beforeEach(() => (bodies = TestBed.inject(BodiesClient)));

    it('[R-BODY-FORM-URLENCODED] username=u&password=p&remember=true', async () => {
      const result = start(bodies.submitForm({ username: 'u', password: 'p', remember: true }));
      const req = expectSingleRequest(http);
      const body = serializedBody(req.request);
      expect(typeof body).toBe('string');
      const entries = [...new URLSearchParams(String(body)).entries()].sort();
      expect(entries).toEqual([
        ['password', 'p'],
        ['remember', 'true'],
        ['username', 'u'],
      ]);
      expect(effectiveContentType(req.request)).toBe('application/x-www-form-urlencoded');
      flushNoContent(req);
      await result;
    });

    it('[R-BODY-MULTIPART] FormData mit title, file, attachments', async () => {
      // meta ist laut Spec optional — NSwag wirft aber "The parameter 'meta' cannot be null." beim Weglassen.
      const result = start(
        bodies.uploadFiles('T', { data: new Blob(['file']), fileName: 'f.txt' }, [
          { data: new Blob(['a1']), fileName: 'a1.txt' },
          { data: new Blob(['a2']), fileName: 'a2.txt' },
        ]),
      );
      const req = expectSingleRequest(http);
      const form = req.request.body;
      expect(form).toBeInstanceOf(FormData);
      if (!(form instanceof FormData)) throw new Error('kein FormData');
      expect(form.get('title')).toBe('T');
      expect(form.get('file')).toBeInstanceOf(Blob);
      expect(form.getAll('attachments')).toHaveLength(2);
      expect(req.request.headers.get('Content-Type')).toBeNull();
      flushJson(req, { ids: ['1'] }, { status: 201, statusText: 'Created' });
      await result;
    });

    it('[R-BODY-MULTIPART-JSON-PART] meta-Part als JSON', async () => {
      const result = start(
        bodies.uploadFiles('T', { data: new Blob(['file']), fileName: 'f.txt' }, [], { author: 'me', tags: ['x'] }),
      );
      const req = expectSingleRequest(http);
      const form = req.request.body;
      if (!(form instanceof FormData)) throw new Error('kein FormData');
      const meta = form.get('meta');
      const metaText = meta instanceof Blob ? await meta.text() : meta;
      expect(JSON.parse(String(metaText))).toEqual({ author: 'me', tags: ['x'] });
      expect(metaText).not.toBe('[object Object]');
      flushJson(req, { ids: ['1'] }, { status: 201, statusText: 'Created' });
      await result;
    });

    it('[R-BODY-OCTET] PUT Blob application/octet-stream', async () => {
      // Audit: Blob ohne eigenen MIME-Typ (wie bei den anderen Generatoren), sonst leitet HttpClient den Content-Type aus dem Blob ab.
      const blob = new Blob(['bin']);
      const result = start(bodies.uploadBinary(blob));
      const req = expectSingleRequest(http);
      expect(req.request.method).toBe('PUT');
      expect(serializedBody(req.request)).toBe(blob);
      expect(effectiveContentType(req.request)).toBe('application/octet-stream');
      flushNoContent(req);
      await result;
    });

    it('[R-BODY-TEXT] text/plain Body ungequotet', async () => {
      const result = start(bodies.postText('hello'));
      const req = expectSingleRequest(http);
      expect(serializedBody(req.request)).toBe('hello');
      expect(effectiveContentType(req.request)).toBe('text/plain');
      flushText(req, 'hello');
      await result;
    });

    it('[R-RESP-TEXT] responseType text, roher String', async () => {
      const result = start(bodies.postText('hello'));
      const req = expectSingleRequest(http);
      const responseType = req.request.responseType;
      flushText(req, 'plain text, kein JSON');
      expect(await result).toBe('plain text, kein JSON');
      // NSwag fordert immer responseType 'blob' an und dekodiert selbst.
      expect(responseType).toBe('text');
    });
  });

  // ------------------------------------------------------------------ responses
  describe('responses', () => {
    let responses: ResponsesClient;
    beforeEach(() => (responses = TestBed.inject(ResponsesClient)));

    it('[R-RESP-BLOB] responseType blob, Ergebnis Blob', async () => {
      const result = start(responses.downloadFile());
      const req = expectSingleRequest(http);
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['payload']));
      const value = await result;
      // NSwag liefert FileResponse { data: Blob, … } statt Blob
      expect(value).toBeInstanceOf(Blob);
    });

    it('[R-RESP-VENDOR-JSON] application/vnd.bench.v1+json wird geparst', async () => {
      const result = start(responses.getVendorJson());
      const req = expectSingleRequest(http);
      expect(req.request.headers.get('Accept')).toContain('application/vnd.bench.v1+json');
      flushText(req, JSON.stringify({ name: 'vendor' }), 'application/vnd.bench.v1+json');
      const value = await result;
      expect(typeof value).toBe('object');
      expect(value.name).toBe('vendor');
    });

    it('[R-ACCEPT-HEADER] JSON-Variante Accept application/json (PDF-Variante nicht wählbar)', async () => {
      const result = start(responses.reportByAccept());
      const req = expectSingleRequest(http);
      expect(req.request.headers.get('Accept')).toBe('application/json');
      flushJson(req, { title: 'R' });
      expect((await result).title).toBe('R');
    });

    it('[R-RESP-DATE-CONSISTENT] dateTime als string typisiert → string', async () => {
      const result = start(responses.getDates());
      const req = expectSingleRequest(http);
      flushJson(req, { date: '2024-01-02', dateTime: '2024-01-02T03:04:05Z' });
      const value = await result;
      expect(typeof value.dateTime).toBe('string');
      expect(value.dateTime).toBe('2024-01-02T03:04:05Z');
    });
  });

  // ------------------------------------------------------------------ polymorphism + naming
  describe('polymorphism & naming', () => {
    it('[R-BODY-POLYMORPHIC] Shape unverändert gesendet', async () => {
      const polymorphism = TestBed.inject(PolymorphismClient);
      const result = start(polymorphism.createShape({ kind: 'circle', radius: 2 }));
      const req = expectSingleRequest(http);
      const body = serializedBody(req.request);
      expect(typeof body === 'string' ? JSON.parse(body) : body).toEqual({ kind: 'circle', radius: 2 });
      flushJson(req, { kind: 'circle', radius: 2 }, { status: 201, statusText: 'Created' });
      await result;
    });

    it('[R-NAME-SPECIAL-PROPS] Originalnamen in Request und Response', async () => {
      const naming = TestBed.inject(NamingClient);
      const payload: WeirdNames = {
        'x-request-id': 'r',
        '@type': 't',
        '1stPlace': true,
        'with space': 's',
        snake_case_prop: 'p',
        class: 'c',
        default: 'd',
        delete: false,
        // constructor muss explizit gesetzt sein: sonst kollidiert Object.prototype.constructor (Function) mit `constructor?: string`
        constructor: 'k',
      };
      const result = start(naming.specialProperties(payload));
      const req = expectSingleRequest(http);
      const body = serializedBody(req.request);
      expect(typeof body === 'string' ? JSON.parse(body) : body).toEqual(payload);
      flushJson(req, payload);
      const value = await result;
      expect(value['x-request-id']).toBe('r');
      expect(value['@type']).toBe('t');
      expect(value['1stPlace']).toBe(true);
      expect(value['with space']).toBe('s');
    });
  });

  // ------------------------------------------------------------------ angular
  describe('angular', () => {
    it('[A-PROVIDE-FN] Base-URL über DI-Token in providers (ohne NgModule)', async () => {
      const pets = TestBed.inject(PetsClient);
      const result = start(pets.getPet(1));
      const req = expectSingleRequest(http);
      expect(req.request.url.startsWith(TEST_BASE_URL)).toBe(true);
      flushJson(req, PET_RESPONSE);
      await result;
    });

    it('[A-BASEURL] getPet(1) → http://test.local/api/pets/1', async () => {
      const pets = TestBed.inject(PetsClient);
      const result = start(pets.getPet(1));
      const req = expectSingleRequest(http);
      expect(req.request.url).toBe(`${TEST_BASE_URL}/pets/1`);
      flushJson(req, PET_RESPONSE);
      expect((await result).name).toBe('Bello');
    });

    it('[A-INJECT] inject() ohne manuelles Providen (providedIn root)', () => {
      const pets = TestBed.runInInjectionContext(() => inject(PetsClient));
      expect(pets).toBeInstanceOf(PetsClient);
    });

    it('[A-HTTPCLIENT] Requests über HttpClient', async () => {
      const pets = TestBed.inject(PetsClient);
      const result = start(pets.listPets());
      const req = http.expectOne(`${TEST_BASE_URL}/pets`);
      flushJson(req, { total: 0, limit: 20, offset: 0, items: [] });
      expect((await result).items).toEqual([]);
    });

    it('[A-HTTPCONTEXT] HttpContext pro Aufruf', async () => {
      const TOKEN = new HttpContextToken<string>(() => 'default');
      const pets = TestBed.inject(PetsClient);
      const result = start(pets.getPet(1, new HttpContext().set(TOKEN, 'custom')));
      const req = expectSingleRequest(http);
      expect(req.request.context.get(TOKEN)).toBe('custom');
      flushJson(req, PET_RESPONSE);
      await result;
    });

    it('[A-OBSERVABLE-COLD] kein Request vor subscribe, unsubscribe bricht ab', () => {
      const pets = TestBed.inject(PetsClient);
      const source = pets.getPet(1);
      http.expectNone(() => true);
      const subscription = source.subscribe();
      const req = expectSingleRequest(http);
      subscription.unsubscribe();
      expect(req.cancelled).toBe(true);
    });

    it('[A-ZONELESS] läuft zoneless (ohne zone.js)', async () => {
      expect(Reflect.get(globalThis, 'Zone')).toBeUndefined();
      const pets = TestBed.inject(PetsClient);
      const result = start(pets.getPet(1));
      flushJson(expectSingleRequest(http), PET_RESPONSE);
      expect((await result).id).toBe(1);
    });
  });
});

describe('nswag angular: interceptors', () => {
  let http: HttpTestingController;
  const intercept: HttpInterceptorFn = (req, next) => next(req.clone({ setHeaders: { 'X-Intercepted': 'yes' } }));

  beforeEach(() => {
    http = setupHttp({ providers: [baseUrlProvider], interceptors: [intercept] });
  });
  afterEach(() => http.verify());

  it('[A-INTERCEPTORS] funktionaler Interceptor greift', async () => {
    const pets = TestBed.inject(PetsClient);
    const result = start(pets.getPet(1));
    const req = expectSingleRequest(http);
    expect(req.request.headers.get('X-Intercepted')).toBe('yes');
    flushJson(req, PET_RESPONSE);
    await result;
  });
});

describe('nswag unsupported', () => {
  it.skip('[R-RESP-201-LOCATION] — unsupported: Status/Header nur über wrapResponses (global, ändert alle Signaturen auf SwaggerResponse<T>), kein per-Aufruf observe', () => {});
  it.skip('[A-OBSERVE-RESPONSE] — unsupported: keine observe-Option pro Aufruf; nur global wrapResponses (SwaggerResponse<T>, kein HttpResponse)', () => {});
  it.skip('[A-REPORT-PROGRESS] — unsupported: options_ fest verdrahtet (observe: response, responseType: blob), kein reportProgress', () => {});
  it.skip('[A-HTTPRESOURCE] — unsupported: keine Signal-/httpResource-API, nur Observables', () => {});
  it.skip('[R-AUTH-BEARER] — unsupported: TS-Client ignoriert securitySchemes, keine generierte Auth-Konfiguration', () => {});
  it.skip('[R-AUTH-APIKEY-HEADER] — unsupported: keine generierte Auth-Konfiguration', () => {});
  it.skip('[R-AUTH-APIKEY-QUERY] — unsupported: keine generierte Auth-Konfiguration', () => {});
  it.skip('[R-AUTH-BASIC] — unsupported: keine generierte Auth-Konfiguration', () => {});
  it.skip('[R-AUTH-OAUTH2] — unsupported: keine generierte Auth-Konfiguration', () => {});
  it.skip('[R-AUTH-NONE] — unsupported: ohne Token-Konfiguration nicht prüfbar (security: [] wird nicht ausgewertet)', () => {});
  void AuthClient;
});
