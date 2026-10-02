/**
 * Gemeinsames Test-Harness für Runtime-/Angular-Tests aller Generatoren:
 * TestBed zoneless + HttpClient + HttpTestingController, Helfer zum Auslesen des "Wire"-Formats.
 */
import { EnvironmentProviders, Provider, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpInterceptorFn, HttpRequest, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';

/** Base-URL, die jeder Generator in seinen Runtime-Tests konfiguriert (A-BASEURL). */
export const TEST_BASE_URL = 'http://test.local/api';

export interface HttpHarnessOptions {
  providers?: (Provider | EnvironmentProviders)[];
  interceptors?: HttpInterceptorFn[];
}

/** TestBed mit HttpClient (+ optionalen funktionalen Interceptors) und HttpTestingController. */
export function setupHttp(options: HttpHarnessOptions = {}): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors(options.interceptors ?? [])),
      provideHttpClientTesting(),
      ...(options.providers ?? []),
    ],
  });
  return TestBed.inject(HttpTestingController);
}

/** Genau ein offener Request (beliebige URL); schlägt fehl, wenn 0 oder >1. */
export function expectSingleRequest(http: HttpTestingController): TestRequest {
  return http.expectOne(() => true);
}

/** Pfad-Teil des Requests (ohne Query), so wie er an den Server geht. */
export function pathOf(req: HttpRequest<unknown>): string {
  const url = req.urlWithParams;
  const withoutQuery = url.split('?')[0];
  return withoutQuery.replace(/^https?:\/\/[^/]+/, '');
}

/** Roher Query-String (ohne '?'), wie er gesendet wird — inkl. HttpParams. */
export function rawQueryOf(req: HttpRequest<unknown>): string {
  const url = req.urlWithParams;
  const index = url.indexOf('?');
  return index === -1 ? '' : url.slice(index + 1);
}

/** Query als Liste [name, value] in Reihenfolge, Name/Wert decodiert (ein + gilt als Leerzeichen). */
export function queryEntries(req: HttpRequest<unknown>): [string, string][] {
  return [...new URLSearchParams(rawQueryOf(req)).entries()];
}

/** Alle Werte eines Query-Parameters (decodiert). */
export function queryAll(req: HttpRequest<unknown>, name: string): string[] {
  return new URLSearchParams(rawQueryOf(req)).getAll(name);
}

/** Body so serialisiert, wie HttpClient ihn sendet (string | FormData | Blob | ArrayBuffer | null). */
export function serializedBody(req: HttpRequest<unknown>): ReturnType<HttpRequest<unknown>['serializeBody']> {
  return req.serializeBody();
}

/**
 * Content-Type, der tatsächlich gesendet würde: expliziter Header, sonst der von HttpClient abgeleitete
 * (detectContentTypeHeader). FormData → null (Browser setzt boundary).
 */
export function effectiveContentType(req: HttpRequest<unknown>): string | null {
  return req.headers.get('Content-Type') ?? req.detectContentTypeHeader();
}

/** Liest einen Blob als Text (Browser-Mode). */
export function blobText(blob: Blob): Promise<string> {
  return blob.text();
}

/** Beispiel-Pet, wie es der Server liefert. */
export const PET_RESPONSE = {
  id: 1,
  name: 'Bello',
  status: 'available',
  photoUrls: ['https://img.example.com/1.png'],
  nickname: null,
  createdAt: '2024-01-02T03:04:05Z',
} as const;

/** Problem-Body für Fehler-Tests. */
export const PROBLEM_RESPONSE = { type: 'about:blank', title: 'Not Found', status: 404 } as const;
