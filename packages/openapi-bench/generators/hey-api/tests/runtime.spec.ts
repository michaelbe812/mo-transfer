// Dimension runtime (R-*) – Hey API SDK-Funktionen (Promise, Angular HttpClient), HttpTestingController.
import { HttpTestingController } from '@angular/common/http/testing';
import { client } from '../client/client.gen';
import {
  authApiKeyHeader,
  authApiKeyQuery,
  authBasic,
  authBearer,
  authOauth2,
  authPublic,
  createPet,
  createShape,
  deletePet,
  downloadFile,
  getDates,
  getPet,
  getVendorJson,
  headerAndCookieParams,
  listPets,
  multiPathParams,
  patchPet,
  postText,
  queryStyles,
  reportByAccept,
  reservedParamNames,
  specialProperties,
  submitForm,
  updatePet,
  uploadBinary,
  uploadFiles,
} from '../client/sdk.gen';
import type { Auth } from '../client/client';
import {
  PET_RESPONSE,
  PROBLEM_RESPONSE,
  blobText,
  effectiveContentType,
  pathOf,
  queryAll,
  queryEntries,
  rawQueryOf,
  serializedBody,
} from '../../../testing/http-harness';
import { nextRequest, setupHeyApi, wireHeader } from '../testing/hey-api-test-setup';

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const ECHO = { method: 'GET', url: '/', headers: {} };

