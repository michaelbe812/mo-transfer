import { inject, Injectable } from '@angular/core';
import { ApiHttp } from '@mo-transfer/shared/data-access';
import { Arrival, CheckinDto } from '@mo-transfer/checkin/types';

/**
 * HTTP access of the checkin domain (data-access layer). Arrivals come from checkin's own endpoint — the
 * booking slice is out of reach (no ports, slices never import each other).
 */
@Injectable({ providedIn: 'root' })
export class CheckinApi {
  private readonly http = inject(ApiHttp);

  loadCheckins(): Promise<CheckinDto[]> {
    return this.http.get<CheckinDto[]>('/api/checkins');
  }

  loadArrivals(): Promise<Arrival[]> {
    return this.http.get<Arrival[]>('/api/arrivals');
  }
}
