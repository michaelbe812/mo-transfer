/**
 * Runtime-/Angular-Tests (R-*, A-*) für openapi-fetch.
 * openapi-fetch nutzt NICHT Angular HttpClient → Interception über ein `fetch`-Stub, das createClient übergeben wird.
 * Regel: idiomatischer Default-Aufruf, KEINE manuelle Wire-Konfiguration (parseAs, bodySerializer, querySerializer,
 * Content-Type/Accept-Header) — gemessen wird, was Generator + Runtime aus der Spec selbst ableiten.
 */
import { TestBed } from '@angular/core/testing';
import createClient from 'openapi-fetch';
import { describe, expect, it } from 'vitest';
import type { paths } from '../client/schema';
import { PET_RESPONSE, PROBLEM_RESPONSE, TEST_BASE_URL, setupHttp } from '../../../testing/http-harness';

type Responder = (request: Request) => Response | Promise<Response>;

/** fetch-Stub: merkt sich eine Kopie jedes Requests und antwortet über `respond`. */
function createStub(respond: Responder) {
  const requests: Request[] = [];
  const fetch = async (request: Request): Promise<Response> => {
    requests.push(request.clone());
    return respond(request);
  };
  return { fetch, requests };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
}

const empty204 = (): Response => new Response(null, { status: 204 });
const echo = (): Response => jsonResponse({});

/** Client + Stub mit fester Antwort. */
function setup(respond: Responder = echo) {
  const stub = createStub(respond);
  const client = createClient<paths>({ baseUrl: TEST_BASE_URL, fetch: stub.fetch });
  const single = (): Request => {
    expect(stub.requests).toHaveLength(1);
    return stub.requests[0];
  };
  return { client, stub, single };
}

const pathOf = (request: Request): string => new URL(request.url).pathname;
const searchOf = (request: Request): URLSearchParams => new URL(request.url).searchParams;
const rawQuery = (request: Request): string => new URL(request.url).search.replace(/^\?/, '');

