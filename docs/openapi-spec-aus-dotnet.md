# OpenAPI-Spec aus .NET-Backend erzeugen

Wie kommt die Spec eines ASP.NET-Core-Backends (Swashbuckle, .NET 8+) in den Frontend-Client, wenn BE und FE im selben Nx-Monorepo liegen? Ausgangspunkt: Analyse von stb-digital (`FibuDigital` + `frontend-monorepo`). Daraus ein wiederverwendbarer Ansatz, in dem alle Fehler des Originals behoben sind, plus Nx-Verdrahtung und CI. Für die FE-Seite hier im Repo siehe [OpenAPI-Clients](openapi-clients.md).

Getestet mit .NET SDK 8.0.409 und 9.0.203, Swashbuckle.AspNetCore 6.6.2, dotnet-script 2.0.1 (Minimal-API-Projekt aus `dotnet new webapi`): beide Wege liefern byte-gleiche Specs.

## Ist-Zustand stb-digital

Zwei Repos, **keine** Nx-Abhängigkeit zum BE. Die Kette ist halb manuell:

```
FibuDigital/src/Berater/Berater (ASP.NET Core + ServiceStack + Swashbuckle)
  Program.cs              new PersistSwaggerFile(app)            nach app.Build(), vor app.Run()
  helper/PersistSwaggerFile.cs                                   ApplicationStarted → startet `dotnet script createOpenApi.csx`
  createOpenApi.csx       GET https://localhost:5004/swagger/v1/swagger.json → ./swagger.json
                          (läuft API nicht: `dotnet run --no-build`, 10× 1 s pollen, danach Kill)
  swagger.json            committet
        │  manuell: Inhalt kopieren
        ▼
frontend-monorepo/libs/shared/generated/apis/berater-api
  berater-api.json        committete Spec
  project.json            generate-api: @lambda-solutions/nx-plugin-openapi:generate-api (openapi-generator, typescript-angular)
                          build: dependsOn ["^generate-api", "generate-api"]
        │  nx run berater-api:generate-api
        ▼
  src/lib/**              generierter Angular-Client (committet)
```

Ablauf laut README: BE lokal starten (Debug) → im Log „Swagger JSON gespeichert.“ → `swagger.json` nach `berater-api.json` kopieren → `nx run berater-api:generate-api`.

Der Laufzeit-Abruf ist dort ServiceStack geschuldet (Endpunkte erst in `app.UseServiceStack(...)`). Mit reinem Swashbuckle braucht es keinen laufenden Server.

## Fehler im Original und Behebung

| # | Fehler im Original | Folge | Behebung hier |
|---|---|---|---|
| 1 | Spec nur über laufenden Server | Port, Zertifikat, Prozess-Handling, langsam | **Weg A**: Spec per Swashbuckle-CLI aus der gebauten DLL, kein Server |
| 2 | `apiProcess.Kill()` ohne Prozessbaum | `dotnet run` startet die App als Kindprozess → App läuft verwaist weiter, Port bleibt belegt | Weg B: `Kill(entireProcessTree: true)` + `WaitForExit()` im `finally` |
| 3 | `dotnet run --no-build` | scheitert ohne vorherigen Build, oder liefert Spec eines **alten** Builds | Weg A baut explizit; Weg B ohne `--no-build` (inkrementeller Build) |
| 4 | Fester Timeout 10 s | erster Start (Restore, JIT, Init) dauert länger → keine Spec | Weg B: Default 180 s, per `OPENAPI_TIMEOUT` einstellbar |
| 5 | Fehler → nur Konsolenmeldung, Exit 0 | Pipeline läuft mit alter Spec grün weiter | Weg A: CLI-Exit-Code; Weg B: Exit 1 bei Timeout, App-Absturz, belegtem Port, fehlenden Argumenten |
| 6 | HTTPS `localhost:5004` aus `launchSettings.json` | braucht vertrautes Dev-Cert; kollidiert mit laufender Debug-Instanz | Weg B: `--no-launch-profile` + `ASPNETCORE_URLS=http://127.0.0.1:<port>` (Default 5199) |
| 7 | Läuft schon eine Instanz, wird deren Spec übernommen | Debug-Instanz mit altem Stand → veraltete Spec | Weg B: belegter Port → Abbruch statt Fremd-Spec |
| 8 | Ausgabe des Kindprozesses umgeleitet, aber nie gelesen | Kindprozess blockiert bei vollem Puffer | Weg B: Ausgabe asynchron gelesen und mit `[api]` durchgereicht |
| 9 | Script-Start im Produktivcode (`PersistSwaggerFile`, bei jedem App-Start) | Nebenwirkung in Prod; vom Script gestartete App triggert das Script erneut | Spec erzeugt nur das Nx-Target; `PersistSwaggerFile` **nicht** übernehmen |
| 10 | Pfade hart verdrahtet (URL, `swagger.json` im CWD) | nicht wiederverwendbar | Weg A/B parametrisiert: Projekt, Zieldatei, Port, Doc-Pfad |
| 11 | Spec nicht normalisiert, immer geschrieben | Diff-Rauschen, neue mtime | Weg A: Swashbuckle-Ausgabe deterministisch; Weg B: normalisiert, schreibt nur bei Änderung |
| 12 | Spec von Hand ins FE kopiert | Spec im FE driftet vom BE weg | Target schreibt direkt an den Spec-Pfad des Clients; CI prüft Drift |
| 13 | `nx.json` → `targetDefaults["…:generate-api"].inputs` = `{projectRoot}/swagger.json`, `{projectRoot}/openapitools.json`, die echte Spec heißt `berater-api.json` | **Spec-Änderung ändert den Cache-Hash nicht**, Nx spielt alten Client aus dem Cache ein | Generate-Target hat die exakte Spec-Datei als `input` |
| 14 | `dotnet-script` nicht im Tool-Manifest | „läuft nur bei mir“ | Tools versioniert in `.config/dotnet-tools.json`, `dotnet tool restore` im Target |

