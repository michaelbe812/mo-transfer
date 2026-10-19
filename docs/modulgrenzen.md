# Modulgrenzen: Tags und depConstraints

Wie die [Architektur](architektur.md) technisch erzwungen wird: Tags in jeder `project.json`, Constraints in `eslint.config.mjs`, geprüft von `nx lint` und `pnpm verify` ([Verifikation](verifikation.md)). Visueller Vergleich vollständig vs. reduziert: [`blueprint-vergleich.html`](blueprint-vergleich.html).

## Tag-Schema

| Achse | Tags | Wo |
|---|---|---|
| Scope | `scope:<slice>`, `scope:shared` | jede Lib |
| Type | `type:types\|utils\|data-access\|state\|ui\|feature`, `type:app`, `type:tooling`, `type:testing` | jede Lib/App/Package |
| Feat | `feat:<feat>` bzw. `feat:none` | jede Lib |
| Marker | `entry`, `generated` | Slice-shell, generierte Client-Libs (siehe [OpenAPI-Clients](openapi-clients.md)). Keine Ports |
| Tooling | `tooling:conventions\|workspace\|openapi\|ng-lib\|verify` | Tooling-Libs in `packages/tooling/*` (siehe [Tooling & Generatoren](tooling.md)) |

## depConstraints (`eslint.config.mjs`)

Nx wendet **alle** Constraints an, die auf die Tags der Quelle passen, und verknüpft sie mit UND. Innerhalb einer Constraint reicht **ein** passendes Ziel-Tag (ODER). Das ist dieselbe Semantik wie bei den Sheriff-depRules. Marker-Tags brauchen deshalb keine transparente `anyTag`-Regel: für ein Tag ohne Constraint gilt einfach nichts.

```js
// Layer-Matrix (reduziert: kein api-Port, kein events-Layer)
type:types       -> types                             + bannedExternalImports ['*']   (Scope-Regeln gelten: shared → shared, Domain → eigene + shared)
type:utils       -> types, utils
type:data-access -> types, utils, data-access         (HTTP-Wrapper; generierte api/core sind type:data-access)
type:state       -> types, utils, data-access, state  (Signal Stores, *.events.ts)
type:ui          -> types, utils, ui                   (NICHT state/data-access: Werte per output() raus)
type:feature     -> alle Produktions-Layer            (kein `type:*`-Glob mehr, er träfe type:testing)
type:app     -> entry, scope:shared        UND nur Produktions-Layer
type:testing -> types, testing, scope:shared
// sameTag-Ersatz, generiert aus den vorhandenen Tags — ohne Ports
scope:shared -> scope:shared
scope:<s>    -> scope:<s>, scope:shared                 (je Slice: nie ein fremder Slice)
feat:<f>     -> feat:<f>, feat:none                     (je Feat: nie ein Geschwister-Feat)
// Nx-Extra: HTTP nur in data-access
utils|state|ui|feature: bannedExternalImports ['@angular/common/http']
Produktions-Layer + app:      bannedExternalImports [msw, msw/*, vitest, vitest/*, @vitest/*, @testing-library/*, playwright, playwright/*]
// Override für *.spec.ts, *.test.ts, test-setup.ts: jeder Layer darf zusätzlich type:testing
//   (utils, data-access, state, ui, feature/shell; nicht types: testing baut auf types auf → Zyklus);
//   scope:*/feat:* unverändert (kein fremdes testing). Produktionscode darf testing nie importieren
```

**Wie wird `sameTag` ausgedrückt?** Gar nicht direkt: Nx kann aus einem Ziel-Tag nicht auf das Quell-Tag zurückverweisen. Deshalb gibt es eine Constraint pro Scope und eine pro Feat. `sameTagConstraints()` in `eslint.config.mjs` liest dazu die Tags aller Projekte aus dem Projekt-Graph (= die Tags der `project.json`) und erzeugt die Constraints aus den vorhandenen `scope:*`- und `feat:*`-Tags. Ein neuer Slice ist abgedeckt, sobald die `project.json` seiner ersten Lib den Tag trägt. Eine Liste muss niemand pflegen.

Zusätzlich verbietet `no-restricted-imports` Deep-Imports: generiert aus den exakten Lib-Einträgen der `tsconfig.base.json`-Paths (Ziel unter `./libs/`), Muster `<alias>/**`.

## Mapping Sheriff-Regel → Nx

| Sheriff (architecture.md) | Nx-Konstrukt |
|---|---|
| Layer-Matrix `type:*` | `onlyDependOnLibsWithTags` je `type:*` |
| `type:feature` → alle `type:` | explizite Liste der Produktions-Layer (Glob `type:*` träfe `type:testing`) |
| `domain:*`: eigene Domain, fremde nur `port`, `shared` (`sameTag`) | generierte Constraint je `scope:<s>`: eigener Scope + `scope:shared`, **kein Port** (reduziert) |
| Shared-Features (`sharedFeatures`-Liste) | `layout` ist ein normaler Slice (`scope:layout`), nur von der App komponiert. Auth liegt ohne Ports in `shared/state` |
| `shared` → nur shared | `scope:shared` → `scope:shared` |
| `feat:*`: eigenes Feat, alles außerhalb `feat-*`, Geschwister nur `feat-port` (`sameTag` + Pfad-Guard `inAnyFeat`) | generierte Constraint je `feat:<f>`: eigenes Feat + `feat:none`, **kein feat-port** (reduziert). „Außerhalb `feat-*`“ wird zum positiven Marker `feat:none` |
| `app:*`/`root`: nur entry, port, shared | `type:app` → `entry, scope:shared` (main.ts und app/ sind ein Projekt) |
| App-Isolation `sameApp` (pfadbasiert) | Nx-Builtin: Apps sind nicht importierbar (`noImportsOfApps`, relative/absolute Imports über Projektgrenzen verboten) |
| `noTag: noDependencies` | Nx-Builtin `projectWithoutTagsCannotHaveDependencies` |
| Barrel-less + Encapsulation `internal/` | `index.ts` = Public API. TS-Paths lösen nur `index.ts` auf, dazu `noRelativeOrAbsoluteImportsAcrossLibraries` und `no-restricted-imports` gegen Deep-Imports |
| Intra-Modul-Imports ungeprüft (lokaler Store im ui-Bucket) | intra-Lib-Imports ungeprüft, identisch |
| `entryPoints` / `sheriff verify` | entfällt: `nx lint` prüft jede Datei jeder Lib, nicht nur die erreichbaren |
| `checkDynamicDependenciesExceptions` | entfällt: die App importiert Shells nur lazy. Der statische Import einer lazy geladenen Lib wird korrekt geblockt |

