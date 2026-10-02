import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
// boundary-violation-example: import { BookingStore } from '@mo-transfer/booking/state'; // shell -> slice internals (only entry + shared)

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {}