describe('openapi-fetch runtime-params', () => {
  it('[R-PATH-MULTI] mehrere Pfadparameter', async () => {
    const { client, single } = setup();
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    await client.GET('/params/path/{stringId}/{intId}/{uuidId}/{enumId}', {
      params: { path: { stringId: 'abc', intId: 42, uuidId: uuid, enumId: 'sold' } },
    });
    expect(pathOf(single())).toMatch(new RegExp(`/params/path/abc/42/${uuid}/sold$`));
  });

  it('[R-PATH-ENCODE] Pfadparameter URL-encodiert', async () => {
    const { client, single } = setup();
    await client.GET('/params/path/{stringId}/{intId}/{uuidId}/{enumId}', {
      params: { path: { stringId: 'a/b c?#', intId: 1, uuidId: 'u', enumId: 'sold' } },
    });
    expect(pathOf(single())).toBe('/api/params/path/a%2Fb%20c%3F%23/1/u/sold');
  });

  it('[R-QUERY-PRIMITIVES] 0 und false werden gesendet', async () => {
    const { client, single } = setup(() => jsonResponse({ total: 0, limit: 10, offset: 0, items: [] }));
    await client.GET('/pets', { params: { query: { limit: 10, offset: 0, status: 'sold', vaccinated: false } } });
    expect(rawQuery(single())).toBe('limit=10&offset=0&status=sold&vaccinated=false');
  });

  it('[R-QUERY-OPTIONAL-OMITTED] keine Query-Parameter', async () => {
    const { client, single } = setup(() => jsonResponse({ total: 0, limit: 20, offset: 0, items: [] }));
    await client.GET('/pets');
    const request = single();
    expect(rawQuery(request)).toBe('');
    expect(request.url).not.toMatch(/undefined|null/);
  });

  it('[R-QUERY-ARRAY-EXPLODE] tagsExplode=a&tagsExplode=b', async () => {
    const { client, single } = setup();
    await client.GET('/params/query', { params: { query: { required: 'r', tagsExplode: ['a', 'b'] } } });
    expect(rawQuery(single())).toContain('tagsExplode=a&tagsExplode=b');
  });

  it('[R-QUERY-ARRAY-NOEXPLODE] tagsCsv=a,b', async () => {
    const { client, single } = setup();
    await client.GET('/params/query', { params: { query: { required: 'r', tagsCsv: ['a', 'b'] } } });
    expect(searchOf(single()).getAll('tagsCsv')).toEqual(['a,b']);
  });

  it('[R-QUERY-ARRAY-PIPE] tagsPipe=a|b', async () => {
    const { client, single } = setup();
    await client.GET('/params/query', { params: { query: { required: 'r', tagsPipe: ['a', 'b'] } } });
    expect(searchOf(single()).getAll('tagsPipe')).toEqual(['a|b']);
  });

  it('[R-QUERY-ARRAY-SPACE] tagsSpace=1%202', async () => {
    const { client, single } = setup();
    await client.GET('/params/query', { params: { query: { required: 'r', tagsSpace: [1, 2] } } });
    expect(searchOf(single()).getAll('tagsSpace')).toEqual(['1 2']);
  });

  it('[R-QUERY-DEEPOBJECT] filter[name]=rex&filter[status]=sold', async () => {
    const { client, single } = setup();
    await client.GET('/params/query', { params: { query: { required: 'r', filter: { name: 'rex', status: 'sold' } } } });
    const search = searchOf(single());
    expect(search.get('filter[name]')).toBe('rex');
    expect(search.get('filter[status]')).toBe('sold');
  });

  it('[R-QUERY-FORM-OBJECT] point → x=1&y=2', async () => {
    const { client, single } = setup();
    await client.GET('/params/query', { params: { query: { required: 'r', point: { x: 1, y: 2 } } } });
    const search = searchOf(single());
    expect(search.get('x')).toBe('1');
    expect(search.get('y')).toBe('2');
  });

  it('[R-QUERY-DATE] since/day als ISO', async () => {
    // Typ ist string → Aufrufer übergibt ISO-Strings; die Runtime sendet sie unverändert.
    const { client, single } = setup();
    await client.GET('/params/query', {
      params: { query: { required: 'r', since: '2024-01-02T03:04:05.000Z', day: '2024-01-02' } },
    });
    const search = searchOf(single());
    expect(search.get('since')).toBe('2024-01-02T03:04:05.000Z');
    expect(search.get('day')).toBe('2024-01-02');
  });

  it('[R-QUERY-BOOLEAN] flag=true / flag=false', async () => {
    const { client, stub } = setup();
    await client.GET('/params/query', { params: { query: { required: 'r', flag: true } } });
    await client.GET('/params/query', { params: { query: { required: 'r', flag: false } } });
    expect(searchOf(stub.requests[0]).get('flag')).toBe('true');
    expect(searchOf(stub.requests[1]).get('flag')).toBe('false');
  });

  it('[R-HEADER-PARAM] Header-Parameter gesendet', async () => {
    const { client, single } = setup();
    await client.GET('/params/header-cookie', {
      params: { header: { 'X-Request-Id': 'req-1', 'X-Retry-Count': 3, 'X-Trace-Flags': ['a', 'b'] } },
    });
    const headers = single().headers;
    expect(headers.get('X-Request-Id')).toBe('req-1');
    expect(headers.get('X-Retry-Count')).toBe('3');
    // Runtime hängt Array-Werte als mehrere Header an → fetch kombiniert zu 'a, b'. Audit: laut RFC 9110 §5.6.1
    // ist OWS nach dem Komma in Listen-Headern äquivalent zu 'a,b' → Leerraum normalisieren.
    expect(headers.get('X-Trace-Flags')?.replace(/,\s+/g, ',')).toBe('a,b');
  });

  it('[R-COOKIE-PARAM] Cookie-Parameter gesetzt', async () => {
    // params.cookie ist typisiert angeboten, die Runtime ignoriert es jedoch vollständig.
    const { client, single } = setup();
    await client.GET('/params/header-cookie', {
      params: { header: { 'X-Request-Id': 'req-1' }, cookie: { session: 's1' } },
    });
    expect(single().headers.get('Cookie') ?? '').toContain('session=s1');
  });

  it('[R-NAME-RESERVED-PARAM] Originalnamen am Wire', async () => {
    const { client, single } = setup();
    await client.GET('/params/reserved/{class}', {
      params: { path: { class: 'x' }, query: { default: 'd', 'page-size': 5, 'filter.name': 'n' } },
    });
    const request = single();
    expect(pathOf(request)).toBe('/api/params/reserved/x');
    expect(rawQuery(request)).toBe('default=d&page-size=5&filter.name=n');
  });
});

