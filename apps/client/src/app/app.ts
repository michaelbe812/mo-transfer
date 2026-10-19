import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TestStore } from './test.store';
// boundary-violation-example: import { BookingStore } from '@mo-transfer/booking/state'; // shell -> slice internals (only entry + shared)

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  providers: [TestStore],
})
export class App {
  store = inject(TestStore);

  constructor() {
    effect(() => {console.log(this.store.data())});
    effect(() => {console.log(this.store.other())});

    setTimeout(() => this.store.loadOther(), 5000);
  }
}
