import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { NotificationsService } from '@mo-transfer/generated/notification-client/api';
import type { Notification } from '@mo-transfer/generated/notification-client/types';
import { firstValueFrom } from 'rxjs';

/**
 * Notifications of topic "checkin", backed by the shared generated notification-client. The rest of the
 * slice never sees the generated service — this class is the wrapper. It returns the generated DTOs as they are.
 */
@Injectable({ providedIn: 'root' })
export class CheckinNotifications {
  private readonly notifications = inject(NotificationsService);

  async load(): Promise<Notification[]> {
    try {
      return await firstValueFrom(this.notifications.listNotifications({ topic: 'checkin' }), {
        defaultValue: [],
      });
    } catch (error) {
      throw failure(error, 'GET /api/notifications');
    }
  }

  async markRead(id: string): Promise<void> {
    try {
      await firstValueFrom(this.notifications.markNotificationRead({ id }), { defaultValue: undefined });
    } catch (error) {
      throw failure(error, `POST /api/notifications/${id}/read`);
    }
  }
}


function failure(error: unknown, request: string): unknown {
  return error instanceof HttpErrorResponse ? new Error(`${request} failed: ${error.status}`) : error;
}
