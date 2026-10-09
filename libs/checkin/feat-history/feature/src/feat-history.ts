import { Component, inject } from '@angular/core';
import type { Checkin } from '@mo-transfer/checkin/generated/checkin-client/types';
import { CheckinStore } from '@mo-transfer/checkin/state';
// shared between sibling feats: lives in the slice root (no feat-port)
import { checkinLabel, describeDesk } from '@mo-transfer/checkin/utils';

// boundary-violation-example: import { CheckinDeskStore } from '@mo-transfer/checkin/feat-checkin/state'; // sibling feat (never, no feat-port)

@Component({
  selector: 'app-feat-history',
  template: `
    <h2>Check-in history</h2>
    <p>{{ deskStatus }}</p>
    <ul>
      @for (checkin of checkinStore.all(); track checkin.id) {
        <li>{{ label(checkin) }} — {{ checkin.checked_in_at }}</li>
      }
    </ul>
  `,
})
export class FeatHistory {
  protected readonly checkinStore = inject(CheckinStore);

  protected readonly deskStatus = describeDesk({ openArrivals: 0 });

  protected label(checkin: Checkin): string {
    return checkinLabel(checkin);
  }
}