## Was Nx besser kann

- **Cache/affected pro Layer:** Eine Änderung in `booking/ui` betrifft nur `ui`, `feature`, `shell` und die App, nicht `data-access`/`state`.
- **Zyklen** zwischen Libs werden erkannt (`noCircularDependencies`). Im Sheriff-Setup wurden sie nicht geprüft.
- **`bannedExternalImports`:** npm-Regeln pro Tag, z.B. `types` framework-frei, HTTP nur in `data-access`. Sheriff Upstream kann das nicht, dafür bräuchte man den Fork (`externalRules`).
- **Lazy-Load-Schutz:** Ein statischer Import einer lazy geladenen Lib würde das Lazy Loading still aushebeln. Nx meldet ihn im Lint.
- **Kein Config-Build:** Sheriff musste das Blueprint-Package gebaut in `node_modules` haben. Nx liest schlichtes `eslint.config.mjs`.
- **Public API durch TypeScript:** Ein Deep-Import ist nicht nur ein Lint-Fehler, er lässt sich gar nicht erst auflösen.
- Graph-Visualisierung (`nx graph`) und Nx Console.

## Limitierungen und Lösungen

| Limitierung | Lösung |
|---|---|
| Kein `sameTag`, keine Rückreferenz Quelle→Ziel | Constraints je Scope/Feat aus den Graph-Tags generiert (Workaround) |
| Keine Negation („kein `feat-*`“); `notDependOnLibsWithTags` ist **transitiv** (prüft alle erreichbaren Libs) und taugt deshalb nicht für „nur direkt verboten“ | Positiver Marker `feat:none` auf allen Nicht-Feat-Libs (Konvention, im Verify-Skript geprüft) |
| Tag-Tippfehler (`scope:bookng`) würde still einen neuen Scope erzeugen; Nx prüft Tags nicht gegen Ordner | `packages/tooling/verify/scripts/verify-boundaries.mjs` leitet die Tags unabhängig aus dem Pfad ab und vergleicht sie mit der `project.json` jeder Lib (Scope, Type, Feat, `entry`, `generated`), prüft den Scope gegen `lib-scopes.json` (Ordner-Tippfehler `libs/bokking/…`), dass jede `src/index.ts` ein Projekt ist und die Liste keine Einträge ohne Lib hat. Die Generatoren schreiben die Tags aus dem Pfad (`deriveTags`), von Hand muss niemand Tags tippen |
| Die Regel erkennt Deep-Imports über einen Alias nicht (`@mo-transfer/checkin/state/src/…` passiert die Tag-Prüfung) | `no-restricted-imports` generiert aus den `paths` (`@mo-transfer/<lib>/**`); TS löst den Import ohnehin nicht auf |
| Zyklen werden **vor** Tags geprüft: ein Aufwärts-Import im Slice (utils→state) meldet sich oft als „Circular dependency“ statt als Layer-Verstoß | geblockt ist er trotzdem, nur mit anderer Meldung. Das Verify-Skript testet beide Varianten |
| Ohne gecachten Projekt-Graph **überspringt** die Nx-Regel still (nur eine Warnung), z.B. bei `eslint` direkt oder in der IDE nach frischem Clone/`nx reset` | `nx lint` baut den Graph selbst. Für alle anderen Aufrufer baut `eslint.config.mjs` ihn per `ensureProjectGraph()` (top-level `await`), falls er fehlt. Geprüft: echter Verstoß in `booking-ui`, leeres `workspace-data`, `eslint <datei>` → Fehler statt Skip |
| App-interne Slices (Phase 1 des Sheriff-Blueprints) sind nicht prüfbar: eine App ist ein Projekt | alles, was Regeln braucht, lebt in Libs, die App ist dünne Shell (Konvention) |
| Domain-shared → Feat-Lib (z.B. `booking/state` → `feat-check-booking/state`) ist erlaubt, wie bei Sheriff | bewusst 1:1 übernommen. Härtung wäre möglich per `allSourceTags: ['feat:none', 'type:state']` → `feat:none` |
| Die Generatoren des `sheriff-blueprint`-Packages erzeugen das Sheriff-Layout (Ordner statt Libs). `@nx/angular:library` erzeugt `project.json`, `tsconfig*.json`, `ng-package.json` usw., aber nicht nach der Blueprint-Konvention (Tags, Pfad, `paths`, Scope-Liste, vitest-Setup) | eigene Generatoren in `packages/tooling` (domain, layer, feat, testing, move, rename, remove, store; component/service als Vorbelegung für die Nx-/Angular-Generatoren), siehe [Tooling & Generatoren](tooling.md) |