describe('hey-api runtime', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHeyApi();
  });
  afterEach(() => http.verify());

  // ------------------------------------------------------------ path
  it('[R-PATH-MULTI] mehrere Pfadparameter', async () => {
    const result = multiPathParams({ path: { stringId: 'abc', intId: 42, uuidId: UUID, enumId: 'sold' } });
    const req = await nextRequest(http);
    expect(pathOf(req.request)).toMatch(new RegExp(`/params/path/abc/42/${UUID}/sold$`));
    req.flush(ECHO);
    await result;
  });

  it('[R-PATH-ENCODE] Pfadparameter encodiert', async () => {
    const result = multiPathParams({ path: { stringId: 'a/b c?#', intId: 1, uuidId: UUID, enumId: 'sold' } });
    const req = await nextRequest(http);
    expect(pathOf(req.request)).toContain('/params/path/a%2Fb%20c%3F%23/1/');
    req.flush(ECHO);
    await result;
  });

  // ------------------------------------------------------------ query
  it('[R-QUERY-PRIMITIVES] 0 und false werden gesendet', async () => {
    const result = listPets({ query: { limit: 10, offset: 0, status: 'sold', vaccinated: false } });
    const req = await nextRequest(http);
    expect(queryEntries(req.request)).toEqual([
      ['limit', '10'],
      ['offset', '0'],
      ['status', 'sold'],
      ['vaccinated', 'false'],
    ]);
    req.flush({ total: 0, limit: 10, offset: 0, items: [] });
    await result;
  });

  it('[R-QUERY-OPTIONAL-OMITTED] keine undefined-Parameter', async () => {
    const result = listPets();
    const req = await nextRequest(http);
    expect(rawQueryOf(req.request)).toBe('');
    expect(req.request.urlWithParams).not.toMatch(/undefined|null/);
    req.flush({ total: 0, limit: 20, offset: 0, items: [] });
    await result;
  });

  it('[R-QUERY-ARRAY-EXPLODE] form explode=true', async () => {
    const result = queryStyles({ query: { required: 'r', tagsExplode: ['a', 'b'] } });
    const req = await nextRequest(http);
    expect(queryAll(req.request, 'tagsExplode')).toEqual(['a', 'b']);
    expect(rawQueryOf(req.request)).toContain('tagsExplode=a&tagsExplode=b');
    req.flush(ECHO);
    await result;
  });

  it('[R-QUERY-ARRAY-NOEXPLODE] form explode=false', async () => {
    const result = queryStyles({ query: { required: 'r', tagsCsv: ['a', 'b'] } });
    const req = await nextRequest(http);
    expect(queryAll(req.request, 'tagsCsv')).toEqual(['a,b']);
    req.flush(ECHO);
    await result;
  });

  it('[R-QUERY-ARRAY-PIPE] pipeDelimited', async () => {
    const result = queryStyles({ query: { required: 'r', tagsPipe: ['a', 'b'] } });
    const req = await nextRequest(http);
    expect(queryAll(req.request, 'tagsPipe')).toEqual(['a|b']);
    req.flush(ECHO);
    await result;
  });

  it('[R-QUERY-ARRAY-SPACE] spaceDelimited', async () => {
    const result = queryStyles({ query: { required: 'r', tagsSpace: [1, 2] } });
    const req = await nextRequest(http);
    expect(queryAll(req.request, 'tagsSpace')).toEqual(['1 2']);
    expect(rawQueryOf(req.request)).toMatch(/tagsSpace=1(%20|\+)2/);
    req.flush(ECHO);
    await result;
  });

  it('[R-QUERY-DEEPOBJECT] deepObject', async () => {
    const result = queryStyles({ query: { required: 'r', filter: { name: 'rex', status: 'sold' } } });
    const req = await nextRequest(http);
    expect(queryAll(req.request, 'filter[name]')).toEqual(['rex']);
    expect(queryAll(req.request, 'filter[status]')).toEqual(['sold']);
    req.flush(ECHO);
    await result;
  });

  it('[R-QUERY-FORM-OBJECT] form explode Objekt', async () => {
    const result = queryStyles({ query: { required: 'r', point: { x: 1, y: 2 } } });
    const req = await nextRequest(http);
    expect(queryEntries(req.request)).toEqual([
      ['required', 'r'],
      ['x', '1'],
      ['y', '2'],
    ]);
    req.flush(ECHO);
    await result;
  });

  it('[R-QUERY-DATE] Datum als ISO', async () => {
    // since/day sind als string typisiert (kein Date-Transformer) → ISO-String wird durchgereicht.
    const result = queryStyles({ query: { required: 'r', since: '2024-01-02T03:04:05.000Z', day: '2024-01-02' } });
    const req = await nextRequest(http);
    expect(queryAll(req.request, 'since')[0]).toMatch(/^2024-01-02T03:04:05(\.000)?Z$/);
    expect(queryAll(req.request, 'day')).toEqual(['2024-01-02']);
    req.flush(ECHO);
    await result;
  });

  it('[R-QUERY-BOOLEAN] true/false', async () => {
    const r1 = queryStyles({ query: { required: 'r', flag: true } });
    const req1 = await nextRequest(http);
    expect(queryAll(req1.request, 'flag')).toEqual(['true']);
    req1.flush(ECHO);
    await r1;
    const r2 = queryStyles({ query: { required: 'r', flag: false } });
    const req2 = await nextRequest(http);
    expect(queryAll(req2.request, 'flag')).toEqual(['false']);
    req2.flush(ECHO);
    await r2;
  });

  // ------------------------------------------------------------ header / cookie / naming
  it('[R-HEADER-PARAM] Header-Parameter', async () => {
    const result = headerAndCookieParams({
      headers: { 'X-Request-Id': UUID, 'X-Retry-Count': 3, 'X-Trace-Flags': ['a', 'b'] },
    });
    const req = await nextRequest(http);
    // mergeHeaders() ruft HttpHeaders.set('X-Retry-Count', 3) mit einer number auf → HttpHeaders wird beim
    // ersten Lesezugriff (auch im echten Backend: headers.forEach) mit TypeError korrupt.
    let wire: (string | null)[] | string;
    try {
      wire = [wireHeader(req, 'X-Request-Id'), wireHeader(req, 'X-Retry-Count'), wireHeader(req, 'X-Trace-Flags')];
    } catch (error) {
      wire = `HttpHeaders nicht lesbar: ${String(error)}`;
    }
    req.flush(ECHO);
    await result;
    expect(wire).toEqual([UUID, '3', 'a,b']);
  });

  it.skip('[R-COOKIE-PARAM] Cookie-Parameter — unsupported: Cookie-Parameter `session` wird gar nicht generiert (fehlt in HeaderAndCookieParamsData)', () => {
    /* keine API */
  });

  it('[R-NAME-RESERVED-PARAM] Originalnamen am Wire', async () => {
    const result = reservedParamNames({ path: { class: 'x' }, query: { default: 'd', 'page-size': 5, 'filter.name': 'n' } });
    const req = await nextRequest(http);
    expect(pathOf(req.request)).toMatch(/\/params\/reserved\/x$/);
    expect(queryEntries(req.request)).toEqual([
      ['default', 'd'],
      ['page-size', '5'],
      ['filter.name', 'n'],
    ]);
    req.flush(ECHO);
    await result;
  });

  // ------------------------------------------------------------ bodies
  it('[R-BODY-JSON] JSON-Body', async () => {
    const body = { name: 'Bello', status: 'available' as const, photoUrls: ['u'] };
    const result = createPet({ body });
    const req = await nextRequest(http);
    expect(req.request.method).toBe('POST');
    expect(JSON.parse(serializedBody(req.request) as string)).toEqual(body);
    expect(effectiveContentType(req.request)).toBe('application/json');
    req.flush(PET_RESPONSE, { status: 201, statusText: 'Created', headers: { Location: '/pets/1' } });
    await result;
  });

  it('[R-NULL-SEND] null bleibt erhalten', async () => {
    const result = updatePet({ path: { petId: 1 }, body: { name: 'B', status: 'sold', photoUrls: [], nickname: null } });
    const req = await nextRequest(http);
    const sent = JSON.parse(serializedBody(req.request) as string);
    expect(sent).toHaveProperty('nickname', null);
    req.flush(PET_RESPONSE);
    await result;
  });

  it('[R-BODY-MERGE-PATCH] merge-patch+json', async () => {
    const result = patchPet({ path: { petId: 1 }, body: { nickname: null } });
    const req = await nextRequest(http);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.get('Content-Type')).toBe('application/merge-patch+json');
    expect(JSON.parse(serializedBody(req.request) as string)).toEqual({ nickname: null });
    req.flush(PET_RESPONSE);
    await result;
  });

  it('[R-BODY-FORM-URLENCODED] x-www-form-urlencoded', async () => {
    const result = submitForm({ body: { username: 'u', password: 'p', remember: true } });
    const req = await nextRequest(http);
    const body = serializedBody(req.request);
    expect(typeof body).toBe('string');
    expect(Object.fromEntries(new URLSearchParams(body as string))).toEqual({ username: 'u', password: 'p', remember: 'true' });
    expect(effectiveContentType(req.request)).toBe('application/x-www-form-urlencoded');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
  });

  it('[R-BODY-MULTIPART] multipart/form-data', async () => {
    const file = new Blob(['file'], { type: 'text/plain' });
    const result = uploadFiles({ body: { title: 't', file, attachments: [new Blob(['a1']), new Blob(['a2'])] } });
    const req = await nextRequest(http);
    const body = serializedBody(req.request);
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get('title')).toBe('t');
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(form.getAll('attachments')).toHaveLength(2);
    expect(effectiveContentType(req.request)).toBeNull();
    req.flush({ ids: ['1'] }, { status: 201, statusText: 'Created' });
    await result;
  });

  it('[R-BODY-MULTIPART-JSON-PART] JSON-Part', async () => {
    const result = uploadFiles({ body: { title: 't', file: new Blob(['f']), meta: { author: 'me', tags: ['x'] } } });
    const req = await nextRequest(http);
    const meta = (serializedBody(req.request) as FormData).get('meta');
    const text = meta instanceof Blob ? await blobText(meta) : meta;
    expect(JSON.parse(text as string)).toEqual({ author: 'me', tags: ['x'] });
    req.flush({ ids: ['1'] }, { status: 201, statusText: 'Created' });
    await result;
  });

  it('[R-BODY-OCTET] Binary-Body', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const result = uploadBinary({ body: blob });
    const req = await nextRequest(http);
    expect(req.request.method).toBe('PUT');
    expect(serializedBody(req.request)).toBe(blob);
    expect(effectiveContentType(req.request)).toBe('application/octet-stream');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
  });

  it('[R-BODY-TEXT] text/plain Body', async () => {
    const result = postText({ body: 'hello' });
    const req = await nextRequest(http);
    expect(serializedBody(req.request)).toBe('hello');
    expect(effectiveContentType(req.request)).toBe('text/plain');
    req.flush('hello');
    await result;
  });

  it('[R-BODY-POLYMORPHIC] polymorpher Body unverändert', async () => {
    const result = createShape({ body: { kind: 'circle', radius: 2 } });
    const req = await nextRequest(http);
    expect(JSON.parse(serializedBody(req.request) as string)).toEqual({ kind: 'circle', radius: 2 });
    req.flush({ kind: 'circle', radius: 2 }, { status: 201, statusText: 'Created' });
    await result;
  });

  it('[R-NAME-SPECIAL-PROPS] Sondernamen am Wire', async () => {
    // `constructor` muss explizit gesetzt werden: ohne eigene Property greift das geerbte Object#constructor (Function)
    // und kollidiert mit `constructor?: string` (TS2322) – WeirdNames ist sonst nicht konstruierbar.
    const body = { 'x-request-id': 'r', '@type': 't', '1stPlace': true, 'with space': 's', snake_case_prop: 'sc', constructor: 'c' };
    const result = specialProperties({ body });
    const req = await nextRequest(http);
    expect(JSON.parse(serializedBody(req.request) as string)).toEqual(body);
    req.flush(JSON.parse(JSON.stringify(body))); // Fixture: Angular-flush-Typ (Object) kollidiert ebenfalls mit constructor: string
    const { data } = await result;
    expect(data?.['x-request-id']).toBe('r');
    expect(data?.['@type']).toBe('t');
    expect(data?.['1stPlace']).toBe(true);
  });

  // ------------------------------------------------------------ responses
  it('[R-RESP-204] 204 ohne Body', async () => {
    const result = deletePet({ path: { petId: 1 } });
    const req = await nextRequest(http);
    req.flush(null, { status: 204, statusText: 'No Content' });
    const res = await result;
    expect(res.error).toBeUndefined();
    expect(res.response?.status).toBe(204);
  });

  it('[R-RESP-BLOB] Binary Response als Blob', async () => {
    const result = downloadFile();
    const req = await nextRequest(http);
    // Angular-Client setzt nie responseType (immer 'json') → Blob nicht möglich.
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['data']));
    const { data } = await result;
    expect(data).toBeInstanceOf(Blob);
  });

  it('[R-RESP-TEXT] Text-Response roh', async () => {
    const result = postText({ body: 'hello' });
    const req = await nextRequest(http);
    expect(req.request.responseType).toBe('text');
    req.flush('hello');
    const { data } = await result;
    expect(data).toBe('hello');
  });

  it('[R-RESP-VENDOR-JSON] Vendor-JSON geparst + Accept', async () => {
    const result = getVendorJson();
    const req = await nextRequest(http);
    const accept = req.request.headers.get('Accept');
    req.flush({ name: 'tag' }, { headers: { 'Content-Type': 'application/vnd.bench.v1+json' } });
    const { data } = await result;
    expect(data).toEqual({ name: 'tag' });
    expect(accept).toContain('application/vnd.bench.v1+json');
  });

  it('[R-ACCEPT-HEADER] Accept passend zur Variante', async () => {
    const result = reportByAccept();
    const req = await nextRequest(http);
    const accept = req.request.headers.get('Accept');
    req.flush({ title: 'r' });
    await result;
    expect(accept).toBe('application/json');
    // PDF-Variante: nicht wählbar (kein Accept-/Variant-Parameter generiert).
  });

  it('[R-RESP-DATE-CONSISTENT] Datums-Typ = Laufzeitwert (string)', async () => {
    const result = getDates();
    const req = await nextRequest(http);
    req.flush({ date: '2024-01-02', dateTime: '2024-01-02T03:04:05Z' });
    const { data } = await result;
    // Typ: DateHolder['dateTime'] = string (siehe T-FORMAT-DATE)
    const dateTime: string | undefined = data?.dateTime;
    expect(typeof dateTime).toBe('string');
    expect(typeof data?.date).toBe('string');
  });

  it('[R-RESP-201-LOCATION] Status + Location-Header', async () => {
    const result = createPet({ body: { name: 'B', status: 'sold', photoUrls: [] } });
    const req = await nextRequest(http);
    req.flush(PET_RESPONSE, { status: 201, statusText: 'Created', headers: { Location: '/pets/1' } });
    const res = await result;
    expect(res.response?.status).toBe(201);
    expect(res.response?.headers.get('Location')).toBe('/pets/1');
  });

  it('[R-ERROR-BODY] 404 → Fehler-Kanal mit Problem-Body', async () => {
    const result = getPet({ path: { petId: 99 } });
    const req = await nextRequest(http);
    req.flush(PROBLEM_RESPONSE, { status: 404, statusText: 'Not Found' });
    const res = await result;
    expect(res.data).toBeUndefined();
    expect(res.error?.title).toBe('Not Found');
    expect(res.response?.status).toBe(404);
  });

  // ------------------------------------------------------------ auth (über client.setConfig({ auth }))
  const tokenFor = (auth: Auth): string | undefined => {
    if (auth.scheme === 'basic') return 'user:pass';
    if (auth.key === 'oauth2') return 'oauth-token';
    if (auth.type === 'apiKey' && auth.name === 'X-API-Key') return 'header-key';
    if (auth.type === 'apiKey' && auth.name === 'api_key') return 'query-key';
    if (auth.scheme === 'bearer') return 'jwt-token';
    return undefined;
  };

  it('[R-AUTH-BEARER] Bearer über Konfiguration', async () => {
    client.setConfig({ auth: tokenFor });
    const result = authBearer();
    const req = await nextRequest(http);
    const authorization = req.request.headers.get('Authorization');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
    expect(authorization).toBe('Bearer jwt-token');
  });

  it('[R-AUTH-APIKEY-HEADER] API-Key Header nur bei dieser Operation', async () => {
    client.setConfig({ auth: tokenFor });
    const result = authApiKeyHeader();
    const req = await nextRequest(http);
    const key = req.request.headers.get('X-API-Key');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
    const other = authPublic();
    const req2 = await nextRequest(http);
    const otherKey = req2.request.headers.get('X-API-Key');
    req2.flush(null, { status: 204, statusText: 'No Content' });
    await other;
    expect(key).toBe('header-key');
    expect(otherKey).toBeNull();
  });

  it('[R-AUTH-APIKEY-QUERY] API-Key Query', async () => {
    client.setConfig({ auth: tokenFor });
    const result = authApiKeyQuery();
    const req = await nextRequest(http);
    const keys = queryAll(req.request, 'api_key');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
    expect(keys).toEqual(['query-key']);
  });

  it('[R-AUTH-BASIC] Basic Auth', async () => {
    client.setConfig({ auth: tokenFor });
    const result = authBasic();
    const req = await nextRequest(http);
    const authorization = req.request.headers.get('Authorization');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
    expect(authorization).toBe(`Basic ${btoa('user:pass')}`);
  });

  it('[R-AUTH-OAUTH2] OAuth2 Access-Token', async () => {
    client.setConfig({ auth: tokenFor });
    const result = authOauth2();
    const req = await nextRequest(http);
    const authorization = req.request.headers.get('Authorization');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
    expect(authorization).toBe('Bearer oauth-token');
  });

  it('[R-AUTH-NONE] security: [] → kein Authorization', async () => {
    client.setConfig({ auth: tokenFor });
    const result = authPublic();
    const req = await nextRequest(http);
    const authorization = req.request.headers.get('Authorization');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await result;
    expect(authorization).toBeNull();
  });
});
