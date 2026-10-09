import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ArrivalsService, CheckinsService } from '@mo-transfer/checkin/generated/checkin-client/api';
import type { Arrival, Checkin } from '@mo-transfer/checkin/generated/checkin-client/types';
import { firstValueFrom, Observable } from 'rxjs';

/**
 * HTTP access of the checkin domain (data-access layer). Arrivals come from checkin's own endpoint — the
 * booking slice is out of reach (no ports, slices never import each other).
 *
 * Backed by the generated checkin-client (libs/checkin/generated/checkin-client, adapter openapi-tools). Returns the
 * generated DTOs as they are (no mapping, no own model): Promise instead of Observable, Error with status.
 */
@Injectable({ providedIn: 'root' })
export class CheckinApi {
  private readonly checkins = inject(CheckinsService);
  private readonly arrivals = inject(ArrivalsService);

  async loadCheckins(): Promise<Checkin[]> {
    return load(this.checkins.listCheckins(), 'GET /api/checkins');
  }

  async loadArrivals(): Promise<Arrival[]> {
    return load(this.arrivals.listArrivals(), 'GET /api/arrivals');
  }
}

/**
 * HttpClient completes WITHOUT a value only when the request was cancelled (injector destroyed: app teardown,
 * TestBed reset between specs) — nothing to load then, instead of an EmptyError.
 */
async function load<T>(request: Observable<T[]>, label: string): Promise<T[]> {
  try {
    return await firstValueFrom(request, { defaultValue: [] });
  } catch (error) {
    if (error instanceof HttpErrorResponse) throw new Error(`${label} failed: ${error.status}`);
    throw error;
  }
}
