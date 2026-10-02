/**
 * NSwag-spezifische Test-Helfer. NSwag fordert JEDE Response mit responseType 'blob' an und parst selbst
 * (blobToText + JSON.parse). TestRequest.flush() wandelt weder Objekte noch Strings in Blobs → Bodies als Blob flushen.
 */
import { TestRequest } from '@angular/common/http/testing';
import { Observable, lastValueFrom } from 'rxjs';

export interface FlushOptions {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}

/** Flusht einen JSON-Body (als Blob, wie ihn HttpClient bei responseType 'blob' liefert). */
export function flushJson(req: TestRequest, body: unknown, options: FlushOptions = {}): void {
  req.flush(new Blob([JSON.stringify(body)], { type: 'application/json' }), {
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
}

/** Flusht einen Text-Body als Blob (bzw. als String, falls der Request responseType 'text' nutzt). */
export function flushText(req: TestRequest, text: string, contentType = 'text/plain'): void {
  const body = req.request.responseType === 'blob' ? new Blob([text], { type: contentType }) : text;
  req.flush(body, { headers: { 'Content-Type': contentType } });
}

/** Flusht eine leere 204-Antwort. */
export function flushNoContent(req: TestRequest): void {
  req.flush(null, { status: 204, statusText: 'No Content' });
}

/** Subscribed sofort (löst den Request aus) und liefert das letzte Ergebnis als Promise. */
export function start<T>(source: Observable<T>): Promise<T> {
  return lastValueFrom(source);
}

/** Subscribed sofort und liefert den Fehler (oder wirft, falls kein Fehler kommt). */
export async function startExpectingError(source: Observable<unknown>): Promise<unknown> {
  try {
    await lastValueFrom(source);
  } catch (error) {
    return error;
  }
  throw new Error('expected error, got success');
}
