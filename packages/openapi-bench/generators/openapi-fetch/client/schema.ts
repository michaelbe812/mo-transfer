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
    "/pets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Liste Pets (paginiert) */
        get: operations["listPets"];
        put?: never;
        post: operations["createPet"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/pets/{petId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                petId: number;
            };
            cookie?: never;
        };
        get: operations["getPet"];
        put: operations["updatePet"];
        post?: never;
        delete: operations["deletePet"];
        options?: never;
        head?: never;
        patch: operations["patchPet"];
        trace?: never;
    };
    "/params/path/{stringId}/{intId}/{uuidId}/{enumId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["multiPathParams"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/params/query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["queryStyles"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/params/header-cookie": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["headerAndCookieParams"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/params/reserved/{class}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["reservedParamNames"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/bodies/form-urlencoded": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["submitForm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/bodies/multipart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["uploadFiles"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/bodies/binary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["uploadBinary"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/bodies/text": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["postText"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/bodies/optional": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["optionalBody"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/bodies/inline": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["inlineSchemas"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/responses/multi-status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["multiStatus"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/responses/download": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["downloadFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/responses/pdf-or-json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["reportByAccept"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/responses/dates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getDates"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/responses/primitives": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getPrimitiveArray"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/responses/map": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getInventory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/responses/vendor-json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getVendorJson"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/polymorphism/shapes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listShapes"];
        put?: never;
        post: operations["createShape"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/polymorphism/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/polymorphism/payment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["pay"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/polymorphism/tree": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getTree"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/bearer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["authBearer"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/api-key-header": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["authApiKeyHeader"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/api-key-query": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["authApiKeyQuery"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/basic": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["authBasic"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/oauth2": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["authOauth2"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/public": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["authPublic"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/naming/special-properties": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["specialProperties"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/naming/no-operation-id": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ohne operationId */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Tag"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/naming/deprecated": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @deprecated */
        get: operations["deprecatedOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/naming/kebab-op-id": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["get-kebab_snake.op"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/schemas/kitchen-sink": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getKitchenSink"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/untagged": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["untaggedOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Primitives: {
            str: string;
            /** Format: int32 */
            int32: number;
            /** Format: int64 */
            int64: number;
            /** Format: float */
            float: number;
            /** Format: double */
            double: number;
            bool: boolean;
            /** Format: uuid */
            uuid: string;
            /** Format: email */
            email: string;
            /** Format: uri */
            uri: string;
            /** Format: byte */
            byte: string;
            /** Format: password */
            password?: $Write<string>;
        };
        DateHolder: {
            /** Format: date */
            date: string;
            /** Format: date-time */
            dateTime: string;
            /** Format: date-time */
            optionalDateTime?: string;
            /** Format: date-time */
            nullableDateTime?: string | null;
            dateTimes?: string[];
        };
        /**
         * @description Status eines Pets
         * @enum {string}
         */
        PetStatus: "available" | "pending" | "sold";
        /** @enum {integer} */
        Priority: Priority;
        /** @enum {string|null} */
        NullableColor: "red" | "green" | "blue" | null;
        /** @enum {string} */
        WeirdEnum: "with space" | "kebab-case" | "1starts-with-digit" | "UPPER" | "lower" | "";
        Pet: {
            /** Format: int64 */
            id: $Read<number>;
            /** @example Bello */
            name: string;
            status: components["schemas"]["PetStatus"];
            priority?: components["schemas"]["Priority"];
            color?: components["schemas"]["NullableColor"];
            nickname?: string | null;
            photoUrls: string[];
            tags?: components["schemas"]["Tag"][];
            category?: components["schemas"]["Category"];
            /** Format: date */
            birthDate?: string;
            /** @default false */
            vaccinated?: boolean;
            /** Format: double */
            weightKg?: number;
            /** Format: date-time */
            createdAt?: $Read<string>;
            secretChipCode?: $Write<string>;
            /**
             * @deprecated
             * @description Veraltet, wird entfernt
             */
            legacyCode?: string;
            attributes?: {
                [key: string]: string;
            };
            metadata?: {
                [key: string]: unknown;
            };
        };
        /** @description Merge-Patch (alle Felder optional) */
        PetPatch: {
            name?: string;
            status?: components["schemas"]["PetStatus"];
            nickname?: string | null;
        };
        PetPage: components["schemas"]["PageMeta"] & {
            items: components["schemas"]["Pet"][];
        };
        PageMeta: {
            /** Format: int32 */
            total: number;
            /** Format: int32 */
            limit: number;
            /** Format: int32 */
            offset: number;
        };
        Tag: {
            /** Format: int64 */
            id?: number;
            name: string;
        };
        Category: {
            /** Format: int64 */
            id?: number;
            name?: string;
            parent?: components["schemas"]["Category"];
        };
        PetFilter: {
            name?: string;
            status?: components["schemas"]["PetStatus"];
            minAge?: number;
        };
        /** @description Server spiegelt Request (nur für Runtime-Tests relevant) */
        Echo: {
            method?: string;
            url?: string;
            headers?: {
                [key: string]: string;
            };
        };
        Job: {
            /** Format: uuid */
            jobId: string;
            /** @enum {string} */
            state: "queued" | "running";
        };
        Report: {
            title: string;
            rows?: number[][];
        };
        UploadMeta: {
            author?: string;
            tags?: string[];
        };
        UploadResult: {
            ids: string[];
            /** Format: int64 */
            sizeBytes?: number;
        };
        Problem: {
            /** Format: uri */
            type: string;
            title: string;
            status: number;
            detail?: string;
        };
        ValidationProblem: components["schemas"]["Problem"] & {
            errors: {
                field: string;
                message: string;
            }[];
        };
        Settings: {
            strict: {
                a?: string;
            };
            freeForm?: {
                [key: string]: unknown;
            };
            freeFormImplicit?: Record<string, never>;
            counters?: {
                [key: string]: number;
            };
            refMap?: {
                [key: string]: components["schemas"]["Tag"];
            };
            mixed?: {
                known: string;
            } & {
                [key: string]: string;
            };
            matrix?: number[][];
            uniqueTags?: string[];
            anything?: unknown;
        };
        Shape: components["schemas"]["Circle"] | components["schemas"]["Rectangle"] | components["schemas"]["Triangle"];
        ShapeBase: {
            kind: string;
            label?: string;
        };
        Circle: components["schemas"]["ShapeBase"] & {
            radius: number;
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "circle";
        };
        Rectangle: components["schemas"]["ShapeBase"] & {
            width: number;
            height: number;
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "rect";
        };
        Triangle: components["schemas"]["ShapeBase"] & {
            a: number;
            b: number;
            c: number;
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "tri";
        };
        BaseEvent: {
            eventType: string;
            /** Format: date-time */
            occurredAt: string;
        };
        CreatedEvent: Omit<components["schemas"]["BaseEvent"], "eventType"> & {
            /** Format: int64 */
            petId: number;
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            eventType: "created";
        };
        DeletedEvent: Omit<components["schemas"]["BaseEvent"], "eventType"> & {
            reason: string;
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            eventType: "deleted";
        };
        CardPayment: {
            cardNumber: string;
            cvc: string;
        };
        SepaPayment: {
            iban: string;
        };
        PaymentRequest: {
            amount: number;
            method: components["schemas"]["CardPayment"] | components["schemas"]["SepaPayment"];
            note?: string | number;
        };
        PaymentResult: {
            /** @enum {boolean} */
            ok: true;
            transactionId?: string;
        } | components["schemas"]["Problem"];
        TreeNode: {
            value: string;
            children?: components["schemas"]["TreeNode"][];
            parent?: components["schemas"]["TreeParentRef"];
        };
        TreeParentRef: {
            node?: components["schemas"]["TreeNode"];
        };
        WeirdNames: {
            "x-request-id": string;
            "@type": string;
            $ref?: string;
            "1stPlace"?: boolean;
            snake_case_prop?: string;
            "with space"?: string;
            class?: string;
            default?: string;
            delete?: boolean;
            constructor?: string;
            __proto_like?: string;
        };
        /** @description Schema-Name kollidiert mit globalem TS-Typ Date */
        Date: {
            value?: string;
        };
        /** @description Schema-Name kollidiert mit globalem TS-Typ Object */
        Object: {
            value?: string;
        };
        /** @description Schema-Name mit Bindestrich */
        "user-profile": {
            displayName?: string;
            birthday?: components["schemas"]["Date"];
            raw?: components["schemas"]["Object"];
        };
        KitchenSink: {
            settings: components["schemas"]["Settings"];
            primitives: components["schemas"]["Primitives"];
            weirdEnum?: components["schemas"]["WeirdEnum"];
            profile?: components["schemas"]["user-profile"];
            dates?: components["schemas"]["DateHolder"];
        };
        UnreferencedModel: {
            /** @enum {string} */
            marker: "unreferenced";
        };
    };
    responses: {
        /** @description Fehler */
        Error: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Problem"];
            };
        };
        /** @description Validierungsfehler */
        ValidationError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ValidationProblem"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type SchemaPrimitives = components['schemas']['Primitives'];
export type SchemaDateHolder = components['schemas']['DateHolder'];
export type SchemaPet = components['schemas']['Pet'];
export type SchemaPetPatch = components['schemas']['PetPatch'];
export type SchemaPetPage = components['schemas']['PetPage'];
export type SchemaPageMeta = components['schemas']['PageMeta'];
export type SchemaTag = components['schemas']['Tag'];
export type SchemaCategory = components['schemas']['Category'];
export type SchemaPetFilter = components['schemas']['PetFilter'];
export type SchemaEcho = components['schemas']['Echo'];
export type SchemaJob = components['schemas']['Job'];
export type SchemaReport = components['schemas']['Report'];
export type SchemaUploadMeta = components['schemas']['UploadMeta'];
export type SchemaUploadResult = components['schemas']['UploadResult'];
export type SchemaProblem = components['schemas']['Problem'];
export type SchemaValidationProblem = components['schemas']['ValidationProblem'];
export type SchemaSettings = components['schemas']['Settings'];
export type SchemaShape = components['schemas']['Shape'];
export type SchemaShapeBase = components['schemas']['ShapeBase'];
export type SchemaCircle = components['schemas']['Circle'];
export type SchemaRectangle = components['schemas']['Rectangle'];
export type SchemaTriangle = components['schemas']['Triangle'];
export type SchemaBaseEvent = components['schemas']['BaseEvent'];
export type SchemaCreatedEvent = components['schemas']['CreatedEvent'];
export type SchemaDeletedEvent = components['schemas']['DeletedEvent'];
export type SchemaCardPayment = components['schemas']['CardPayment'];
export type SchemaSepaPayment = components['schemas']['SepaPayment'];
export type SchemaPaymentRequest = components['schemas']['PaymentRequest'];
export type SchemaPaymentResult = components['schemas']['PaymentResult'];
export type SchemaTreeNode = components['schemas']['TreeNode'];
export type SchemaTreeParentRef = components['schemas']['TreeParentRef'];
export type SchemaWeirdNames = components['schemas']['WeirdNames'];
export type SchemaDate = components['schemas']['Date'];
export type SchemaObject = components['schemas']['Object'];
export type SchemaUserProfile = components['schemas']['user-profile'];
export type SchemaKitchenSink = components['schemas']['KitchenSink'];
export type SchemaUnreferencedModel = components['schemas']['UnreferencedModel'];
export type ResponseError = components['responses']['Error'];
export type ResponseValidationError = components['responses']['ValidationError'];
export type $defs = Record<string, never>;
export interface operations {
    listPets: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                status?: components["schemas"]["PetStatus"];
                vaccinated?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seite mit Pets */
            200: {
                headers: {
                    "X-Total-Count"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PetPage"];
                };
            };
            default: components["responses"]["Error"];
        };
    };
    createPet: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Pet"];
            };
        };
        responses: {
            /** @description Angelegt */
            201: {
                headers: {
                    Location: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Pet"];
                };
            };
            422: components["responses"]["ValidationError"];
        };
    };
    getPet: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                petId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Pet */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Pet"];
                };
            };
            /** @description Nicht gefunden */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    updatePet: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                petId: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Pet"];
            };
        };
        responses: {
            /** @description Aktualisiert */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Pet"];
                };
            };
        };
    };
    deletePet: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                petId: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Gelöscht */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    patchPet: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                petId: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/merge-patch+json": components["schemas"]["PetPatch"];
            };
        };
        responses: {
            /** @description Gepatcht */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Pet"];
                };
            };
        };
    };
    multiPathParams: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                stringId: string;
                intId: number;
                uuidId: string;
                enumId: components["schemas"]["PetStatus"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Echo */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Echo"];
                };
            };
        };
    };
    queryStyles: {
        parameters: {
            query: {
                required: string;
                tagsExplode?: string[];
                tagsCsv?: string[];
                tagsPipe?: string[];
                tagsSpace?: number[];
                filter?: components["schemas"]["PetFilter"];
                point?: {
                    x?: number;
                    y?: number;
                };
                since?: string;
                day?: string;
                flag?: boolean;
                sort?: "asc" | "desc";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Echo */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Echo"];
                };
            };
        };
    };
    headerAndCookieParams: {
        parameters: {
            query?: never;
            header: {
                "X-Request-Id": string;
                "X-Trace-Flags"?: string[];
                "X-Retry-Count"?: number;
            };
            path?: never;
            cookie?: {
                session?: string;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Echo */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Echo"];
                };
            };
        };
    };
    reservedParamNames: {
        parameters: {
            query?: {
                default?: string;
                "page-size"?: number;
                "filter.name"?: string;
            };
            header?: never;
            path: {
                class: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Echo */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Echo"];
                };
            };
        };
    };
    submitForm: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": {
                    username: string;
                    /** Format: password */
                    password: string;
                    remember?: boolean;
                    scopes?: string[];
                };
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
    uploadFiles: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    title: string;
                    /** Format: binary */
                    file: Blob;
                    attachments?: Blob[];
                    meta?: components["schemas"]["UploadMeta"];
                };
            };
        };
        responses: {
            /** @description Hochgeladen */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadResult"];
                };
            };
        };
    };
    uploadBinary: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/octet-stream": Blob;
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
    postText: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "text/plain": string;
            };
        };
        responses: {
            /** @description Echo als Text */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/plain": string;
                };
            };
        };
    };
    optionalBody: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["Tag"];
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
    inlineSchemas: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    mode: "fast" | "slow";
                    nested?: {
                        depth?: number;
                    };
                };
            };
        };
        responses: {
            /** @description Inline-Antwort */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        accepted: boolean;
                        id: string;
                    };
                };
            };
        };
    };
    multiStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Existierte schon */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Pet"];
                };
            };
            /** @description Angenommen, wird verarbeitet */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Job"];
                };
            };
        };
    };
    downloadFile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Datei */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": Blob;
                };
            };
        };
    };
    reportByAccept: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description JSON oder PDF */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Report"];
                    "application/pdf": Blob;
                };
            };
        };
    };
    getDates: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Daten */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DateHolder"];
                };
            };
        };
    };
    getPrimitiveArray: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Liste von Zahlen */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": number[];
                };
            };
        };
    };
    getInventory: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Map Status → Anzahl */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: number;
                    };
                };
            };
        };
    };
    getVendorJson: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Vendor-JSON (application/vnd.bench+json) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/vnd.bench.v1+json": components["schemas"]["Tag"];
                };
            };
        };
    };
    listShapes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Formen */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Shape"][];
                };
            };
        };
    };
    createShape: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Shape"];
            };
        };
        responses: {
            /** @description Angelegt */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Shape"];
                };
            };
        };
    };
    listEvents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Events (allOf-Vererbung mit Discriminator am Parent) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BaseEvent"][];
                };
            };
        };
    };
    pay: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PaymentRequest"];
            };
        };
        responses: {
            /** @description Ergebnis */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentResult"];
                };
            };
        };
    };
    getTree: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Baum */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TreeNode"];
                };
            };
        };
    };
    authBearer: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
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
    authApiKeyHeader: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
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
    authApiKeyQuery: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
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
    authBasic: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
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
    authOauth2: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
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
    authPublic: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
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
    specialProperties: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WeirdNames"];
            };
        };
        responses: {
            /** @description Echo */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WeirdNames"];
                };
            };
        };
    };
    deprecatedOperation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
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
    "get-kebab_snake.op": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
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
    getKitchenSink: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Referenziert alle Modell-Schemas, damit sie generiert werden */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KitchenSink"];
                };
            };
        };
    };
    untaggedOperation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
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
}
export enum Priority {
    // Niedrig
    LOW = 1,
    // Mittel
    MEDIUM = 2,
    // Hoch
    HIGH = 3
}
