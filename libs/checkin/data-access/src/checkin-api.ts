import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ArrivalsService, CheckinsService } from '@mo-transfer/checkin/generated/checkin-client/api';
import type {
  Arrival as ArrivalDto,
  Checkin as CheckinClientDto,
} from '@mo-transfer/checkin/generated/checkin-client/types';
import { Arrival, CheckinDto } from '@mo-transfer/checkin/types';
import { firstValueFrom, Observable } from 'rxjs';

/**
 * HTTP access of the checkin domain (data-access layer). Arrivals come from checkin's own endpoint — the
 * booking slice is out of reach (no ports, slices never import each other).
 *
 * Backed by the generated checkin-client (libs/checkin/generated/checkin-client, adapter openapi-tools). It keeps
 * its own contract (Promise, checkin types, Error with status): the generated service API stays behind it.
 */
@Injectable({ providedIn: 'root' })
export class CheckinApi {
  private readonly checkins = inject(CheckinsService);
  private readonly arrivals = inject(ArrivalsService);

  async loadCheckins(): Promise<CheckinDto[]> {
    return (await load(this.checkins.listCheckins(), 'GET /api/checkins')).map(toCheckinDto);
  }

  async loadArrivals(): Promise<Arrival[]> {
    return (await load(this.arrivals.listArrivals(), 'GET /api/arrivals')).map(toArrival);
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

/** Anti-corruption: generated DTOs → checkin types (identical today, free to diverge). */
function toCheckinDto(dto: CheckinClientDto): CheckinDto {
  return { id: dto.id, booking_id: dto.booking_id, guest_name: dto.guest_name, checked_in_at: dto.checked_in_at };
}

function toArrival(dto: ArrivalDto): Arrival {
  return { bookingId: dto.bookingId, guestName: dto.guestName };
}
