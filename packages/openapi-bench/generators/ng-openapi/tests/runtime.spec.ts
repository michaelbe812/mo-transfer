/**
 * Dimension "runtime" (R-*) für ng-openapi 0.4.1: generierte Angular-Services (providedIn root) über
 * provideBenchClient({ basePath }) + HttpTestingController.
 */
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import {
  BodiesService,
  NamingService,
  ParamsService,
  PetsService,
  PolymorphismService,
  ResponsesService,
  provideBenchClient,
  type Pet,
  type WeirdNames,
} from '../client';
import {
  PET_RESPONSE,
  PROBLEM_RESPONSE,
  TEST_BASE_URL,
  blobText,
  effectiveContentType,
  expectSingleRequest,
  pathOf,
  queryAll,
  rawQueryOf,
  serializedBody,
  setupHttp,
} from '../../../testing/http-harness';

const UUID = '6f1c2a4e-1b2c-4d3e-8f90-0123456789ab';
const fullPet: Pet = { id: 1, name: 'Bello', status: 'available', photoUrls: ['https://img.example.com/1.png'] };

describe('ng-openapi runtime', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    http = setupHttp({ providers: [provideBenchClient({ basePath: TEST_BASE_URL })] });
  });
  afterEach(() => http.verify());

  const pets = () => TestBed.inject(PetsService);
  const params = () => TestBed.inject(ParamsService);
  const bodies = () => TestBed.inject(BodiesService);
  const responses = () => TestBed.inject(ResponsesService);

  describe('params', () => {
    it('[R-PATH-MULTI] mehrere Pfad-Parameter', async () => {
      const result = firstValueFrom(params().multiPathParams('abc', 42, UUID, 'sold'));
      const req = expectSingleRequest(http);
      expect(pathOf(req.request)).toMatch(new RegExp(`/params/path/abc/42/${UUID}/sold$`));
      req.flush({});
      await result;
    });

    it('[R-PATH-ENCODE] Pfad-Parameter werden encodiert', async () => {
      const result = firstValueFrom(params().multiPathParams('a/b c?#', 42, UUID, 'sold'));
      const req = expectSingleRequest(http);
      // ng-openapi interpoliert roh: `${this.basePath}/params/path/${stringId}/...` → kein encodeURIComponent
      expect(req.request.url).toBe(`${TEST_BASE_URL}/params/path/a%2Fb%20c%3F%23/42/${UUID}/sold`);
      req.flush({});
      await result;
    });

    it('[R-QUERY-PRIMITIVES] 0 und false werden gesendet', async () => {
      const result = firstValueFrom(pets().listPets(10, 0, 'sold', false));
      const req = expectSingleRequest(http);
      expect(rawQueryOf(req.request)).toBe('limit=10&offset=0&status=sold&vaccinated=false');
      req.flush({ total: 0, limit: 10, offset: 0, items: [] });
      await result;
    });

    it('[R-QUERY-OPTIONAL-OMITTED] keine Query ohne Parameter', async () => {
      const result = firstValueFrom(pets().listPets());
      const req = expectSingleRequest(http);
      expect(rawQueryOf(req.request)).toBe('');
      expect(req.request.urlWithParams).not.toMatch(/undefined|null/);
      req.flush({ total: 0, limit: 20, offset: 0, items: [] });
      await result;
    });

    it('[R-QUERY-ARRAY-EXPLODE] tagsExplode=a&tagsExplode=b', async () => {
      const result = firstValueFrom(params().queryStyles('r', ['a', 'b']));
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'tagsExplode')).toEqual(['a', 'b']);
      req.flush({});
      await result;
    });

    it('[R-QUERY-ARRAY-NOEXPLODE] tagsCsv=a,b', async () => {
      const result = firstValueFrom(params().queryStyles('r', undefined, ['a', 'b']));
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'tagsCsv')).toEqual(['a,b']);
      req.flush({});
      await result;
    });

    it('[R-QUERY-ARRAY-PIPE] tagsPipe=a|b', async () => {
      const result = firstValueFrom(params().queryStyles('r', undefined, undefined, ['a', 'b']));
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'tagsPipe')).toEqual(['a|b']);
      req.flush({});
      await result;
    });

    it('[R-QUERY-ARRAY-SPACE] tagsSpace=1%202', async () => {
      const result = firstValueFrom(params().queryStyles('r', undefined, undefined, undefined, [1, 2]));
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'tagsSpace')).toEqual(['1 2']);
      req.flush({});
      await result;
    });

    it('[R-QUERY-DEEPOBJECT] filter[name]=rex&filter[status]=sold', async () => {
      const result = firstValueFrom(
        params().queryStyles('r', undefined, undefined, undefined, undefined, { name: 'rex', status: 'sold' }),
      );
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'filter[name]')).toEqual(['rex']);
      expect(queryAll(req.request, 'filter[status]')).toEqual(['sold']);
      req.flush({});
      await result;
    });

    it('[R-QUERY-FORM-OBJECT] point → x=1&y=2', async () => {
      const result = firstValueFrom(
        params().queryStyles('r', undefined, undefined, undefined, undefined, undefined, { x: 1, y: 2 }),
      );
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'x')).toEqual(['1']);
      expect(queryAll(req.request, 'y')).toEqual(['2']);
      expect(queryAll(req.request, 'point')).toEqual([]);
      req.flush({});
      await result;
    });

    it('[R-QUERY-DATE] since/day als ISO (dateType string → Strings werden übergeben)', async () => {
      const result = firstValueFrom(
        params().queryStyles(
          'r',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          '2024-01-02T03:04:05.000Z',
          '2024-01-02',
        ),
      );
      const req = expectSingleRequest(http);
      expect(queryAll(req.request, 'since')[0]).toMatch(/^2024-01-02T03:04:05(\.000)?Z$/);
      expect(queryAll(req.request, 'day')).toEqual(['2024-01-02']);
      req.flush({});
      await result;
    });

    it('[R-QUERY-BOOLEAN] flag=true / flag=false', async () => {
      const first = firstValueFrom(
        params().queryStyles('r', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true),
      );
      const reqTrue = expectSingleRequest(http);
      expect(queryAll(reqTrue.request, 'flag')).toEqual(['true']);
      reqTrue.flush({});
      await first;
      const second = firstValueFrom(
        params().queryStyles('r', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, false),
      );
      const reqFalse = expectSingleRequest(http);
      expect(queryAll(reqFalse.request, 'flag')).toEqual(['false']);
      reqFalse.flush({});
      await second;
    });

    it('[R-HEADER-PARAM] Header-Parameter werden gesendet', async () => {
      // Audit: Operation existiert, verwirft aber die spec-definierten Header-Parameter (headerAndCookieParams() ohne
      // Parameter) → "vorhanden, aber falsch" = fail (konsistent zu T-PARAM-HEADER und zu verworfenen Bodies).
      const result = firstValueFrom(params().headerAndCookieParams());
      const req = expectSingleRequest(http);
      const sent = [req.request.headers.get('X-Request-Id'), req.request.headers.get('X-Retry-Count'), req.request.headers.get('X-Trace-Flags')];
      req.flush({});
      await result;
      expect(sent, 'headerAndCookieParams() bietet keine Header-Parameter an').toEqual([UUID, '3', 'a,b']);
    });

    it.skip('[R-COOKIE-PARAM] Cookie-Parameter — unsupported: ng-openapi verwirft in:cookie-Parameter (und Browser verbietet Cookie-Header)', () => {});

    it('[R-NAME-RESERVED-PARAM] Originalnamen in Pfad/Query', async () => {
      const result = firstValueFrom(params().reservedParamNames('x', 'd', 5, 'n'));
      const req = expectSingleRequest(http);
      expect(pathOf(req.request)).toBe('/api/params/reserved/x');
      expect(rawQueryOf(req.request)).toBe('default=d&page-size=5&filter.name=n');
      req.flush({});
      await result;
    });
  });

  describe('bodies', () => {
    it('[R-BODY-JSON] createPet JSON-Body', async () => {
      const result = firstValueFrom(pets().createPet(fullPet));
      const req = expectSingleRequest(http);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(fullPet);
      expect(effectiveContentType(req.request)).toBe('application/json');
      req.flush(PET_RESPONSE);
      await result;
    });

    it('[R-NULL-SEND] nickname: null bleibt im Body', async () => {
      const result = firstValueFrom(pets().updatePet(1, { ...fullPet, nickname: null }));
      const req = expectSingleRequest(http);
      const sent = JSON.parse(String(serializedBody(req.request)));
      expect(sent).toHaveProperty('nickname', null);
      req.flush(PET_RESPONSE);
      await result;
    });

    it('[R-BODY-MERGE-PATCH] patchPet application/merge-patch+json', async () => {
      // ng-openapi erzeugt patchPet(petId) OHNE Body-Parameter (merge-patch+json nicht erkannt) → body: null,
      // Content-Type application/json. Ein Body kann über die generierte API nicht übergeben werden.
      const result = firstValueFrom(pets().patchPet(1));
      const req = expectSingleRequest(http);
      expect(req.request.method).toBe('PATCH');
      expect(effectiveContentType(req.request)).toBe('application/merge-patch+json');
      expect(req.request.body).not.toBeNull();
      req.flush(PET_RESPONSE);
      await result;
    });

    it('[R-BODY-FORM-URLENCODED] submitForm', async () => {
      const result = firstValueFrom(bodies().submitForm('u', 'p', true));
      const req = expectSingleRequest(http);
      expect(effectiveContentType(req.request)).toBe('application/x-www-form-urlencoded');
      const sent = new URLSearchParams(String(serializedBody(req.request)));
      expect(Object.fromEntries(sent.entries())).toEqual({ username: 'u', password: 'p', remember: 'true' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      await result;
    });

    it('[R-BODY-MULTIPART] uploadFiles FormData', async () => {
      const file = new Blob(['file'], { type: 'text/plain' });
      const result = firstValueFrom(bodies().uploadFiles('t', file, [new Blob(['a']), new Blob(['b'])]));
      const req = expectSingleRequest(http);
      const body = req.request.body;
      expect(body).toBeInstanceOf(FormData);
      const form = body as FormData;
      expect(form.get('title')).toBe('t');
      expect(form.get('file')).toBeInstanceOf(Blob);
      expect(form.getAll('attachments')).toHaveLength(2);
      expect(req.request.headers.has('Content-Type')).toBe(false);
      req.flush({ ids: ['1'] });
      await result;
    });

    it('[R-BODY-MULTIPART-JSON-PART] meta-Part als JSON', async () => {
      const result = firstValueFrom(
        bodies().uploadFiles('t', new Blob(['f']), undefined, { author: 'me', tags: ['x'] }),
      );
      const req = expectSingleRequest(http);
      const meta = (req.request.body as FormData).get('meta');
      // ng-openapi: formData.append('meta', String(meta)) → '[object Object]'
      const metaText = meta instanceof Blob ? await blobText(meta) : meta;
      expect(JSON.parse(String(metaText))).toEqual({ author: 'me', tags: ['x'] });
      req.flush({ ids: ['1'] });
      await result;
    });

    it('[R-BODY-OCTET] uploadBinary Blob', async () => {
      // ng-openapi erzeugt uploadBinary() OHNE Body-Parameter → body: null, Content-Type application/json.
      const result = firstValueFrom(bodies().uploadBinary());
      const req = expectSingleRequest(http);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toBeInstanceOf(Blob);
      expect(effectiveContentType(req.request)).toBe('application/octet-stream');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await result;
    });

    it('[R-BODY-TEXT] postText text/plain', async () => {
      // ng-openapi erzeugt postText() OHNE Body-Parameter → body: null, Content-Type application/json.
      const result = firstValueFrom(bodies().postText());
      const req = expectSingleRequest(http);
      expect(serializedBody(req.request)).toBe('hello');
      expect(effectiveContentType(req.request)).toBe('text/plain');
      req.flush('hello');
      await result;
    });

    it('[R-BODY-POLYMORPHIC] createShape unverändert', async () => {
      const shape = { kind: 'circle', radius: 2 };
      const result = firstValueFrom(TestBed.inject(PolymorphismService).createShape(shape));
      const req = expectSingleRequest(http);
      expect(req.request.body).toEqual({ kind: 'circle', radius: 2 });
      req.flush(shape);
      await result;
    });

    it('[R-NAME-SPECIAL-PROPS] exakte Property-Namen am Wire', async () => {
      const weird: WeirdNames = { 'x-request-id': 'r', '@type': 't', '1stPlace': true, snake_case_prop: 's', 'with space': 'w', constructor: 'c' };
      const result = firstValueFrom(TestBed.inject(NamingService).specialProperties(weird));
      const req = expectSingleRequest(http);
      expect(JSON.parse(String(serializedBody(req.request)))).toEqual(weird);
      // Response-Fixture als JSON-Roundtrip (WeirdNames.constructor: string kollidiert mit Object.constructor im flush-Typ)
      req.flush(JSON.parse(JSON.stringify(weird)));
      const parsed = await result;
      expect(parsed['x-request-id']).toBe('r');
      expect(parsed['@type']).toBe('t');
      expect(parsed['1stPlace']).toBe(true);
    });
  });

  describe('responses', () => {
    it('[R-RESP-204] deletePet completes', async () => {
      let completed = false;
      const done = new Promise<void>((resolve, reject) =>
        pets().deletePet(1).subscribe({ complete: () => { completed = true; resolve(); }, error: reject }),
      );
      expectSingleRequest(http).flush(null, { status: 204, statusText: 'No Content' });
      await done;
      expect(completed).toBe(true);
    });

    it('[R-RESP-BLOB] downloadFile Blob', async () => {
      const result = firstValueFrom(responses().downloadFile());
      const req = expectSingleRequest(http);
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['content']));
      const blob = await result;
      expect(blob).toBeInstanceOf(Blob);
      expect(await blobText(blob)).toBe('content');
    });

    it('[R-RESP-TEXT] postText responseType text', async () => {
      const result = firstValueFrom(bodies().postText());
      const req = expectSingleRequest(http);
      expect(req.request.responseType).toBe('text');
      req.flush('plain text');
      expect(await result).toBe('plain text');
    });

    it('[R-RESP-VENDOR-JSON] vendor JSON als Objekt', async () => {
      const result = firstValueFrom(responses().getVendorJson());
      const req = expectSingleRequest(http);
      expect(req.request.responseType).toBe('json');
      expect(req.request.headers.get('Accept')).toContain('application/vnd.bench.v1+json');
      req.flush({ name: 'tag' });
      expect(await result).toEqual({ name: 'tag' });
    });

    it('[R-ACCEPT-HEADER] JSON-Variante Accept application/json (PDF nicht wählbar)', async () => {
      const result = firstValueFrom(responses().reportByAccept());
      const req = expectSingleRequest(http);
      expect(req.request.headers.get('Accept')).toBe('application/json');
      expect(req.request.responseType).toBe('json');
      req.flush({ title: 'r' });
      await result;
    });

    it('[R-RESP-DATE-CONSISTENT] dateTime als string typisiert → string', async () => {
      const result = firstValueFrom(responses().getDates());
      expectSingleRequest(http).flush({ date: '2024-01-02', dateTime: '2024-01-02T03:04:05Z' });
      const dates = await result;
      expect(typeof dates.dateTime).toBe('string');
      expect(typeof dates.date).toBe('string');
    });

    it('[R-RESP-201-LOCATION] Status 201 + Location via observe response', async () => {
      const result = firstValueFrom(pets().createPet(fullPet, 'response'));
      expectSingleRequest(http).flush(PET_RESPONSE, {
        status: 201,
        statusText: 'Created',
        headers: { Location: `${TEST_BASE_URL}/pets/1` },
      });
      const response: HttpResponse<Pet> = await result;
      expect(response.status).toBe(201);
      expect(response.headers.get('Location')).toBe(`${TEST_BASE_URL}/pets/1`);
    });

    it('[R-ERROR-BODY] 404 Problem-Body auslesbar', async () => {
      const result = firstValueFrom(pets().getPet(99));
      expectSingleRequest(http).flush(PROBLEM_RESPONSE, { status: 404, statusText: 'Not Found' });
      const error: unknown = await result.then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(HttpErrorResponse);
      expect((error as HttpErrorResponse).error.title).toBe('Not Found');
    });
  });

  describe('auth', () => {
    // ng-openapi wertet securitySchemes/security überhaupt nicht aus: kein Token-/Key-Konfig im Provider,
    // AuthService-Methoden sind identisch zu ungesicherten Operationen. Nur manueller Interceptor möglich.
    it.skip('[R-AUTH-BEARER] Bearer via Konfiguration — unsupported: keine Security-Konfiguration generiert', () => {});
    it.skip('[R-AUTH-APIKEY-HEADER] API-Key-Header via Konfiguration — unsupported: keine Security-Konfiguration generiert', () => {});
    it.skip('[R-AUTH-APIKEY-QUERY] API-Key-Query via Konfiguration — unsupported: keine Security-Konfiguration generiert', () => {});
    it.skip('[R-AUTH-BASIC] Basic via Konfiguration — unsupported: keine Security-Konfiguration generiert', () => {});
    it.skip('[R-AUTH-OAUTH2] OAuth2 via Konfiguration — unsupported: keine Security-Konfiguration generiert', () => {});
    it.skip('[R-AUTH-NONE] security: [] ohne Authorization — unsupported: ohne Token-Konfiguration nicht prüfbar (keine Security-Unterstützung)', () => {});
  });
});
