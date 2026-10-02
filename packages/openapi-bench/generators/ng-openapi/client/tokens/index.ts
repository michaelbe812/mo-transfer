import { InjectionToken } from "@angular/core";
import { HttpInterceptor, HttpContextToken } from "@angular/common/http";

/**
 * Injection token for the Bench client base API path
 */
export const BASE_PATH_BENCH = new InjectionToken<string>('BASE_PATH_BENCH', {
    providedIn: 'root',
    factory: () => '/api', // Default fallback
});
/**
 * Injection token for the Bench client HTTP interceptor instances
 */
export const HTTP_INTERCEPTORS_BENCH = new InjectionToken<HttpInterceptor[]>('HTTP_INTERCEPTORS_BENCH', {
    providedIn: 'root',
    factory: () => [], // Default empty array
});
/**
 * HttpContext token to identify requests belonging to the Bench client
 */
export const CLIENT_CONTEXT_TOKEN_BENCH = new HttpContextToken<string>(() => 'Bench');
