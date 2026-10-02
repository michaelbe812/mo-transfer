# Fairness-Audit der Generator-Tests

Stand 2026-10-02. Für jede Case-ID wurden die 7 Tests gegen den `expect`-Text (streng, wörtlich) verglichen.
Ergebnisse in `results/<id>.json` sind bis zum nächsten `run-bench` veraltet; die Status unten sind durch lokale Läufe
(types / static / test-runtime je Generator) bestätigt.

## Leitregeln (Entscheidungen)

1. **fail vs. unsupported**: Operation/Feature generiert, aber falsch oder Eingaben still verworfen → **fail**.
   Gar keine API für das Feature → **unsupported**. Ausnahmen nur, wenn `expect` selbst es festlegt
   (R-COOKIE-PARAM: unsupported ehrlich; T-ERROR-MODEL: „nur HttpErrorResponse.error: any = fail“).
2. **T-ENUM-VARNAMES**: benannte Konstanten vorhanden, aber falsch benannt (`_1/_2/_3`) → fail; gar keine benannten
   Konstanten → unsupported.
3. **Pfadbasierte Clients (openapi-fetch)**: Cases, deren expect einen *generierten Methoden-/Funktionsnamen* verlangt
   (T-NAME-OPERATION-ID-SANITIZE, T-NO-OPERATION-ID, S-DEPRECATED-OP) → unsupported, nicht „pass per Interpretation“.
   T-UNTAGGED-OP („generiert und aufrufbar“) bleibt pass.
4. **Nicht-Angular-Clients**: alle A-* ohne Angular-Bezug → unsupported (auch A-ZONELESS, sonst trivial grün).
   A-OBSERVABLE-COLD bei Promise-APIs bleibt fail (expect: „bei Promise: dokumentiert fail“).
5. **Wire-Äquivalenz bei Listen-Headern**: `a,b`, mehrere Header-Werte (Angular-Backends joinen mit `,`) und `a, b`
   (fetch, RFC 9110 OWS) gelten als gleich.
6. **Generierung bricht ab (NSwag 3.1)**: fail nur bei Cases, deren expect „Generierung bricht nicht“ nennt; sonst
   unsupported (s. offene Punkte).

## Geänderte Verdicts

| Generator | Case | alt → neu | Grund |
| --- | --- | --- | --- |
| openapi-generator | T-ERROR-MODEL | unsupported → fail | expect: „Nur generisches HttpErrorResponse.error:any = fail“ (ng-openapi-gen/nswag waren schon fail) |
| orval | T-ERROR-MODEL | unsupported → fail | dito |
| ng-openapi | T-ERROR-MODEL | unsupported → fail | dito |
| ng-openapi | R-HEADER-PARAM | unsupported → fail | Operation existiert, Header-Params werden verworfen; konsistent zu T-PARAM-HEADER (fail) und zu verworfenen Bodies (R-BODY-OCTET/-TEXT/-MERGE-PATCH = fail) |
| ng-openapi-gen | R-HEADER-PARAM | fail → pass | harsch: Test las nur `headers.get()` = `'a'`; Angular-Backend sendet `getAll().join(',')` = `a,b` (orval-Test prüfte bereits so) |
| openapi-fetch | R-HEADER-PARAM | fail → pass | `a, b` ≡ `a,b` (RFC 9110 §5.6.1), OWS normalisiert |
| openapi-fetch | T-NAME-OPERATION-ID-SANITIZE | pass → unsupported | keine generierten Namen (Regel 3) |
| openapi-fetch | T-NO-OPERATION-ID | pass → unsupported | expect: „Wird generiert (Name aus Methode+Pfad)“ – es wird kein Name generiert |
| openapi-fetch | S-DEPRECATED-OP | pass → unsupported | keine generierte Methode/Funktion; `@deprecated` nur am `paths`-Typ-Member, beim Aufruf `client.GET('/naming/deprecated')` unsichtbar |
| openapi-fetch | A-ZONELESS | pass → unsupported | trivial erfüllt, keine Angular-Integration (Regel 4) |
| nswag | T-ENUM-VARNAMES | fail → unsupported | kein Wert-Export `Priority` (Regel 2; analog ng-openapi-gen) |
| nswag | T31-DEPENDENT-REQUIRED | unsupported → fail | expect: „Generierung bricht nicht“ – sie bricht ab |
| nswag | T31-WEBHOOKS | unsupported → fail | expect: „Generierung bricht nicht“ – sie bricht ab |

Summe: openapi-generator 1, orval 1, ng-openapi 2, ng-openapi-gen 1, openapi-fetch 5, nswag 3, hey-api 0.

## Test-Härtungen ohne Verdict-Änderung

- nswag, openapi-fetch R-BODY-OCTET: Test-Blob ohne eigenen MIME-Typ (sonst leitet HttpClient/fetch den Content-Type aus
  dem Blob ab → Generator-Leistung nicht messbar; ng-openapi-gen/orval scheitern genau daran). nswag bleibt pass
  (setzt Header explizit), openapi-fetch bleibt fail.
- ng-openapi-gen T31-ONEOF-CONST-DISC: exakter Typ von `startedAt` geprüft (vorher hätte `any`/optional gereicht); pass.
- nswag types-31: Titel ohne Template-Literal (vitest typecheck liest Titel statisch → Note zeigte `${reason}`).