## Zwei Wege

| | A: Swashbuckle-CLI (empfohlen) | B: Laufzeit-Script (Fallback) |
|---|---|---|
| Ablauf | `dotnet build` → `dotnet swagger tofile` lädt die DLL, baut den Host mit No-op-Server, liest die Spec aus `ISwaggerProvider` | `dotnet run` auf eigenem Port → GET Spec → Prozessbaum beenden |
| Port, Zertifikat, Kill | entfällt | im Script gelöst |
| Startcode der App | läuft **komplett**, inkl. `ApplicationStarted` und Hosted Services | läuft komplett |
| Wann B | – | Spec hängt von Middleware/`PreSerializeFilters` (Request-abhängig) ab, oder CLI lässt sich nicht laden (Versionskonflikt, exotisches Hosting) |

Beide Wege führen den Startcode der App aus. Was dabei nicht passieren darf (DB-Migrationen, Seeding, Jobs, externe Calls, Secrets aus Key Vault), hinter `OPENAPI_EXPORT` legen (beide Wege setzen die Variable):

```csharp
var isOpenApiExport = Environment.GetEnvironmentVariable("OPENAPI_EXPORT") == "1";
if (!isOpenApiExport)
{
    builder.Services.AddHostedService<NightlyJob>();
}
```

### Vorbereitung im Backend

```csharp
// Program.cs
// ApplicationName fest: unter der CLI ist sie sonst der Assembly-Fullname
// ("Api, Version=1.0.0.0, Culture=neutral, …") → landet in info.title und als Tag aller Minimal-API-Endpunkte
// → falsche Service-Namen im generierten FE-Client
var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, ApplicationName = "Api" });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();   // nicht nur in Development registrieren, oder Export mit ASPNETCORE_ENVIRONMENT=Development
```

Alternativ: `c.SwaggerDoc("v1", new OpenApiInfo { Title = "Api", Version = "v1" })` und Tags je Endpunkt per `.WithTags(...)`. Controller-Endpunkte sind nicht betroffen (Tag = Controller-Name).

Tools versioniert (Repo-Root):

```bash
dotnet new tool-manifest                                          # einmalig → .config/dotnet-tools.json
dotnet tool install Swashbuckle.AspNetCore.Cli --version <wie Swashbuckle.AspNetCore im csproj>
dotnet tool install dotnet-script                                 # nur für Weg B
```

CLI-Version = Paketversion von `Swashbuckle.AspNetCore`. Beim Update des Pakets das Tool mitziehen, sonst Ladefehler.

### Weg A: Swashbuckle-CLI

```bash
dotnet tool restore
dotnet build apps/api/Api.csproj -c Release -o tmp/openapi-build/api     # -o: Pfad ohne TFM, unabhängig von net8.0/net9.0
ASPNETCORE_ENVIRONMENT=Development OPENAPI_EXPORT=1 \
  dotnet swagger tofile --output libs/generated/api-client/openapi.json tmp/openapi-build/api/Api.dll v1
```

`v1` = Name des Swagger-Docs (`SwaggerDoc("v1", …)`, Default `v1`). `tmp/` muss gitignored sein. `--yaml` für YAML-Ausgabe.