describe('openapi-fetch runtime-bodies', () => {
  const newPet = { name: 'Bello', status: 'available', photoUrls: ['https://img.example.com/1.png'] } as const;

  it('[R-BODY-JSON] JSON-Body', async () => {
    const { client, single } = setup(() => jsonResponse(PET_RESPONSE, { status: 201, headers: { Location: '/pets/1' } }));
    await client.POST('/pets', { body: { ...newPet, photoUrls: [...newPet.photoUrls] } });
    const request = single();
    expect(request.method).toBe('POST');
    expect(request.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(await request.text())).toEqual(newPet);
  });

  it('[R-NULL-SEND] nickname: null bleibt erhalten', async () => {
    const { client, single } = setup(() => jsonResponse(PET_RESPONSE));
    await client.PUT('/pets/{petId}', {
      params: { path: { petId: 1 } },
      body: { name: 'Bello', status: 'available', photoUrls: [], nickname: null },
    });
    const body = JSON.parse(await single().text()) as Record<string, unknown>;
    expect('nickname' in body).toBe(true);
    expect(body['nickname']).toBeNull();
  });

  it('[R-BODY-MERGE-PATCH] application/merge-patch+json', async () => {
    const { client, single } = setup(() => jsonResponse(PET_RESPONSE));
    await client.PATCH('/pets/{petId}', { params: { path: { petId: 1 } }, body: { nickname: null } });
    const request = single();
    expect(request.method).toBe('PATCH');
    expect(request.headers.get('Content-Type')).toBe('application/merge-patch+json');
    expect(JSON.parse(await request.text())).toEqual({ nickname: null });
  });

  it('[R-BODY-FORM-URLENCODED] x-www-form-urlencoded', async () => {
    const { client, single } = setup(empty204);
    await client.POST('/bodies/form-urlencoded', { body: { username: 'u', password: 'p', remember: true } });
    const request = single();
    expect(request.headers.get('Content-Type')).toMatch(/^application\/x-www-form-urlencoded/);
    const form = new URLSearchParams(await request.text());
    expect(Object.fromEntries(form)).toEqual({ username: 'u', password: 'p', remember: 'true' });
  });

  it('[R-BODY-MULTIPART] multipart/form-data', async () => {
    const { client, single } = setup(() => jsonResponse({ ids: ['1'] }, { status: 201 }));
    await client.POST('/bodies/multipart', {
      body: { title: 'T', file: new Blob(['file']), attachments: [new Blob(['a1']), new Blob(['a2'])] },
    });
    const request = single();
    // Browser setzt multipart/form-data; boundary=… nur bei echtem FormData-Body.
    expect(request.headers.get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
    const form = await request.formData();
    expect(form.get('title')).toBe('T');
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(form.getAll('attachments')).toHaveLength(2);
  });

  it('[R-BODY-MULTIPART-JSON-PART] meta als JSON-Part', async () => {
    const { client, single } = setup(() => jsonResponse({ ids: ['1'] }, { status: 201 }));
    await client.POST('/bodies/multipart', {
      body: { title: 'T', file: new Blob(['file']), meta: { author: 'me', tags: ['x'] } },
    });
    const request = single();
    expect(request.headers.get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
    const meta = (await request.formData()).get('meta');
    const metaText = meta instanceof Blob ? await meta.text() : meta;
    expect(JSON.parse(String(metaText))).toEqual({ author: 'me', tags: ['x'] });
  });

  it('[R-BODY-OCTET] Binary-Body', async () => {
    const { client, single } = setup(empty204);
    // Audit: Blob ohne eigenen MIME-Typ (wie bei den anderen Generatoren), sonst käme der Content-Type aus dem Blob.
    await client.PUT('/bodies/binary', { body: new Blob(['binary-data']) });
    const request = single();
    expect(request.method).toBe('PUT');
    expect(request.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(await request.text()).toBe('binary-data');
  });

  it('[R-BODY-TEXT] text/plain Body', async () => {
    const { client, single } = setup(() => new Response('hello', { headers: { 'Content-Type': 'text/plain' } }));
    // Antwort-Parsing (JSON) schlägt ggf. fehl — hier zählt nur der Request.
    await client.POST('/bodies/text', { body: 'hello' }).catch(() => undefined);
    const request = single();
    expect(request.headers.get('Content-Type')).toMatch(/^text\/plain/);
    expect(await request.text()).toBe('hello');
  });

  it('[R-BODY-POLYMORPHIC] Shape unverändert', async () => {
    const { client, single } = setup(() => jsonResponse({ kind: 'circle', radius: 2 }, { status: 201 }));
    await client.POST('/polymorphism/shapes', { body: { kind: 'circle', radius: 2 } });
    expect(JSON.parse(await single().text())).toEqual({ kind: 'circle', radius: 2 });
  });

  it('[R-NAME-SPECIAL-PROPS] Sonder-Property-Namen am Wire', async () => {
    // constructor explizit gesetzt: TS-Eigenheit — ohne ihn kollidiert Object.prototype.constructor (Function) mit `constructor?: string`.
    const weird = {
      'x-request-id': 'r',
      '@type': 't',
      $ref: '#',
      '1stPlace': true,
      snake_case_prop: 's',
      'with space': 'w',
      constructor: 'c',
    };
    const { client, single } = setup(() => jsonResponse(weird));
    const { data } = await client.POST('/naming/special-properties', { body: weird });
    expect(JSON.parse(await single().text())).toEqual(weird);
    expect(data).toEqual(weird);
    expect(data?.['x-request-id']).toBe('r');
    expect(data?.['1stPlace']).toBe(true);
  });
});

describe('openapi-fetch runtime-responses', () => {
  it('[R-RESP-204] 204 ohne Body', async () => {
    const { client } = setup(empty204);
    const result = await client.DELETE('/pets/{petId}', { params: { path: { petId: 1 } } });
    expect(result.error).toBeUndefined();
    expect(result.data).toBeUndefined();
    expect(result.response.status).toBe(204);
  });

  it('[R-RESP-BLOB] Binary-Response als Blob', async () => {
    const { client } = setup(
      () => new Response(new Blob(['%PDF-binary\u0000\u0001']), { headers: { 'Content-Type': 'application/octet-stream' } }),
    );
    const result = client.GET('/responses/download');
    await expect(result).resolves.toHaveProperty('data');
    const { data } = await result;
    expect(data).toBeInstanceOf(Blob);
  });

  it('[R-RESP-TEXT] Text-Response roh', async () => {
    const { client } = setup(() => new Response('hello world', { headers: { 'Content-Type': 'text/plain' } }));
    await expect(client.POST('/bodies/text', { body: 'hello' })).resolves.toMatchObject({ data: 'hello world' });
  });

  it('[R-RESP-VENDOR-JSON] Vendor-JSON geparst, Accept gesetzt', async () => {
    const { client, single } = setup(
      () => new Response(JSON.stringify({ name: 'v' }), { headers: { 'Content-Type': 'application/vnd.bench.v1+json' } }),
    );
    const { data } = await client.GET('/responses/vendor-json');
    expect(data).toEqual({ name: 'v' });
    expect(single().headers.get('Accept') ?? '').toContain('application/vnd.bench.v1+json');
  });

  it('[R-ACCEPT-HEADER] Accept passend zur Variante', async () => {
    // Keine PDF-Variante pro Aufruf wählbar (nur client-weites Media-Generic, ohne Runtime-Effekt) → nur JSON prüfbar.
    const { client, single } = setup(() => jsonResponse({ title: 'R' }));
    await client.GET('/responses/pdf-or-json');
    expect(single().headers.get('Accept')).toBe('application/json');
  });

  it('[R-RESP-DATE-CONSISTENT] dateTime als string typisiert und string zur Laufzeit', async () => {
    const { client } = setup(() => jsonResponse({ date: '2024-01-02', dateTime: '2024-01-02T03:04:05Z' }));
    const { data } = await client.GET('/responses/dates');
    expect(typeof data?.dateTime).toBe('string');
    expect(typeof data?.date).toBe('string');
  });

  it('[R-RESP-201-LOCATION] Location + Status 201 auslesbar', async () => {
    const { client } = setup(() => jsonResponse(PET_RESPONSE, { status: 201, headers: { Location: '/api/pets/1' } }));
    const { response, data } = await client.POST('/pets', { body: { name: 'Bello', status: 'available', photoUrls: [] } });
    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe('/api/pets/1');
    expect(data?.id).toBe(1);
  });

  it('[R-ERROR-BODY] 404 → error mit Problem-Body', async () => {
    const { client } = setup(() => jsonResponse(PROBLEM_RESPONSE, { status: 404 }));
    const { data, error, response } = await client.GET('/pets/{petId}', { params: { path: { petId: 999 } } });
    expect(data).toBeUndefined();
    expect(response.status).toBe(404);
    expect(error?.title).toBe('Not Found');
  });
});

describe('openapi-fetch runtime-auth', () => {
  const reason = 'unsupported: openapi-typescript generiert keine Security-Konfiguration; Auth nur per handgeschriebener Middleware';
  it.skip(`[R-AUTH-BEARER] Bearer über generierte Konfiguration — ${reason}`, () => undefined);
  it.skip(`[R-AUTH-APIKEY-HEADER] API-Key-Header über Konfiguration — ${reason}`, () => undefined);
  it.skip(`[R-AUTH-APIKEY-QUERY] API-Key-Query über Konfiguration — ${reason}`, () => undefined);
  it.skip(`[R-AUTH-BASIC] Basic über Konfiguration — ${reason}`, () => undefined);
  it.skip(`[R-AUTH-OAUTH2] OAuth2 über Konfiguration — ${reason}`, () => undefined);
  it.skip(`[R-AUTH-NONE] security: [] ohne Credentials — ${reason} (Runtime kennt security der Operationen nicht)`, () => undefined);
});

describe('openapi-fetch angular', () => {
  const noAngular = 'unsupported: openapi-fetch ist framework-agnostisch (fetch), keine Angular-Integration';
  it.skip(`[A-PROVIDE-FN] provideXxx()/DI-Token — ${noAngular}`, () => undefined);
  it.skip(`[A-BASEURL] Base-URL per DI — ${noAngular}; baseUrl nur als createClient-Option, nicht per DI`, () => undefined);
  it.skip(`[A-INJECT] inject()/providedIn root — ${noAngular}`, () => undefined);
  it.skip(`[A-HTTPCLIENT] nutzt HttpClient — ${noAngular}; Requests gehen an globalThis.fetch`, () => undefined);
  it.skip(`[A-INTERCEPTORS] funktionale Interceptors — ${noAngular}; nur eigene Middleware (client.use)`, () => undefined);
  it.skip(`[A-HTTPCONTEXT] HttpContext pro Aufruf — ${noAngular}`, () => undefined);
  it.skip(`[A-OBSERVE-RESPONSE] HttpResponse<Pet> — ${noAngular}; liefert {data, error, response: Response}`, () => undefined);
  it.skip(`[A-REPORT-PROGRESS] Upload-Progress — ${noAngular}; fetch bietet keinen Upload-Progress`, () => undefined);
  it.skip(`[A-HTTPRESOURCE] httpResource/Signal-API — ${noAngular}`, () => undefined);

  it('[A-OBSERVABLE-COLD] kein Request vor subscribe (Promise = eager → dokumentiert fail)', async () => {
    const { client, stub } = setup(() => jsonResponse(PET_RESPONSE));
    const pending = client.GET('/pets/{petId}', { params: { path: { petId: 1 } } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Promise-API startet den Request sofort; es gibt kein subscribe/unsubscribe.
    expect(stub.requests).toHaveLength(0);
    await pending;
  });

  // Audit: trivial erfüllt (fetch-Client hat nichts mit Change Detection zu tun) → wie alle A-* ohne Angular-Integration
  // unsupported. Code bleibt als Nachweis der Lauffähigkeit stehen, zählt aber nicht.
  it.skip(`[A-ZONELESS] lauffähig mit provideZonelessChangeDetection() ohne zone.js — ${noAngular}`, async () => {
    setupHttp();
    expect((globalThis as { Zone?: unknown }).Zone).toBeUndefined();
    const { client } = setup(() => jsonResponse(PET_RESPONSE));
    const { data } = await TestBed.runInInjectionContext(() => client.GET('/pets/{petId}', { params: { path: { petId: 1 } } }));
    expect(data?.name).toBe('Bello');
  });
});