## Geprüfte Judgement Calls ohne Änderung

- **R-AUTH-NONE hey-api (pass)**: bleibt pass. Hey API hat Auth-Konfiguration (`client.setConfig({ auth })`) und lässt
  `security` bei `authPublic` korrekt weg; dass Auth generell nie ankommt, ist in den 5 R-AUTH-* fails bereits bestraft.
  Generatoren ganz ohne Auth-Konfiguration sind korrekt unsupported.
- **T31-BINARY-CONTENT-MEDIA-TYPE mit `unknown` (hey-api, openapi-fetch) / `any` (ng-openapi-gen)**: bleibt pass –
  expect fordert nur „akzeptiert Blob“ (Ablehnung von `{}` prüft nur T-BODY-OCTET). Case-Text zu schwach, s. u.
- **T31-WEBHOOKS mit ignorierten Webhooks, aber vorhandenem Item31 (ng-openapi-gen, orval, ng-openapi)**: bleibt pass –
  expect nennt ausdrücklich „Ein Typ für den Webhook-Payload (Item31) … existiert“. Case-Text zu schwach, s. u.
- **T-RESP-204**: openapi-generator `Observable<any>` korrekt fail; alle anderen prüfen `not.toBeAny()` bzw. exakt void/undefined.
- **T-ADDPROPS-TRUE**: alle 7 Tests prüfen exakt `unknown` bzw. `Record<string, unknown>`; `any`-Varianten (openapi-generator,
  ng-openapi-gen, nswag) korrekt fail.
- **A-OBSERVABLE-COLD** hey-api/openapi-fetch (Promise): fail laut expect korrekt.
- **R-COOKIE-PARAM**: openapi-generator/nswag/openapi-fetch bieten den Parameter an und verwerfen ihn → fail; ng-openapi-gen,
  orval, hey-api, ng-openapi generieren ihn gar nicht → unsupported. Konsistent.
- **T31-ONEOF-CONST-DISC openapi-generator**: fail korrekt (verschmolzenes Interface, `type: any`; negativer Zweig belegt fehlendes Narrowing).
- **T-RESP-BINARY / R-RESP-BLOB nswag**: `FileResponse { data: Blob }` statt Blob → fail; streng nach expect („liefert Blob“) korrekt.
- **R-RESP-201-LOCATION / A-OBSERVE-RESPONSE nswag unsupported**: nur via globaler Generator-Option `wrapResponses`, nicht in der
  gewählten Konfiguration → unsupported vertretbar.

## ng-openapi (nach Freigabe mitbearbeitet)

- Geändert: T-ERROR-MODEL, R-HEADER-PARAM (s. Tabelle).
- Weitere Befunde ohne Änderung: T-ENUM-VARNAMES fail korrekt (`Priority._1/_2/_3` = falsch benannte Member);
  A-PROVIDE-FN prüft nur `inject(BASE_PATH_BENCH)`, Wirkung auf Requests deckt A-BASEURL ab (ok);
  A-INJECT ohne Request (ok, expect verlangt keinen); T-OPTIONAL nur positiv (ok laut expect).
- ng-openapi fehlt in `results/` (kein `results/ng-openapi.json`) → nach `run-bench` prüfen.

## Offene Punkte / Ambiguitäten

1. **nswag T31-* (8 übrige Cases)**: Generierung der 3.1-Spec bricht komplett ab. Als unsupported belassen; vertretbar wäre
   auch fail für alle (Generator-Bug statt fehlendes Feature). Bitte entscheiden.
2. **T31-WEBHOOKS / T31-BINARY-CONTENT-MEDIA-TYPE**: Case-Texte sind so formuliert, dass Ignorieren der Webhooks bzw.
   `any`/`unknown`-Bodies bestehen. Verschärfung nur über `spec/cases.json` (nicht Teil dieses Audits).
3. **R-AUTH-NONE**: besteht ohne positive Kontrolle (gleiche Config, `authBearer` sendet Token). Optional als Bedingung in
   cases.json aufnehmen; dann würde hey-api fail.
4. **openapi-fetch Regel 3** trifft das Paradigma (pfadbasiert) – drei Cases zählen für openapi-fetch nun 0 statt 1.
   Alternative wäre, diese Cases für pfadbasierte Clients aus der Wertung zu nehmen (Scoring-Frage).

## Entscheidungen des Bench-Maintainers zu den offenen Punkten

1. NSwag-T31 bei abgebrochener 3.1-Generierung: bleiben ➖ (3.1 nicht offiziell unterstützt).
2. T31-WEBHOOKS / T31-BINARY-CONTENT-MEDIA-TYPE: nicht verschärft, als bekannte Grenze im README dokumentiert (Gewicht 1).
3. R-AUTH-NONE braucht positive Kontrolle: `scripts/run-bench.mjs` (POSITIVE_CONTROLS) übernimmt den Status von
   R-AUTH-BEARER, wenn dieser nicht besteht (betrifft Hey API: pass → fail).
4. openapi-fetch-Naming-Cases: ➖ = 0 Punkte, bleiben in der Wertung.
