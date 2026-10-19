# Selbst ausprobieren

Voraussetzungen: Node 22 (≥ 22.16), pnpm 10, Java 11+ (`java -version`, für den Adapter openapi-tools), Netz beim ersten Lauf (Jar-Download, Petstore-URL).

```sh
# 1. frischer Checkout
git clone git@github.com:michaelbe812/mo-transfer.git && cd mo-transfer
pnpm install
pnpm exec playwright install chromium          # einmalig, Browser für die Tests

# 2. generieren (optional: build/lint/test/typecheck generieren selbst; hilft der IDE)
pnpm openapi:generate                           # = nx run-many -t generate-api-client generate-api-testing, 6 Tasks
git status                                      # leer: generierter Code ist gitignored
ls libs/booking/generated/booking-client/*/src/generated

# 3. bauen, testen, prüfen
pnpm exec nx run-many -t build lint test typecheck
pnpm verify                                     # nx run tooling-verify:verify, 181 Fälle + Checks
pnpm exec nx sync:check

# 4. ansehen
pnpm exec nx graph                              # Projekte generated-*, Kanten Teil → Client
pnpm exec nx show project booking-generated-booking-client   # Targets generate-api-client/update-spec (inferiert aus openapi-clients.json), Inputs
cat libs/booking/state/project.json               # Tags + leere Targets, Bodies: nx.json → targetDefaults
pnpm exec nx show projects --affected --files libs/generated/notification-client/openapi.yaml
pnpm exec nx graph --focus=tooling-workspace     # Tooling-Libs: workspace → conventions, openapi; openapi → conventions
pnpm exec nx run-many -t lint test typecheck -p 'tooling-*'   # Specs der Tooling-Libs
pnpm exec nx show projects --affected --files packages/tooling/ng-lib/src/test.js    # Libs mit test + Abhängige
pnpm exec nx show projects --affected --files packages/tooling/conventions/src/lib-conventions.ts   # nur Tooling (Tags stehen in project.json)

# 5. Tests interaktiv: Vitest UI (watch, headed Chromium mit Browser-Vorschau, MSW läuft wie im Test), bis Strg+C oder q
pnpm test:ui booking-state                      # = nx run booking-state:test --ui → http://localhost:51204/__vitest__/
pnpm exec nx run booking-state:test --ui --headless   # UI ohne Browserfenster (Tests laufen headless, Ergebnis in der UI)
pnpm exec nx run booking-state:test --browsers=chromium --watch   # nur headed, ohne UI

# 6. neuen Client anlegen (Datei oder URL), nutzen, wieder entfernen
cat > /tmp/demo.yaml <<'YAML'
openapi: 3.0.3
info: { title: Demo API, version: 1.0.0 }
servers: [{ url: /api }]
paths:
  /greetings:
    get:
      operationId: listGreetings
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { type: array, items: { $ref: "#/components/schemas/Greeting" } }
components:
  schemas:
    Greeting:
      type: object
      required: [id, text]
      properties:
        id: { type: string, example: g-1 }
        text: { type: string, example: Hello }
YAML
pnpm exec nx g @mo-transfer/tooling-openapi:client demo-client --spec=/tmp/demo.yaml   # shared; Domain: --domain=checkin, Adapter: --adapter=hey-api
pnpm exec nx run-many -t build lint test typecheck
#   nutzen: @mo-transfer/generated/demo-client/api im data-access-Layer, in Specs
#   import { demoClientHandlers, demoClientHttp } from '@mo-transfer/generated/demo-client/testing'
pnpm exec nx g @mo-transfer/tooling-workspace:remove generated/demo-client
git status                                      # wieder leer

# 7. Adapter tauschen (booking-client)
#   openapi-clients.json: "booking/generated/booking-client": { "adapter": "hey-api" }
#   inferierte generate-api-client-Inputs auf hey-api (pnpm verify nennt die erwarteten)
#   libs/booking/data-access/src/booking-api.ts: Variante B (siehe openapi-clients.md → Adapter)
pnpm exec nx run-many -t build lint test typecheck
git checkout openapi-clients.json libs/booking/data-access/src/booking-api.ts libs/booking/generated/booking-client/project.json

# 8. Spec aktualisieren (nur Clients mit url)
pnpm exec nx run generated-pet-client:update-spec   # "unchanged" oder "updated"
git diff libs/generated/pet-client/openapi.yaml

# 9. Cache pro Client
#   openapi-clients.json: "generated/pet-client": { "url": "…", "options": { "providedIn": "root" } }
pnpm exec nx run-many -t build lint test typecheck generate-api-client generate-api-testing   # nur generated-pet-client:generate-api-client läuft neu
git checkout openapi-clients.json

# 10. Negativprobe Boundaries
printf "import { BookingsService } from '@mo-transfer/booking/generated/booking-client/api';\nexport const x = BookingsService;\n" > libs/booking/ui/src/probe.ts
pnpm exec nx lint booking-ui                    # rot: type:ui darf kein type:data-access
mv libs/booking/ui/src/probe.ts libs/checkin/data-access/src/probe.ts
pnpm exec nx lint checkin-data-access           # rot: scope:checkin nie ein fremder Slice
rm libs/checkin/data-access/src/probe.ts

# 11. Negativprobe fehlender Handler
#   in libs/booking/data-access/src/booking-notifications.spec.ts die Zeile
#   beforeEach(() => worker.use(...notificationClientHandlers)); auskommentieren
pnpm exec nx test booking-data-access           # rot: [MSW] … without a matching request handler
git checkout libs/booking/data-access/src/booking-notifications.spec.ts
```
