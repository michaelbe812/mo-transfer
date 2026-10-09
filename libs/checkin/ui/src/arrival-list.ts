import { Component, input, output } from '@angular/core';
import type { Arrival, Checkin } from '@mo-transfer/checkin/generated/checkin-client/types';
import { checkinLabel } from '@mo-transfer/checkin/utils';

// boundary-violation-example: import { CheckinStore } from '@mo-transfer/checkin/state'; // ui -> state (store, events)
// boundary-violation-example: import { nextCheckinId } from '../../../state/src/internal/next-checkin-id'; // module-private internal/

@Component({
  selector: 'app-arrival-list',
  template: `
    <ul>
      @for (checkin of checkins(); track checkin.id) {
        <li>{{ label(checkin) }}</li>
      }
    </ul>
    <button type="button" (click)="reportWalkIn()">Walk-in guest</button>
  `,
})
export class ArrivalList {
  readonly checkins = input.required<Checkin[]>();
  /** plain value out — the container turns it into the domain event */
  readonly arrived = output<Arrival>();

  protected label(checkin: Checkin): string {
    return checkinLabel(checkin);
  }

  protected reportWalkIn(): void {
    this.arrived.emit({ bookingId: 'walk-in', guestName: 'Walk-in guest' });
  }
}
