import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { Events, withEventHandlers } from '@ngrx/signals/events';

import { inject, Injectable } from '@angular/core';
import { catchError, defer, type Observable, of, pipe, switchMap, tap, throwError } from 'rxjs';
import { rxMethod } from '@ngrx/signals/rxjs-interop';


@Injectable({ providedIn: 'root' })
export class BookingApi {
  loadBookings(): Observable<string[]> {
    return of(['a', 'b']);
  }

  loadOther(): Observable<string[]> {
    return of(['aaa', 'basdf']);
  }
}

type TestState = {
  data: Array<string>;
  other: Array<string>;
};

export const TestStore = signalStore(
  withState<TestState>({ data: [], other: [] }),
  withEventHandlers((store, dataService = inject(BookingApi)) => {
    return {
    // load the data eagerly
      loadBooks$: dataService
        .loadBookings()
        .pipe(tap((books) => patchState(store, { data: books.map((b) => b) }))),
    };
  }),
  withMethods((store,dataService = inject(BookingApi)) => {

    return {
      loadOther: rxMethod<void>(pipe(switchMap(() => dataService.loadOther()),tap(other => patchState(store, {other})))),
    };
  })
);