### Weg B: Laufzeit-Script

`tools/openapi-spec.csx`:

```csharp
// Aufruf: dotnet script tools/openapi-spec.csx -- <Api.csproj> <ziel/openapi.json> [port] [docPath]
// Startet die API auf eigenem Port, lädt die Spec, beendet den Prozessbaum. Exit 1 bei Fehler.
#nullable enable
using System.Diagnostics;
using System.Net.Http;
using System.Net.Sockets;
using System.Text.Encodings.Web;
using System.Text.Json;

var project = Args.ElementAtOrDefault(0) ?? Fail<string>("Argument <Api.csproj> fehlt");
var outFile = Path.GetFullPath(Args.ElementAtOrDefault(1) ?? Fail<string>("Argument <ziel.json> fehlt"));
var port = Args.ElementAtOrDefault(2) ?? "5199";
var docPath = Args.ElementAtOrDefault(3) ?? "/swagger/v1/swagger.json";
var baseUrl = $"http://127.0.0.1:{port}";
var timeout = TimeSpan.FromSeconds(int.Parse(Environment.GetEnvironmentVariable("OPENAPI_TIMEOUT") ?? "180"));

// Belegter Port = fremder Prozess oder ältere Instanz → abbrechen, sonst würde deren (veraltete) Spec gelesen
if (IsPortInUse()) Fail<string>($"Port {port} ist belegt – anderen Port übergeben");

// Ohne --no-build: dotnet run baut selbst (inkrementell). --no-launch-profile: launchSettings (HTTPS-Port, Browser) ignorieren
var startInfo = new ProcessStartInfo("dotnet", $"run --project \"{project}\" --no-launch-profile")
{
    UseShellExecute = false,
    RedirectStandardOutput = true,
    RedirectStandardError = true,
};
startInfo.Environment["ASPNETCORE_URLS"] = baseUrl;               // HTTP auf eigenem Port: kein Dev-Cert, keine Kollision mit Debug-Instanz
startInfo.Environment["ASPNETCORE_ENVIRONMENT"] = "Development";  // Swagger ist meist nur in Development gemappt
startInfo.Environment["OPENAPI_EXPORT"] = "1";                    // App kann damit Nebenwirkungen (Jobs, Migrationen, Mails) abschalten

var api = Process.Start(startInfo) ?? Fail<Process>("dotnet run nicht startbar");
// Ausgabe abnehmen, sonst blockiert der Kindprozess bei vollem Puffer
api.OutputDataReceived += (_, e) => { if (e.Data is not null) Console.WriteLine($"[api] {e.Data}"); };
api.ErrorDataReceived += (_, e) => { if (e.Data is not null) Console.Error.WriteLine($"[api] {e.Data}"); };
api.BeginOutputReadLine();
api.BeginErrorReadLine();

string? json = null;
var exitedEarly = false;
var clock = Stopwatch.StartNew();
try
{
    while (json is null && clock.Elapsed < timeout && !api.HasExited)
    {
        json = await TryFetchSpec();
        if (json is null) await Task.Delay(1000);
    }
}
finally
{
    exitedEarly = api.HasExited;
    // dotnet run startet die App als Kindprozess → ganzen Baum beenden, sonst bleibt sie mit belegtem Port zurück
    if (!exitedEarly) api.Kill(entireProcessTree: true);
    api.WaitForExit();
}

if (json is null)
{
    Fail<string>(exitedEarly
        ? $"API beendet vor Spec-Abruf (Exit {api.ExitCode})"
        : $"Keine Spec unter {baseUrl}{docPath} nach {timeout.TotalSeconds} s (OPENAPI_TIMEOUT erhöhen?)");
}

// Normalisieren: stabile Einrückung, Umlaute nicht escapen, LF am Ende → kleine, deterministische Diffs
var normalized = JsonSerializer.Serialize(
    JsonDocument.Parse(json!).RootElement,
    new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }) + "\n";

Directory.CreateDirectory(Path.GetDirectoryName(outFile)!);
if (File.Exists(outFile) && File.ReadAllText(outFile) == normalized)
{
    Console.WriteLine($"{outFile}: unverändert");
}
else
{
    File.WriteAllText(outFile, normalized);
    Console.WriteLine($"{outFile}: geschrieben");
}

async Task<string?> TryFetchSpec()
{
    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
    try
    {
        var response = await http.GetAsync(baseUrl + docPath);
        return response.IsSuccessStatusCode ? await response.Content.ReadAsStringAsync() : null;
    }
    catch (HttpRequestException) { return null; }   // noch nicht oben
    catch (TaskCanceledException) { return null; }
}

bool IsPortInUse()
{
    try
    {
        using var tcp = new TcpClient();
        tcp.Connect("127.0.0.1", int.Parse(port));
        return true;
    }
    catch (SocketException) { return false; }
}

T Fail<T>(string message)
{
    Console.Error.WriteLine(message);
    Environment.Exit(1);
    return default!;
}
```

