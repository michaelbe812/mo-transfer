/**
 * Runtime (R-*) + Angular (A-*) für OpenAPI Generator typescript-angular.
 * Imports gezielt aus einzelnen Service-Dateien (nicht index.ts/api.ts): client/model/shape.ts ist syntaktisch
 * kaputt (`export type Shape = ;`) und würde über polymorphism.service.ts den Test-Build abbrechen.
 */
import { TestBed } from '@angular/core/testing';
import { HttpContext, HttpContextToken, HttpErrorResponse, HttpEventType, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { PetsService } from '../client/api/pets.service';
import { ParamsService } from '../client/api/params.service';
import { BodiesService } from '../client/api/bodies.service';
import { ResponsesService } from '../client/api/responses.service';
import { NamingService } from '../client/api/naming.service';
import { AuthService } from '../client/api/auth.service';
import { provideApi } from '../client/provide-api';
import { ConfigurationParameters } from '../client/configuration';
import { Pet } from '../client/model/pet';
import { WeirdNames } from '../client/model/weird-names';
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

const ECHO = { method: 'GET', url: '/', headers: {} };
const PET_BODY: Pet = { id: 1, name: 'Bello', status: 'available', photoUrls: [], nickname: null };

function setup(config: ConfigurationParameters = {}, interceptors: HttpInterceptorFn[] = []): HttpTestingController {
  return setupHttp({ providers: [provideApi({ basePath: TEST_BASE_URL, ...config })], interceptors });
}

/** Query-String so, wie er nach URL-Normalisierung (Browser) auf die Leitung geht. */
function wireQuery(url: string): string {
  return new URL(url).search.replace(/^\?/, '');
}

describe('openapi-generator runtime', () => {
  let http: HttpTestingController;
  afterEach(() => http?.verify());

  // ---------------------------------------------------------------- Parameter
  describe('params', () => {
    beforeEach(() => (http = setup()));

    it('[R-PATH-MULTI] mehrere Pfad-Parameter', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = firstValueFrom(TestBed.inject(ParamsService).multiPathParams({ stringId: 'abc', intId: 42, uuidId: uuid, enumId: 'sold' }));
      const req = expectSingleRequest(http);
      expect(pathOf(req.request)).toMatch(new RegExp(`/params/path/abc/42/${uuid}/sold$`));
      req.flush(ECHO);
      await result;
    });

    it('[R-PATH-ENCODE] Slash & Sonderzeichen encodiert', async () => {
      const result = firstValueFrom(TestBed.inject(ParamsService).multiPathParams({ stringId: 'a/b c?#', intId: 1, uuidId: 'u', enumId: 'sold' }));
      const req = expectSingleRequest(http);
      expect(req.request.url).toContain('/params/path/a%2Fb%20c%3F%23/1/u/sold');
      req.flush(ECHO);
      await result;
    });

    it('[R-QUERY-PRIMITIVES] 0 und false werden gesendet', async () => {
      const result = firstValueFrom(TestBed.inject(PetsService).listPets({ limit: 10, offset: 0, status: 'sold', vaccinated: false }));
      const req = expectSingleRequest(http);
      expect(queryEntries(req.request)).toEqual([['limit', '10'], ['offset', '0'], ['status', 'sold'], ['vaccinated', 'false']]);
      req.flush({ total: 0, limit: 10, offset: 0, items: [] });
      await result;
    });

    it('[R-QUERY-OPTIONAL-OMITTED] keine Query-Parameter', async () => {
      const result = firstValueFrom(TestBed.inject(PetsService).listPets());
      const req = expectSingleRequest(http);
      expect(rawQueryOf(req.request)).toBe('');
      expect(req.request.urlWithParams).not.toMatch(/undefined|null/);
      req.flush({ total: 0, limit: 20, offset: 0, items: [] });
      await result;
    });

    it('[R-QUERY-ARRAY-EXPLODE] tagsExplode=a&tagsExplode=b', async () => {
      const result = firstValueFrom(TestBed.inject(ParamsService).queryStyles({ required: 'r', tagsExplode: ['a', 'b'] }));
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'tagsExplode')).toEqual(['a', 'b']);
      req.flush(ECHO);
      await result;
    });

    it('[R-QUERY-ARRAY-NOEXPLODE] tagsCsv=a,b', async () => {
      const result = firstValueFrom(TestBed.inject(ParamsService).queryStyles({ required: 'r', tagsCsv: ['a', 'b'] }));
      const req = expectSingleRequest(http);
      expect(wireQuery(req.request.urlWithParams)).toMatch(/(^|&)tagsCsv=a(,|%2C)b(&|$)/);
      req.flush(ECHO);
      await result;
    });

    it('[R-QUERY-ARRAY-PIPE] tagsPipe=a|b', async () => {
      const result = firstValueFrom(TestBed.inject(ParamsService).queryStyles({ required: 'r', tagsPipe: ['a', 'b'] }));
      const req = expectSingleRequest(http);
      expect(wireQuery(req.request.urlWithParams)).toMatch(/(^|&)tagsPipe=a(\||%7C)b(&|$)/);
      req.flush(ECHO);
      await result;
    });

    it('[R-QUERY-ARRAY-SPACE] tagsSpace=1%202', async () => {
      const result = firstValueFrom(TestBed.inject(ParamsService).queryStyles({ required: 'r', tagsSpace: [1, 2] }));
      const req = expectSingleRequest(http);
      // Hinweis: Angular-URL enthält ein rohes Leerzeichen; der Browser normalisiert es beim Senden zu %20
      expect(wireQuery(req.request.urlWithParams)).toMatch(/(^|&)tagsSpace=1(%20|\+)2(&|$)/);
      req.flush(ECHO);
      await result;
    });

    it('[R-QUERY-DEEPOBJECT] filter[name]=rex&filter[status]=sold', async () => {
      const result = firstValueFrom(TestBed.inject(ParamsService).queryStyles({ required: 'r', filter: { name: 'rex', status: 'sold' } }));
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'filter[name]')).toEqual(['rex']);
      expect(queryAll(req.request, 'filter[status]')).toEqual(['sold']);
      req.flush(ECHO);
      await result;
    });

    it('[R-QUERY-FORM-OBJECT] point → x=1&y=2', async () => {
      const result = firstValueFrom(TestBed.inject(ParamsService).queryStyles({ required: 'r', point: { x: 1, y: 2 } }));
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'x')).toEqual(['1']);
      expect(queryAll(req.request, 'y')).toEqual(['2']);
      expect(queryAll(req.request, 'point')).toEqual([]);
      req.flush(ECHO);
      await result;
    });

    it('[R-QUERY-DATE] since ISO, day YYYY-MM-DD', async () => {
      // since/day sind als string typisiert → ISO-String wird durchgereicht
      const result = firstValueFrom(TestBed.inject(ParamsService).queryStyles({ required: 'r', since: '2024-01-02T03:04:05.000Z', day: '2024-01-02' }));
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'since')[0]).toMatch(/^2024-01-02T03:04:05(\.000)?Z$/);
      expect(queryAll(req.request, 'day')).toEqual(['2024-01-02']);
      req.flush(ECHO);
      await result;
    });

    it('[R-QUERY-BOOLEAN] flag=true / flag=false', async () => {
      const service = TestBed.inject(ParamsService);
      const r1 = firstValueFrom(service.queryStyles({ required: 'r', flag: true }));
      const req1 = expectSingleRequest(http);
      expect(queryAll(req1.request, 'flag')).toEqual(['true']);
      req1.flush(ECHO);
      await r1;
      const r2 = firstValueFrom(service.queryStyles({ required: 'r', flag: false }));
      const req2 = expectSingleRequest(http);
      expect(queryAll(req2.request, 'flag')).toEqual(['false']);
      req2.flush(ECHO);
      await r2;
    });

    it('[R-HEADER-PARAM] Header-Parameter', async () => {
      const result = firstValueFrom(TestBed.inject(ParamsService).headerAndCookieParams({ xRequestId: 'rid', xRetryCount: 3, xTraceFlags: ['a', 'b'] }));
      const req = expectSingleRequest(http);
      expect(req.request.headers.get('X-Request-Id')).toBe('rid');
      expect(req.request.headers.get('X-Retry-Count')).toBe('3');
      expect(req.request.headers.get('X-Trace-Flags')).toBe('a,b');
      req.flush(ECHO);
      await result;
    });

    it('[R-COOKIE-PARAM] Cookie-Parameter setzt Cookie-Header', async () => {
      // Generator bietet `session` im Request-Interface an, ignoriert ihn aber beim Senden
      const result = firstValueFrom(TestBed.inject(ParamsService).headerAndCookieParams({ xRequestId: 'rid', session: 'abc' }));
      const req = expectSingleRequest(http);
      const cookie = req.request.headers.get('Cookie');
      req.flush(ECHO);
      await result;
      expect(cookie).toBe('session=abc');
    });

    it('[R-NAME-RESERVED-PARAM] Originalnamen in Pfad/Query', async () => {
      const result = firstValueFrom(TestBed.inject(ParamsService).reservedParamNames({ _class: 'x', _default: 'd', pageSize: 5, filterName: 'n' }));
      const req = expectSingleRequest(http);
      expect(pathOf(req.request)).toMatch(/\/params\/reserved\/x$/);
      expect(queryEntries(req.request)).toEqual([['default', 'd'], ['page-size', '5'], ['filter.name', 'n']]);
      req.flush(ECHO);
      await result;
    });
  });

  // ---------------------------------------------------------------- Bodies
  describe('bodies', () => {
    beforeEach(() => (http = setup()));

    it('[R-BODY-JSON] createPet POST JSON', async () => {
      const body: Pet = { ...PET_BODY };
      const result = firstValueFrom(TestBed.inject(PetsService).createPet({ pet: body }));
      const req = expectSingleRequest(http);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      expect(effectiveContentType(req.request)).toMatch(/^application\/json/);
      req.flush(PET_RESPONSE, { status: 201, statusText: 'Created' });
      await result;
    });

    it('[R-NULL-SEND] nickname: null bleibt im Body', async () => {
      const result = firstValueFrom(TestBed.inject(PetsService).updatePet({ petId: 1, pet: { ...PET_BODY, nickname: null } }));
      const req = expectSingleRequest(http);
      const sent = JSON.parse(String(serializedBody(req.request)));
      expect(sent).toHaveProperty('nickname', null);
      req.flush(PET_RESPONSE);
      await result;
    });

    it('[R-BODY-MERGE-PATCH] PATCH merge-patch+json', async () => {
      const result = firstValueFrom(TestBed.inject(PetsService).patchPet({ petId: 1, petPatch: { nickname: null, name: 'n' } }));
      const req = expectSingleRequest(http);
      expect(req.request.method).toBe('PATCH');
      expect(effectiveContentType(req.request)).toMatch(/^application\/merge-patch\+json/);
      expect(JSON.parse(String(serializedBody(req.request)))).toEqual({ nickname: null, name: 'n' });
      req.flush(PET_RESPONSE);
      await result;
    });

    it('[R-BODY-FORM-URLENCODED] submitForm urlencoded', async () => {
      const result = firstValueFrom(TestBed.inject(BodiesService).submitForm({ username: 'u', password: 'p', remember: true }));
      const req = expectSingleRequest(http);
      const body = serializedBody(req.request);
      expect(typeof body).toBe('string');
      expect([...new URLSearchParams(String(body)).entries()].sort()).toEqual([['password', 'p'], ['remember', 'true'], ['username', 'u']]);
      expect(effectiveContentType(req.request)).toMatch(/^application\/x-www-form-urlencoded/);
      req.flush(null, { status: 204, statusText: 'No Content' });
      await result;
    });

    it('[R-BODY-MULTIPART] FormData ohne manuellen Content-Type', async () => {
      const file = new Blob(['f'], { type: 'text/plain' });
      const result = firstValueFrom(
        TestBed.inject(BodiesService).uploadFiles({ title: 't', file, attachments: [new Blob(['a1']), new Blob(['a2'])] }),
      );
      const req = expectSingleRequest(http);
      const body = req.request.body;
      expect(body).toBeInstanceOf(FormData);
      const form = body as FormData;
      expect(form.get('title')).toBe('t');
      expect(form.get('file')).toBeInstanceOf(Blob);
      expect(form.getAll('attachments')).toHaveLength(2);
      expect(req.request.headers.has('Content-Type')).toBe(false);
      req.flush({ ids: ['1'] }, { status: 201, statusText: 'Created' });
      await result;
    });

    it('[R-BODY-MULTIPART-JSON-PART] meta als JSON-Part', async () => {
      const result = firstValueFrom(
        TestBed.inject(BodiesService).uploadFiles({ title: 't', file: new Blob(['f']), meta: { author: 'me', tags: ['x'] } }),
      );
      const req = expectSingleRequest(http);
      const meta = (req.request.body as FormData).get('meta');
      let metaText: string;
      if (meta instanceof Blob) {
        expect(meta.type).toBe('application/json');
        metaText = await blobText(meta);
      } else {
        metaText = String(meta);
      }
      expect(JSON.parse(metaText)).toEqual({ author: 'me', tags: ['x'] });
      req.flush({ ids: ['1'] }, { status: 201, statusText: 'Created' });
      await result;
    });

    it('[R-BODY-OCTET] uploadBinary PUT octet-stream', async () => {
      const blob = new Blob([new Uint8Array([1, 2, 3])]);
      const result = firstValueFrom(TestBed.inject(BodiesService).uploadBinary({ body: blob }));
      const req = expectSingleRequest(http);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toBe(blob);
      expect(effectiveContentType(req.request)).toBe('application/octet-stream');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await result;
    });

    it('[R-BODY-TEXT] postText roher String', async () => {
      const result = firstValueFrom(TestBed.inject(BodiesService).postText({ body: 'hello' }));
      const req = expectSingleRequest(http);
      expect(serializedBody(req.request)).toBe('hello');
      expect(effectiveContentType(req.request)).toMatch(/^text\/plain/);
      req.flush('hello');
      await result;
    });

    it('[R-BODY-POLYMORPHIC] createShape sendet {kind, radius} unverändert', () => {
      // Nicht ausführbar: polymorphism.service.ts importiert client/model/shape.ts, das ungültiges TypeScript
      // enthält (`export type Shape = ;`, TS1110). Der Import würde den gesamten Test-Build abbrechen.
      // Feature ist generiert, aber kaputt → ehrlicher Fehlschlag.
      throw new Error('generated client/model/shape.ts does not compile (TS1110: export type Shape = ;) → createShape unusable');
    });

    it('[R-NAME-SPECIAL-PROPS] Originalnamen am Wire', async () => {
      // `constructor?: string` im Interface: Objekt-Literale ohne explizites constructor sind NICHT zuweisbar
      // (geerbtes Object#constructor: Function kollidiert) → constructor muss mitgegeben werden (s. NOTES.md)
      const body: WeirdNames = { 'x-request-id': 'r', '@type': 't', '1stPlace': true, snake_case_prop: 's', 'with space': 'w', constructor: 'c' };
      const result = firstValueFrom(TestBed.inject(NamingService).specialProperties({ weirdNames: body }));
      const req = expectSingleRequest(http);
      const sent = JSON.parse(String(serializedBody(req.request)));
      expect(sent).toEqual(body);
      req.flush({ 'x-request-id': 'r2', '@type': 't2', '1stPlace': false });
      const parsed = await result;
      expect(parsed['x-request-id']).toBe('r2');
      expect(parsed['@type']).toBe('t2');
      expect(parsed['1stPlace']).toBe(false);
    });
  });

  // ---------------------------------------------------------------- Responses
  describe('responses', () => {
    beforeEach(() => (http = setup()));

    it('[R-RESP-204] deletePet completes bei leerem Body', async () => {
      const result = firstValueFrom(TestBed.inject(PetsService).deletePet({ petId: 1 }), { defaultValue: 'completed-empty' });
      const req = expectSingleRequest(http);
      req.flush(null, { status: 204, statusText: 'No Content' });
      // resolved (statt rejected) = completes ohne Fehler
      await expect(result).resolves.toBeNull();
    });

    it('[R-RESP-BLOB] downloadFile responseType blob', async () => {
      const result = firstValueFrom(TestBed.inject(ResponsesService).downloadFile());
      const req = expectSingleRequest(http);
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['data']));
      const blob = await result;
      expect(blob).toBeInstanceOf(Blob);
      expect(await blobText(blob)).toBe('data');
    });

    it('[R-RESP-TEXT] postText responseType text', async () => {
      const result = firstValueFrom(TestBed.inject(BodiesService).postText({ body: 'x' }));
      const req = expectSingleRequest(http);
      expect(req.request.responseType).toBe('text');
      req.flush('not json {');
      expect(await result).toBe('not json {');
    });

    it('[R-RESP-VENDOR-JSON] vendor JSON wird geparst', async () => {
      const result = firstValueFrom(TestBed.inject(ResponsesService).getVendorJson());
      const req = expectSingleRequest(http);
      expect(req.request.headers.get('Accept')).toContain('application/vnd.bench.v1+json');
      expect(req.request.responseType).toBe('json');
      req.flush({ name: 'tag' });
      expect(await result).toEqual({ name: 'tag' });
    });

    it('[R-ACCEPT-HEADER] JSON → application/json, PDF → application/pdf + blob', async () => {
      const service = TestBed.inject(ResponsesService);
      const json = firstValueFrom(service.reportByAccept());
      const reqJson = expectSingleRequest(http);
      expect(reqJson.request.headers.get('Accept')).toBe('application/json');
      expect(reqJson.request.responseType).toBe('json');
      reqJson.flush({ title: 'r' });
      await json;

      const pdf = firstValueFrom(service.reportByAccept('body', false, { httpHeaderAccept: 'application/pdf' }));
      const reqPdf = expectSingleRequest(http);
      expect(reqPdf.request.headers.get('Accept')).toBe('application/pdf');
      expect(reqPdf.request.responseType).toBe('blob');
      reqPdf.flush(new Blob(['%PDF']));
      await pdf;
    });

    it('[R-RESP-DATE-CONSISTENT] dateTime als string typisiert → string', async () => {
      const result = firstValueFrom(TestBed.inject(ResponsesService).getDates());
      expectSingleRequest(http).flush({ date: '2024-01-02', dateTime: '2024-01-02T03:04:05Z' });
      const value = await result;
      expect(typeof value.dateTime).toBe('string');
      expect(value.dateTime).toBe('2024-01-02T03:04:05Z');
    });

    it('[R-RESP-201-LOCATION] Status 201 + Location via observe response', async () => {
      const result = firstValueFrom(TestBed.inject(PetsService).createPet({ pet: PET_BODY }, 'response'));
      expectSingleRequest(http).flush(PET_RESPONSE, { status: 201, statusText: 'Created', headers: { Location: '/pets/1' } });
      const response = await result;
      expect(response.status).toBe(201);
      expect(response.headers.get('Location')).toBe('/pets/1');
    });

    it('[R-ERROR-BODY] 404 → error mit Problem-Body', async () => {
      const result = firstValueFrom(TestBed.inject(PetsService).getPet({ petId: 99 }));
      expectSingleRequest(http).flush(PROBLEM_RESPONSE, { status: 404, statusText: 'Not Found' });
      const error = await result.then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).error.title).toBe('Not Found');
    });
  });

  // ---------------------------------------------------------------- Auth
  describe('auth', () => {
    it('[R-AUTH-BEARER] credentials.bearerAuth → Bearer', async () => {
      http = setup({ credentials: { bearerAuth: 'tok' } });
      const result = firstValueFrom(TestBed.inject(AuthService).authBearer(), { defaultValue: null });
      const req = expectSingleRequest(http);
      expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await result;
    });

    it('[R-AUTH-APIKEY-HEADER] X-API-Key nur bei dieser Operation', async () => {
      http = setup({ credentials: { apiKeyHeader: 'key' } });
      const auth = TestBed.inject(AuthService);
      const r1 = firstValueFrom(auth.authApiKeyHeader(), { defaultValue: null });
      const req1 = expectSingleRequest(http);
      expect(req1.request.headers.get('X-API-Key')).toBe('key');
      req1.flush(null, { status: 204, statusText: 'No Content' });
      await r1;
      const r2 = firstValueFrom(auth.authBearer(), { defaultValue: null });
      const req2 = expectSingleRequest(http);
      expect(req2.request.headers.has('X-API-Key')).toBe(false);
      req2.flush(null, { status: 204, statusText: 'No Content' });
      await r2;
    });

    it('[R-AUTH-APIKEY-QUERY] ?api_key=<key>', async () => {
      http = setup({ credentials: { apiKeyQuery: 'key' } });
      const result = firstValueFrom(TestBed.inject(AuthService).authApiKeyQuery(), { defaultValue: null });
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'api_key')).toEqual(['key']);
      req.flush(null, { status: 204, statusText: 'No Content' });
      await result;
    });

    it('[R-AUTH-BASIC] username/password → Basic', async () => {
      http = setup({ username: 'user', password: 'pass' });
      const result = firstValueFrom(TestBed.inject(AuthService).authBasic(), { defaultValue: null });
      const req = expectSingleRequest(http);
      expect(req.request.headers.get('Authorization')).toBe(`Basic ${btoa('user:pass')}`);
      req.flush(null, { status: 204, statusText: 'No Content' });
      await result;
    });

    it('[R-AUTH-OAUTH2] credentials.oauth2 → Bearer', async () => {
      http = setup({ credentials: { oauth2: 'access' } });
      const result = firstValueFrom(TestBed.inject(AuthService).authOauth2(), { defaultValue: null });
      const req = expectSingleRequest(http);
      expect(req.request.headers.get('Authorization')).toBe('Bearer access');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await result;
    });

    it('[R-AUTH-NONE] security: [] → kein Authorization', async () => {
      http = setup({ credentials: { bearerAuth: 'tok' } });
      const result = firstValueFrom(TestBed.inject(AuthService).authPublic(), { defaultValue: null });
      const req = expectSingleRequest(http);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush(null, { status: 204, statusText: 'No Content' });
      await result;
    });
  });

  // ---------------------------------------------------------------- Angular
  describe('angular', () => {
    it('[A-PROVIDE-FN] provideApi() in providers ohne NgModule', async () => {
      http = setupHttp({ providers: [provideApi({ basePath: TEST_BASE_URL })] });
      const result = firstValueFrom(TestBed.inject(PetsService).getPet({ petId: 1 }));
      const req = expectSingleRequest(http);
      expect(req.request.url.startsWith(TEST_BASE_URL)).toBe(true);
      req.flush(PET_RESPONSE);
      await result;
    });

    it('[A-BASEURL] getPet(1) → http://test.local/api/pets/1', async () => {
      http = setupHttp({ providers: [provideApi(TEST_BASE_URL)] });
      const result = firstValueFrom(TestBed.inject(PetsService).getPet({ petId: 1 }));
      const req = expectSingleRequest(http);
      expect(req.request.url).toBe('http://test.local/api/pets/1');
      req.flush(PET_RESPONSE);
      expect((await result).name).toBe('Bello');
    });

    it('[A-INJECT] Service via inject() ohne manuelles Providen', async () => {
      http = setup();
      const service = TestBed.runInInjectionContext(() => TestBed.inject(PetsService));
      expect(service).toBeInstanceOf(PetsService);
      const result = firstValueFrom(service.getPet({ petId: 1 }));
      expectSingleRequest(http).flush(PET_RESPONSE);
      await result;
    });

    it('[A-HTTPCLIENT] Requests über HttpClient', async () => {
      http = setup();
      const result = firstValueFrom(TestBed.inject(PetsService).getPet({ petId: 1 }));
      const req = http.expectOne(`${TEST_BASE_URL}/pets/1`);
      expect(req.request.method).toBe('GET');
      req.flush(PET_RESPONSE);
      await result;
    });

    it('[A-INTERCEPTORS] funktionaler Interceptor greift', async () => {
      const intercept: HttpInterceptorFn = (req, next) => next(req.clone({ setHeaders: { 'X-Intercepted': '1' } }));
      http = setup({}, [intercept]);
      const result = firstValueFrom(TestBed.inject(PetsService).getPet({ petId: 1 }));
      const req = expectSingleRequest(http);
      expect(req.request.headers.get('X-Intercepted')).toBe('1');
      req.flush(PET_RESPONSE);
      await result;
    });

    it('[A-HTTPCONTEXT] HttpContext pro Aufruf', async () => {
      http = setup();
      const TOKEN = new HttpContextToken<string>(() => 'default');
      const context = new HttpContext().set(TOKEN, 'custom');
      const result = firstValueFrom(TestBed.inject(PetsService).getPet({ petId: 1 }, 'body', false, { context }));
      const req = expectSingleRequest(http);
      expect(req.request.context.get(TOKEN)).toBe('custom');
      req.flush(PET_RESPONSE);
      await result;
    });

    it('[A-OBSERVE-RESPONSE] HttpResponse<Pet> typisiert', async () => {
      http = setup();
      const result = firstValueFrom(TestBed.inject(PetsService).getPet({ petId: 1 }, 'response'));
      expectSingleRequest(http).flush(PET_RESPONSE, { headers: { 'X-Foo': 'bar' } });
      const response: HttpResponse<Pet> = await result;
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Foo')).toBe('bar');
      expect(response.body?.name).toBe('Bello');
    });

    it('[A-REPORT-PROGRESS] uploadFiles mit reportProgress/events', async () => {
      http = setup();
      const types: HttpEventType[] = [];
      const done = new Promise<void>((resolve, reject) =>
        TestBed.inject(BodiesService)
          .uploadFiles({ title: 't', file: new Blob(['f']) }, 'events', true)
          .subscribe({ next: (event) => types.push(event.type), complete: resolve, error: reject }),
      );
      const req = expectSingleRequest(http);
      expect(req.request.reportProgress).toBe(true);
      req.event({ type: HttpEventType.UploadProgress, loaded: 1, total: 2 });
      req.flush({ ids: ['1'] }, { status: 201, statusText: 'Created' });
      await done;
      expect(types).toContain(HttpEventType.UploadProgress);
      expect(types).toContain(HttpEventType.Response);
    });

    it('[A-OBSERVABLE-COLD] kein Request vor subscribe, unsubscribe bricht ab', () => {
      http = setup();
      const observable = TestBed.inject(PetsService).getPet({ petId: 1 });
      http.expectNone(() => true);
      const subscription = observable.subscribe();
      const req = expectSingleRequest(http);
      subscription.unsubscribe();
      expect(req.cancelled).toBe(true);
    });

    it.skip('[A-HTTPRESOURCE] Signal-API für GET — unsupported: typescript-angular generiert nur Observable-Services, keine httpResource/Signal-API', () => {});

    it('[A-ZONELESS] läuft mit provideZonelessChangeDetection ohne zone.js', async () => {
      http = setup();
      expect('Zone' in globalThis).toBe(false);
      const result = firstValueFrom(TestBed.inject(PetsService).getPet({ petId: 1 }));
      expectSingleRequest(http).flush(PET_RESPONSE);
      expect((await result).id).toBe(1);
    });
  });
});
