/**
 * Dimension "angular" (A-*) für ng-openapi 0.4.1: provideBenchClient(), providedIn-root-Services, HttpClient-Features.
 */
import { ApplicationRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpContext, HttpContextToken, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { BASE_PATH_BENCH, BodiesService, PetsResource, PetsService, provideBenchClient, type Pet } from '../client';
import { PET_RESPONSE, TEST_BASE_URL, expectSingleRequest, setupHttp } from '../../../testing/http-harness';

const intercept: HttpInterceptorFn = (req, next) => next(req.clone({ setHeaders: { 'X-Intercepted': '1' } }));
const TRACE = new HttpContextToken<string>(() => 'none');

describe('ng-openapi angular', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    http = setupHttp({ providers: [provideBenchClient({ basePath: TEST_BASE_URL })], interceptors: [intercept] });
  });
  afterEach(() => http.verify());

  it('[A-PROVIDE-FN] provideBenchClient() in providers (ohne NgModule)', () => {
    expect(TestBed.inject(BASE_PATH_BENCH)).toBe(TEST_BASE_URL);
  });

  it('[A-BASEURL] getPet(1) → http://test.local/api/pets/1', async () => {
    const result = firstValueFrom(TestBed.inject(PetsService).getPet(1));
    const req = expectSingleRequest(http);
    expect(req.request.url).toBe('http://test.local/api/pets/1');
    req.flush(PET_RESPONSE);
    expect((await result).name).toBe('Bello');
  });

  it('[A-INJECT] Service via inject() ohne manuelles Providen', () => {
    const service = TestBed.runInInjectionContext(() => inject(PetsService));
    expect(service).toBeInstanceOf(PetsService);
  });

  it('[A-HTTPCLIENT] Requests laufen über HttpClient', async () => {
    const result = firstValueFrom(TestBed.inject(PetsService).getPet(1));
    const req = http.expectOne(`${TEST_BASE_URL}/pets/1`);
    expect(req.request.method).toBe('GET');
    req.flush(PET_RESPONSE);
    await result;
  });

  it('[A-INTERCEPTORS] funktionaler Interceptor greift', async () => {
    const result = firstValueFrom(TestBed.inject(PetsService).getPet(1));
    const req = expectSingleRequest(http);
    expect(req.request.headers.get('X-Intercepted')).toBe('1');
    req.flush(PET_RESPONSE);
    await result;
  });

  it('[A-HTTPCONTEXT] HttpContext pro Aufruf', async () => {
    const context = new HttpContext().set(TRACE, 'abc');
    const result = firstValueFrom(TestBed.inject(PetsService).getPet(1, 'body', { context }));
    const req = expectSingleRequest(http);
    expect(req.request.context.get(TRACE)).toBe('abc');
    req.flush(PET_RESPONSE);
    await result;
  });

  it('[A-OBSERVE-RESPONSE] HttpResponse<Pet> typisiert', async () => {
    const response$ = TestBed.inject(PetsService).getPet(1, 'response');
    const result = firstValueFrom(response$);
    expectSingleRequest(http).flush(PET_RESPONSE, { headers: { 'X-Test': 'y' } });
    const response = await result;
    expectTypeOf(response).toEqualTypeOf<HttpResponse<Pet>>();
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Test')).toBe('y');
    expect(response.body?.name).toBe('Bello');
  });

  it('[A-REPORT-PROGRESS] uploadFiles mit reportProgress/events', async () => {
    const events: unknown[] = [];
    const subscription = TestBed.inject(BodiesService)
      .uploadFiles('t', new Blob(['f']), undefined, undefined, 'events', { reportProgress: true })
      .subscribe((event) => events.push(event));
    const req = expectSingleRequest(http);
    expect(req.request.reportProgress).toBe(true);
    req.flush({ ids: ['1'] });
    subscription.unsubscribe();
    expect(events.length).toBeGreaterThan(0);
  });

  it('[A-OBSERVABLE-COLD] kein Request vor subscribe, unsubscribe bricht ab', () => {
    const pet$ = TestBed.inject(PetsService).getPet(1);
    http.expectNone(() => true);
    const subscription = pet$.subscribe();
    const req = expectSingleRequest(http);
    subscription.unsubscribe();
    expect(req.cancelled).toBe(true);
  });

  it('[A-HTTPRESOURCE] httpResource für GET (HttpResourcePlugin) → Wert nach flush = Pet', async () => {
    // httpResource() braucht einen Injection-Context → Resource-Methode darin aufrufen.
    const petResource = TestBed.runInInjectionContext(() => TestBed.inject(PetsResource).getPet(1));
    expectTypeOf(petResource.value()).toEqualTypeOf<Pet | undefined>();
    TestBed.tick();
    const req = expectSingleRequest(http);
    expect(req.request.url).toBe(`${TEST_BASE_URL}/pets/1`);
    expect(req.request.method).toBe('GET');
    req.flush(PET_RESPONSE);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(petResource.hasValue()).toBe(true);
    expect(petResource.value()).toEqual(PET_RESPONSE);
  });

  it('[A-ZONELESS] läuft zoneless (provideZonelessChangeDetection)', async () => {
    expect((globalThis as { Zone?: unknown }).Zone).toBeUndefined();
    const result = firstValueFrom(TestBed.inject(PetsService).getPet(1));
    expectSingleRequest(http).flush(PET_RESPONSE);
    expect((await result).id).toBe(1);
  });
});