Aufruf: `dotnet script tools/openapi-spec.csx -- apps/api/Api.csproj libs/generated/api-client/openapi.json [port] [docPath]`. Getestet: Erfolg, zweiter Lauf „unverändert“, falscher Doc-Pfad (Exit 1 nach Timeout), Absturz beim Start (Exit 1 sofort), belegter Port (Exit 1), danach kein Prozess mehr auf dem Port.

Hinweise:
- `Kestrel:Endpoints` in `appsettings*.json` übersteuert `ASPNETCORE_URLS`. Dann Port dort per Env überschreiben (`Kestrel__Endpoints__Http__Url`).
- `UseHttpsRedirection()` stört nicht: ohne HTTPS-Endpunkt leitet es nicht um (nur Warnung im Log).
- .NET 10: geht ohne `dotnet-script` als File-based App (`dotnet run tools/openapi-spec.cs -- …`): Datei in `.cs` umbenennen, `Args` → `args`.

## Nx-Verdrahtung

```
apps/api/                       .NET-Backend, Nx-Projekt "api" (project.json)
  Api.csproj
libs/generated/api-client/      FE-Client
  openapi.json                  committet, geschrieben von api:openapi-spec
tools/openapi-spec.csx          nur Weg B
.config/dotnet-tools.json
```

Backend-Projekt, Weg A:

```jsonc
// apps/api/project.json
{
  "name": "api",
  "targets": {
    "openapi-spec": {
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "dotnet tool restore",
          "dotnet build apps/api/Api.csproj -c Release -o tmp/openapi-build/api",
          "dotnet swagger tofile --output libs/generated/api-client/openapi.json tmp/openapi-build/api/Api.dll v1"
        ],
        "parallel": false,
        "env": { "ASPNETCORE_ENVIRONMENT": "Development", "OPENAPI_EXPORT": "1" }
      },
      "cache": true,
      "inputs": [
        "{projectRoot}/**/*.cs",
        "{projectRoot}/**/*.csproj",
        "{projectRoot}/appsettings*.json",
        "{workspaceRoot}/Directory.Build.props",
        "{workspaceRoot}/Directory.Packages.props",
        "{workspaceRoot}/.config/dotnet-tools.json"
      ],
      "outputs": ["{workspaceRoot}/libs/generated/api-client/openapi.json"]
    }
  }
}
```

Weg B: `commands` = `["dotnet tool restore", "dotnet script tools/openapi-spec.csx -- apps/api/Api.csproj libs/generated/api-client/openapi.json"]`, `env` entfällt (setzt das Script), `{workspaceRoot}/tools/openapi-spec.csx` zusätzlich in `inputs`.

`inputs` müssen **alle** C#-Projekte mit DTOs/Endpunkten abdecken. Referenzierte Projekte außerhalb von `{projectRoot}` (Contracts, Domain …) per Glob aufnehmen (`{workspaceRoot}/backend/src/**/*.cs`), sonst bleibt der Cache bei DTO-Änderungen dort stehen. Alternative: jedes `.csproj` als Nx-Projekt (Plugin `@nx/dotnet` bzw. `@nx-dotnet/core`, liest `ProjectReference` als Kanten) und `"^default"` in `inputs`.

FE-Client:

```jsonc
// libs/generated/api-client/project.json (bzw. targetDefaults des Generate-Targets)
{
  "implicitDependencies": ["api"],          // nx affected: BE-Änderung → Client → Konsumenten
  "targets": {
    "generate-api-client": {
      "dependsOn": [{ "projects": ["api"], "target": "openapi-spec" }],   // nur CI-Fall 1
      "inputs": ["{projectRoot}/openapi.json"]                           // exakter Dateiname (Fehler 13)
    }
  }
}
```

Hier im Repo: der Client-Eintrag in `openapi-clients.json` braucht keine `url`; `api:openapi-spec` ersetzt `update-spec` und schreibt die committete Spec unter `libs/[<domain>/]generated/<client>/`. `generate-api-client` hat die Spec bereits als Cache-Input; `dependsOn` per `targetDefaults` in `nx.json` ergänzen (die Client-Targets kommen vom Plugin).

