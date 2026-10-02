import { Route } from '@angular/router';
import { LayoutShell } from '@mo-transfer/layout/shell';

// boundary-violation-example: import { BookingCard } from '@mo-transfer/booking/ui'; // shell -> slice internals (only entry + shared)

/** App shell: composes slices via their entries (routes/shells) only. */
export const appRoutes: Route[] = [
  {
    path: '',
    component: LayoutShell,
    children: [
      {
        path: 'bookings',
        loadChildren: () => import('@mo-transfer/booking/shell').then((m) => m.bookingRoutes),
      },
      {
        path: 'checkin',
        loadChildren: () => import('@mo-transfer/checkin/shell').then((m) => m.checkinRoutes),
      },
      { path: '', pathMatch: 'full', redirectTo: 'bookings' },
    ],
  },
];
