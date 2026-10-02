import { ApplicationRef, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpEventType,
  HttpResponse,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import type { Observable } from 'rxjs';
import { expectTypeOf } from 'vitest';
import { provideBenchBaseUrl } from '../client/api.base-url';
import { BodiesService } from '../client/bodies/bodies.service';
import { NamingService } from '../client/naming/naming.service';
import { ParamsService } from '../client/params/params.service';
import { getPetResource } from '../client/pets/pets.resource';
import { PetsService } from '../client/pets/pets.service';
import { PolymorphismService } from '../client/polymorphism/polymorphism.service';
import { ResponsesService } from '../client/responses/responses.service';
import type { Pet, Shape, WeirdNames } from '../client/model';
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

/** Abonniert ein Observable und hält letzten Wert / Fehler / complete fest. */
function track<T>(source: Observable<T>) {
  const state: { value?: T; error?: unknown; completed: boolean } = { completed: false };
  const subscription = source.subscribe({
    next: (value) => (state.value = value),
    error: (error: unknown) => (state.error = error),
    complete: () => (state.completed = true),
  });
  return { state, subscription };
}

const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const ECHO = { method: 'GET', url: '/', headers: {} };
const NEW_PET = { name: 'Bello', status: 'available' as const, photoUrls: ['https://img.example.com/1.png'] };

function setup(interceptors: HttpInterceptorFn[] = []): HttpTestingController {
  return setupHttp({ providers: [provideBenchBaseUrl(TEST_BASE_URL)], interceptors });
}

describe('orval runtime: params', () => {
  let http: HttpTestingController;
  let params: ParamsService;
  let pets: PetsService;
  beforeEach(() => {
    http = setup();
    params = TestBed.inject(ParamsService);
    pets = TestBed.inject(PetsService);
  });
  afterEach(() => http.verify());

  const queryStyles = (extra: Omit<Parameters<ParamsService['queryStyles']>[0], 'required'>) => {
    track(params.queryStyles({ required: 'r', ...extra }));
    const req = expectSingleRequest(http);
    return req;
  };

  it('[R-PATH-MULTI] mehrere Pfadparameter', () => {
    track(params.multiPathParams('abc', 42, UUID, 'sold'));
    const req = expectSingleRequest(http);
    expect(pathOf(req.request).endsWith(`/params/path/abc/42/${UUID}/sold`)).toBe(true);
    req.flush(ECHO);
  });

  it('[R-PATH-ENCODE] Slash/Leerzeichen/?/# encodiert', () => {
    track(params.multiPathParams('a/b c?#', 42, UUID, 'sold'));
    const req = expectSingleRequest(http);
    expect(pathOf(req.request)).toBe(`/api/params/path/a%2Fb%20c%3F%23/42/${UUID}/sold`);
    req.flush(ECHO);
  });

  it('[R-QUERY-PRIMITIVES] 0 und false werden gesendet', () => {
    track(pets.listPets({ limit: 10, offset: 0, status: 'sold', vaccinated: false }));
    const req = expectSingleRequest(http);
    expect(rawQueryOf(req.request)).toBe('limit=10&offset=0&status=sold&vaccinated=false');
    req.flush({ total: 0, limit: 10, offset: 0, items: [] });
  });

  it('[R-QUERY-OPTIONAL-OMITTED] listPets() ohne Query', () => {
    track(pets.listPets());
    const req = expectSingleRequest(http);
    expect(rawQueryOf(req.request)).toBe('');
    req.flush({ total: 0, limit: 20, offset: 0, items: [] });
  });

  it('[R-QUERY-ARRAY-EXPLODE] tagsExplode=a&tagsExplode=b', () => {
    const req = queryStyles({ tagsExplode: ['a', 'b'] });
    expect(queryAll(req.request, 'tagsExplode')).toEqual(['a', 'b']);
    req.flush(ECHO);
  });

  it('[R-QUERY-ARRAY-NOEXPLODE] tagsCsv=a,b', () => {
    const req = queryStyles({ tagsCsv: ['a', 'b'] });
    expect(queryAll(req.request, 'tagsCsv')).toEqual(['a,b']);
    req.flush(ECHO);
  });

  it('[R-QUERY-ARRAY-PIPE] tagsPipe=a|b', () => {
    const req = queryStyles({ tagsPipe: ['a', 'b'] });
    expect(queryAll(req.request, 'tagsPipe')).toEqual(['a|b']);
    req.flush(ECHO);
  });

  it('[R-QUERY-ARRAY-SPACE] tagsSpace=1%202', () => {
    const req = queryStyles({ tagsSpace: [1, 2] });
    expect(queryAll(req.request, 'tagsSpace')).toEqual(['1 2']);
    req.flush(ECHO);
  });

  it('[R-QUERY-DEEPOBJECT] filter[name]=rex&filter[status]=sold', () => {
    const req = queryStyles({ filter: { name: 'rex', status: 'sold' } });
    expect(queryAll(req.request, 'filter[name]')).toEqual(['rex']);
    expect(queryAll(req.request, 'filter[status]')).toEqual(['sold']);
    req.flush(ECHO);
  });

  it('[R-QUERY-FORM-OBJECT] point → x=1&y=2', () => {
    const req = queryStyles({ point: { x: 1, y: 2 } });
    expect(queryAll(req.request, 'x')).toEqual(['1']);
    expect(queryAll(req.request, 'y')).toEqual(['2']);
    expect(queryAll(req.request, 'point')).toEqual([]);
    req.flush(ECHO);
  });

  it('[R-QUERY-DATE] since/day ISO (Typ ist string)', () => {
    const req = queryStyles({ since: '2024-01-02T03:04:05.000Z', day: '2024-01-02' });
    expect(queryAll(req.request, 'since')).toEqual(['2024-01-02T03:04:05.000Z']);
    expect(queryAll(req.request, 'day')).toEqual(['2024-01-02']);
    req.flush(ECHO);
  });

  it('[R-QUERY-BOOLEAN] flag=true / flag=false', () => {
    const reqTrue = queryStyles({ flag: true });
    expect(queryAll(reqTrue.request, 'flag')).toEqual(['true']);
    reqTrue.flush(ECHO);
    const reqFalse = queryStyles({ flag: false });
    expect(queryAll(reqFalse.request, 'flag')).toEqual(['false']);
    reqFalse.flush(ECHO);
  });

  it('[R-HEADER-PARAM] X-Request-Id, X-Retry-Count, X-Trace-Flags', () => {
    track(params.headerAndCookieParams({ 'X-Request-Id': UUID, 'X-Retry-Count': 3, 'X-Trace-Flags': ['a', 'b'] }));
    const req = expectSingleRequest(http);
    expect(req.request.headers.get('X-Request-Id')).toBe(UUID);
    expect(req.request.headers.get('X-Retry-Count')).toBe('3');
    // XHR/fetch-Backend joint mehrere Werte mit ',' auf dem Wire
    expect(req.request.headers.getAll('X-Trace-Flags')?.join(',')).toBe('a,b');
    req.flush(ECHO);
  });

  it.skip('[R-COOKIE-PARAM] Cookie-Parameter session — unsupported: Orval generiert für in: cookie keinen Parameter (session fehlt in Signatur und Headers-Typ)', () => {
    expect(true).toBe(true);
  });

  it('[R-NAME-RESERVED-PARAM] Originalnamen auf dem Wire', () => {
    track(params.reservedParamNames('x', { default: 'd', 'page-size': 5, 'filter.name': 'n' }));
    const req = expectSingleRequest(http);
    expect(pathOf(req.request)).toBe('/api/params/reserved/x');
    expect(queryEntries(req.request)).toEqual([
      ['default', 'd'],
      ['page-size', '5'],
      ['filter.name', 'n'],
    ]);
    req.flush(ECHO);
  });
});

describe('orval runtime: bodies', () => {
  let http: HttpTestingController;
  let pets: PetsService;
  let bodies: BodiesService;
  beforeEach(() => {
    http = setup();
    pets = TestBed.inject(PetsService);
    bodies = TestBed.inject(BodiesService);
  });
  afterEach(() => http.verify());

  it('[R-BODY-JSON] POST JSON-Body unverändert', () => {
    track(pets.createPet(NEW_PET));
    const req = expectSingleRequest(http);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(NEW_PET);
    expect(effectiveContentType(req.request)).toBe('application/json');
    req.flush(PET_RESPONSE, { status: 201, statusText: 'Created' });
  });

  it('[R-NULL-SEND] nickname: null bleibt im Body', () => {
    track(pets.updatePet(1, { ...NEW_PET, nickname: null }));
    const req = expectSingleRequest(http);
    const sent = serializedBody(req.request);
    const parsed: unknown = typeof sent === 'string' ? JSON.parse(sent) : sent;
    expect(parsed).toHaveProperty('nickname', null);
    req.flush(PET_RESPONSE);
  });

  it('[R-BODY-MERGE-PATCH] PATCH mit application/merge-patch+json', () => {
    track(pets.patchPet(1, { nickname: 'Rex' }));
    const req = expectSingleRequest(http);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nickname: 'Rex' });
    expect(effectiveContentType(req.request)).toBe('application/merge-patch+json');
    req.flush(PET_RESPONSE);
  });

  it('[R-BODY-FORM-URLENCODED] username=u&password=p&remember=true', () => {
    track(bodies.submitForm({ username: 'u', password: 'p', remember: true }));
    const req = expectSingleRequest(http);
    const sent = serializedBody(req.request);
    // HttpClient reicht URLSearchParams unverändert an XHR/fetch durch (Browser serialisiert urlencoded); JSON-Body wäre fail
    expect(sent instanceof URLSearchParams || typeof sent === 'string').toBe(true);
    const entries = Object.fromEntries(new URLSearchParams(sent instanceof URLSearchParams ? sent.toString() : String(sent)).entries());
    expect(entries).toEqual({ username: 'u', password: 'p', remember: 'true' });
    expect(effectiveContentType(req.request)).toMatch(/^application\/x-www-form-urlencoded/);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('[R-BODY-MULTIPART] FormData mit title, file, 2 attachments, ohne manuellen Content-Type', () => {
    const file = new Blob(['file'], { type: 'text/plain' });
    track(
      bodies.uploadFiles({
        title: 't',
        file,
        attachments: [new Blob(['a1']), new Blob(['a2'])],
      }),
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
  });

  it('[R-BODY-MULTIPART-JSON-PART] meta als JSON-String', async () => {
    const meta = { author: 'a', tags: ['x'] };
    track(bodies.uploadFiles({ title: 't', file: new Blob(['f']), meta }));
    const req = expectSingleRequest(http);
    const part = (req.request.body as FormData).get('meta');
    const text = part instanceof Blob ? await part.text() : part;
    expect(text).not.toBe('[object Object]');
    expect(JSON.parse(String(text))).toEqual(meta);
    if (part instanceof Blob) expect(part.type).toBe('application/json');
    req.flush({ ids: ['1'] }, { status: 201, statusText: 'Created' });
  });

  it('[R-BODY-OCTET] PUT Blob mit application/octet-stream', () => {
    const blob = new Blob(['binary']);
    track(bodies.uploadBinary(blob));
    const req = expectSingleRequest(http);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBe(blob);
    expect(effectiveContentType(req.request)).toBe('application/octet-stream');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('[R-BODY-TEXT] roher String mit text/plain', () => {
    track(bodies.postText('hello'));
    const req = expectSingleRequest(http);
    expect(serializedBody(req.request)).toBe('hello');
    expect(effectiveContentType(req.request)).toMatch(/^text\/plain/);
    req.flush('hello');
  });

  it('[R-BODY-POLYMORPHIC] Shape unverändert', () => {
    const shape: Shape = { kind: 'circle', radius: 2 };
    track(TestBed.inject(PolymorphismService).createShape(shape));
    const req = expectSingleRequest(http);
    expect(req.request.body).toEqual({ kind: 'circle', radius: 2 });
    req.flush(shape, { status: 201, statusText: 'Created' });
  });

  it('[R-NAME-SPECIAL-PROPS] exakte Property-Namen in Request und Response', () => {
    // constructor muss explizit gesetzt werden: sonst kollidiert Object.prototype.constructor (Function) mit constructor?: string
    const body: WeirdNames = { 'x-request-id': 'r', '@type': 't', '1stPlace': true, snake_case_prop: 's', 'with space': 'w', constructor: 'c' };
    const wireResponse = { 'x-request-id': 'r', '@type': 't', '1stPlace': true, constructor: 'c' };
    const { state } = track(TestBed.inject(NamingService).specialProperties(body));
    const req = expectSingleRequest(http);
    const sent = serializedBody(req.request);
    expect(JSON.parse(String(sent))).toEqual(body);
    req.flush(wireResponse as object); // Fixture-Cast: constructor-Key kollidiert mit Object-Typ von flush()
    expect(state.value?.['x-request-id']).toBe('r');
    expect(state.value?.['@type']).toBe('t');
    expect(state.value?.['1stPlace']).toBe(true);
  });
});

describe('orval runtime: responses', () => {
  let http: HttpTestingController;
  let pets: PetsService;
  let responses: ResponsesService;
  beforeEach(() => {
    http = setup();
    pets = TestBed.inject(PetsService);
    responses = TestBed.inject(ResponsesService);
  });
  afterEach(() => http.verify());

  it('[R-RESP-204] deletePet completes bei leerem Body', () => {
    const { state } = track(pets.deletePet(1));
    const req = expectSingleRequest(http);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(state.error).toBeUndefined();
    expect(state.completed).toBe(true);
  });

  it('[R-RESP-BLOB] responseType blob, Ergebnis Blob', async () => {
    const { state } = track(responses.downloadFile());
    const req = expectSingleRequest(http);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['content']));
    expect(state.value).toBeInstanceOf(Blob);
    expect(await state.value?.text()).toBe('content');
  });

  it('[R-RESP-TEXT] responseType text, roher String', () => {
    const { state } = track(TestBed.inject(BodiesService).postText('hello'));
    const req = expectSingleRequest(http);
    expect(req.request.responseType).toBe('text');
    req.flush('plain text');
    expect(state.value).toBe('plain text');
  });

  it('[R-RESP-VENDOR-JSON] vnd+json als Objekt, Accept mit Vendor-Typ', () => {
    const { state } = track(responses.getVendorJson());
    const req = expectSingleRequest(http);
    expect(req.request.responseType).toBe('json');
    req.flush({ name: 'tag' });
    expect(state.value).toEqual({ name: 'tag' });
    expect(req.request.headers.get('Accept') ?? '').toContain('application/vnd.bench.v1+json');
  });

  it('[R-ACCEPT-HEADER] JSON → application/json; PDF → application/pdf + blob', () => {
    track(responses.reportByAccept('application/json'));
    const jsonReq = expectSingleRequest(http);
    expect(jsonReq.request.headers.get('Accept')).toBe('application/json');
    expect(jsonReq.request.responseType).toBe('json');
    jsonReq.flush({ title: 'r' });

    track(responses.reportByAccept('application/pdf'));
    const pdfReq = expectSingleRequest(http);
    expect(pdfReq.request.headers.get('Accept')).toBe('application/pdf');
    expect(pdfReq.request.responseType).toBe('blob');
    pdfReq.flush(new Blob(['%PDF']));
  });

  it('[R-RESP-DATE-CONSISTENT] dateTime als string typisiert → Laufzeit string', () => {
    const { state } = track(responses.getDates());
    const req = expectSingleRequest(http);
    req.flush({ date: '2024-01-02', dateTime: '2024-01-02T03:04:05Z' });
    expectTypeOf(state.value!.dateTime).toEqualTypeOf<string>();
    expect(typeof state.value?.dateTime).toBe('string');
    expect(typeof state.value?.date).toBe('string');
  });

  it('[R-RESP-201-LOCATION] Status 201 + Location via observe: response', () => {
    const { state } = track(pets.createPet(NEW_PET, { observe: 'response' }));
    const req = expectSingleRequest(http);
    req.flush(PET_RESPONSE, {
      status: 201,
      statusText: 'Created',
      headers: { Location: `${TEST_BASE_URL}/pets/1` },
    });
    expect(state.value?.status).toBe(201);
    expect(state.value?.headers.get('Location')).toBe(`${TEST_BASE_URL}/pets/1`);
  });

  it('[R-ERROR-BODY] 404 → Fehlerkanal mit Problem-Body', () => {
    const { state } = track(pets.getPet(99));
    const req = expectSingleRequest(http);
    req.flush(PROBLEM_RESPONSE, { status: 404, statusText: 'Not Found' });
    expect(state.value).toBeUndefined();
    expect(state.error).toBeInstanceOf(HttpErrorResponse);
    expect((state.error as HttpErrorResponse).error.title).toBe('Not Found');
  });
});

describe('orval runtime: auth', () => {
  const reason =
    'unsupported: Orval ignoriert securitySchemes vollständig (keine Credential-Konfiguration, kein Security-Metadatum pro Operation) — nur manueller Interceptor möglich';
  it.skip(`[R-AUTH-BEARER] Bearer via Konfiguration — ${reason}`, () => undefined);
  it.skip(`[R-AUTH-APIKEY-HEADER] X-API-Key via Konfiguration — ${reason}`, () => undefined);
  it.skip(`[R-AUTH-APIKEY-QUERY] api_key via Konfiguration — ${reason}`, () => undefined);
  it.skip(`[R-AUTH-BASIC] Basic via Konfiguration — ${reason}`, () => undefined);
  it.skip(`[R-AUTH-OAUTH2] OAuth2-Token via Konfiguration — ${reason}`, () => undefined);
  it.skip(`[R-AUTH-NONE] security: [] ohne Authorization — ${reason}`, () => undefined);
});

describe('orval angular', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('[A-PROVIDE-FN] provideBenchBaseUrl() in providers, ohne NgModule', () => {
    const http = setup();
    track(TestBed.inject(PetsService).getPet(1));
    const req = expectSingleRequest(http);
    expect(req.request.url.startsWith(TEST_BASE_URL)).toBe(true);
    req.flush(PET_RESPONSE);
  });

  it('[A-BASEURL] getPet(1) → http://test.local/api/pets/1', () => {
    const http = setup();
    const { state } = track(TestBed.inject(PetsService).getPet(1));
    const req = expectSingleRequest(http);
    expect(req.request.url).toBe('http://test.local/api/pets/1');
    req.flush(PET_RESPONSE);
    expect(state.value?.name).toBe('Bello');
  });

  it('[A-INJECT] inject() ohne manuelles Providen (providedIn root)', () => {
    const http = setup();
    const service = TestBed.runInInjectionContext(() => inject(PetsService));
    expect(service).toBeInstanceOf(PetsService);
    track(service.getPet(1));
    expectSingleRequest(http).flush(PET_RESPONSE);
  });

  it('[A-HTTPCLIENT] Request läuft über HttpClient', () => {
    const http = setup();
    track(TestBed.inject(PetsService).getPet(1));
    const req = http.expectOne(`${TEST_BASE_URL}/pets/1`);
    expect(req.request.method).toBe('GET');
    req.flush(PET_RESPONSE);
  });

  it('[A-INTERCEPTORS] funktionaler Interceptor setzt X-Intercepted', () => {
    const http = setup([(req, next) => next(req.clone({ setHeaders: { 'X-Intercepted': 'yes' } }))]);
    track(TestBed.inject(PetsService).getPet(1));
    const req = expectSingleRequest(http);
    expect(req.request.headers.get('X-Intercepted')).toBe('yes');
    req.flush(PET_RESPONSE);
  });

  it('[A-HTTPCONTEXT] HttpContext pro Aufruf', () => {
    const http = setup();
    const TOKEN = new HttpContextToken<string>(() => 'default');
    track(TestBed.inject(PetsService).getPet(1, { context: new HttpContext().set(TOKEN, 'custom') }));
    const req = expectSingleRequest(http);
    expect(req.request.context.get(TOKEN)).toBe('custom');
    req.flush(PET_RESPONSE);
  });

  it('[A-OBSERVE-RESPONSE] HttpResponse<Pet> typisiert', () => {
    const http = setup();
    const source = TestBed.inject(PetsService).getPet(1, { observe: 'response' });
    expectTypeOf(source).toEqualTypeOf<Observable<HttpResponse<Pet>>>();
    const { state } = track(source);
    const req = expectSingleRequest(http);
    req.flush(PET_RESPONSE, { headers: { 'X-Test': '1' } });
    expect(state.value).toBeInstanceOf(HttpResponse);
    expect(state.value?.status).toBe(200);
    expect(state.value?.headers.get('X-Test')).toBe('1');
    expect(state.value?.body?.name).toBe('Bello');
  });

  it('[A-REPORT-PROGRESS] uploadFiles mit reportProgress + observe events', () => {
    const http = setup();
    const events: HttpEventType[] = [];
    TestBed.inject(BodiesService)
      .uploadFiles({ title: 't', file: new Blob(['f']) }, { reportProgress: true, observe: 'events' })
      .subscribe((event) => events.push(event.type));
    const req = expectSingleRequest(http);
    expect(req.request.reportProgress).toBe(true);
    req.event({ type: HttpEventType.UploadProgress, loaded: 1, total: 2 });
    req.flush({ ids: ['1'] }, { status: 201, statusText: 'Created' });
    expect(events).toContain(HttpEventType.UploadProgress);
    expect(events).toContain(HttpEventType.Response);
  });

  it('[A-OBSERVABLE-COLD] kein Request vor subscribe, unsubscribe bricht ab', () => {
    const http = setup();
    const source = TestBed.inject(PetsService).getPet(1);
    http.expectNone(() => true);
    const { subscription } = track(source);
    const req = expectSingleRequest(http);
    subscription.unsubscribe();
    expect(req.cancelled).toBe(true);
  });

  it('[A-HTTPRESOURCE] getPetResource → Pet nach flush', async () => {
    const http = setup();
    const petId = signal(1);
    const ref = TestBed.runInInjectionContext(() => getPetResource(petId));
    TestBed.tick();
    const req = expectSingleRequest(http);
    expect(req.request.url).toBe(`${TEST_BASE_URL}/pets/1`);
    req.flush(PET_RESPONSE);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(ref.hasValue()).toBe(true);
    expect(ref.value()?.name).toBe('Bello');
  });

  it('[A-ZONELESS] läuft zoneless (ohne zone.js)', () => {
    const http = setup();
    expect('Zone' in globalThis).toBe(false);
    const { state } = track(TestBed.inject(PetsService).getPet(1));
    expectSingleRequest(http).flush(PET_RESPONSE);
    expect(state.value?.name).toBe('Bello');
  });
});