## CI

Die Spec ist in beiden Fällen **committet**: API-Änderungen sind im Review als Diff sichtbar, und der Drift-Check hat eine Referenz.

### Fall 1: CI hat .NET SDK

Generierung hängt per `dependsOn` am BE-Target. Jeder Build erzeugt die Spec aus dem aktuellen C#-Code (bei unverändertem C# aus dem Nx-Cache). Drift-Check stellt sicher, dass die committete Spec dazu passt.

```yaml
# .github/workflows/ci.yml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-dotnet@v4
        with: { global-json-file: global.json }      # oder dotnet-version: 8.0.x
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - uses: nrwl/nx-set-shas@v4
      - run: pnpm nx affected -t lint test build      # zieht api:openapi-spec über dependsOn
      - name: Spec aktuell?
        run: git diff --exit-code -- 'libs/**/openapi.json' || { echo "openapi.json veraltet: nx run api:openapi-spec ausführen und committen"; exit 1; }
```

- Lokal identisch: `nx build <app>` regeneriert Spec und Client bei C#-Änderung automatisch.
- Mit Nx-Remote-Cache (Nx Cloud o. ä.) wird ein Cache-Treffer von `api:openapi-spec` ohne Build eingespielt.
- Startcode mit externen Abhängigkeiten muss hinter `OPENAPI_EXPORT` liegen, sonst scheitert der Export im CI.

### Fall 2: CI ohne .NET SDK (FE-Pipeline)

Kein `dependsOn` auf `api:openapi-spec` (würde ohne SDK fehlschlagen). FE baut nur aus der committeten Spec. Aktualität sichern zwei Stellen:

1. **Lokal**: nach BE-Änderung `nx run api:openapi-spec`, Spec mitcommitten. Optional automatisch per Git-Hook, wenn C#-Dateien gestaged sind:

   ```yaml
   # lefthook.yml
   pre-commit:
     commands:
       openapi-spec:
         glob: "apps/api/**/*.{cs,csproj}"
         run: pnpm nx run api:openapi-spec && git add libs/generated/api-client/openapi.json
   ```

2. **BE-Pipeline** (hat das SDK) führt den Drift-Check aus. Läuft bei Änderungen am BE:

   ```yaml
   # .github/workflows/api.yml
   on:
     pull_request:
       paths: ['apps/api/**', 'Directory.*.props', '.config/dotnet-tools.json', 'libs/generated/api-client/openapi.json']
   jobs:
     openapi-drift:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-dotnet@v4
           with: { global-json-file: global.json }
         - uses: pnpm/action-setup@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: pnpm }
         - run: pnpm install --frozen-lockfile
         - run: pnpm nx run api:openapi-spec --skip-nx-cache
         - run: git diff --exit-code -- libs/generated/api-client/openapi.json || { echo "openapi.json veraltet"; exit 1; }
   ```

   Drift-Check als Required Check im Branch-Schutz, sonst ist er nur Hinweis. Ohne Nx in der BE-Pipeline gehen die Befehle aus „Weg A“ direkt.

| | Fall 1: SDK im CI | Fall 2: kein SDK im FE-CI |
|---|---|---|
| `dependsOn` FE → `api:openapi-spec` | ja | nein |
| Spec veraltet möglich | nein (Drift-Check rot) | nur wenn BE-Drift-Check kein Required Check ist |
| FE-Build-Zeit | + Build/Export bei Cache-Miss | unverändert |
| Lokale Voraussetzung FE-Entwickler | .NET SDK | keine |

## Checkliste zum Übernehmen

- [ ] `ApplicationName` fest setzen (oder `SwaggerDoc` + `.WithTags`), `AddSwaggerGen()` im Export-Environment registriert
- [ ] Startcode mit Nebenwirkungen hinter `OPENAPI_EXPORT`
- [ ] Tool-Manifest mit `Swashbuckle.AspNetCore.Cli` in Paketversion (+ `dotnet-script` für Weg B)
- [ ] `tmp/` gitignored
- [ ] Nx-Target `api:openapi-spec`: `inputs` umfassen alle C#-Projekte mit DTOs, `outputs` = Spec-Pfad des Clients
- [ ] Generate-Target des Clients: Spec-Datei als `input` (exakter Dateiname), `implicitDependencies` auf `api`
- [ ] CI: Fall 1 (`dependsOn` + Drift-Check) oder Fall 2 (BE-Drift-Check als Required Check, optional Git-Hook)
- [ ] `PersistSwaggerFile`-Muster (Script-Start aus der App) nicht übernehmen
