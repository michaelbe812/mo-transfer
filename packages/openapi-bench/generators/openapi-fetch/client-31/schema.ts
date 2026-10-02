export type $Read<T> = {
    readonly $read: T;
};
export type $Write<T> = {
    readonly $write: T;
};
export type Readable<T> = T extends $Write<any> ? never : T extends $Read<infer U> ? Readable<U> : T extends (infer E)[] ? Readable<E>[] : T extends object ? {
    [K in keyof T as NonNullable<T[K]> extends $Write<any> ? never : K]: Readable<T[K]>;
} : T;
export type Writable<T> = T extends $Read<any> ? never : T extends $Write<infer U> ? Writable<U> : T extends (infer E)[] ? Writable<E>[] : T extends object ? {
    [K in keyof T as NonNullable<T[K]> extends $Read<any> ? never : K]: Writable<T[K]>;
} & {
    [K in keyof T as NonNullable<T[K]> extends $Read<any> ? K : never]?: never;
} : T;
export interface paths {
    "/v31/items/{itemId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Item mit 3.1-Typen */
        get: operations["getItem31"];
        /** Item speichern */
        put: operations["putItem31"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v31/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Events mit const-Discriminator */
        get: operations["listEvents31"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v31/upload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload mit contentMediaType */
        post: operations["upload31"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface webhooks {
    itemChanged: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Webhook */
        post: operations["onItemChanged"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface components {
    schemas: {
        Item31: {
            id: string;
            /** @constant */
            kind: "item";
            nickname: string | null;
            /** Format: int32 */
            count?: number | null;
            /** @enum {unknown} */
            level?: "low" | "high" | null;
            coords: [
                number,
                number
            ];
            /** @description Sibling-Keywords neben $ref sind in 3.1 erlaubt */
            label: components["schemas"]["Label"];
            /**
             * @example [
             *       "a",
             *       "b"
             *     ]
             */
            tags?: string[];
            creditCard?: string;
            billingAddress?: string;
        };
        Label: string;
        Event31: components["schemas"]["StartEvent31"] | components["schemas"]["StopEvent31"];
        StartEvent31: {
            /** @constant */
            type: "start";
            /** Format: date-time */
            startedAt: string;
        };
        StopEvent31: {
            /** @constant */
            type: "stop";
            reason: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type SchemaItem31 = components['schemas']['Item31'];
export type SchemaLabel = components['schemas']['Label'];
export type SchemaEvent31 = components['schemas']['Event31'];
export type SchemaStartEvent31 = components['schemas']['StartEvent31'];
export type SchemaStopEvent31 = components['schemas']['StopEvent31'];
export type $defs = Record<string, never>;
export interface operations {
    getItem31: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                itemId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Item */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Item31"];
                };
            };
        };
    };
    putItem31: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                itemId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Item31"];
            };
        };
        responses: {
            /** @description OK */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    listEvents31: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Events */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Event31"][];
                };
            };
        };
    };
    upload31: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/octet-stream": unknown;
            };
        };
        responses: {
            /** @description OK */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    onItemChanged: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["Item31"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
