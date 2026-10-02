import { Routes } from '@angular/router';

/** Slice root (entry): the only thing the app shell wires up. */
export const checkinRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('@mo-transfer/checkin/feat-checkin/feature').then((m) => m.FeatCheckin),
  },
  {
    path: 'history',
    loadComponent: () =>
      import('@mo-transfer/checkin/feat-history/feature').then((m) => m.FeatHistory),
  },
];
