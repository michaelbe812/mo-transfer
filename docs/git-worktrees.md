# Git-Worktrees und Nx-State

Nx 23 teilt den State zwischen Worktrees: in einem verlinkten Worktree (`.claude/worktrees/*`, `../mo-transfer-*`) zeigen **Cache** (`.nx/cache`) und **DB** (`.nx/workspace-data/<machine-id>.db`: `cache_outputs` = Index des Caches, `task_history` = Basis der Flaky-Erkennung) auf den Haupt-Checkout (`nx/src/utils/cache-directory.js`, `db-connection.js` → `getMainWorktreeRoot`). Env-Overrides werden relativ zum Haupt-Checkout aufgelöst.

**Fehlerbild „flaky build“** (Oktober 2026, `checkin-/shared-/booking-data-access:build`): Agents setzten im Worktree nur `NX_CACHE_DIRECTORY=<worktree>/.nx/cache`. Outputs landeten im Worktree-Cache, der Index-Eintrag in der DB des Haupt-Checkouts. Jeder andere Checkout bekommt dann einen Treffer ohne Verzeichnis: Nx meldet `[local cache]`, stellt **nichts** wieder her (kein `dist/libs/generated/**`, kein `src/generated`), abhängige Builds scheitern nach ~1 s mit `TS2307: Cannot find module '@mo-transfer/…/api'`, Tests an fehlenden Testing-Handlern. Der nächste echte Lauf (gleicher Hash) ist grün → Nx: „detected 3 flaky tasks“ (die Fehlschläge stehen in der geteilten `task_history`, auch die aus Worktrees). Beleg: 71 Einträge in der Haupt-DB ohne Verzeichnis im Haupt-Cache, alle 71 in den Caches zweier Worktrees.

Reproduktion (deterministisch, nur lokaler State): Cache warm (`NX_CACHE_DIRECTORY=A NX_WORKSPACE_DATA_DIRECTORY=W`), `rm -rf dist/libs`, eine Data-Access-Quelle ändern (Cache-Miss nur dort), dann `NX_CACHE_DIRECTORY=<leer> NX_WORKSPACE_DATA_DIRECTORY=W nx run-many -t build -p shared-data-access` → alle Abhängigkeiten `[local cache]`, `TS2307`.

**Regel:** Cache und DB gehören zusammen — in einem Repo mit Worktrees beide vom Haupt-Checkout (keine Overrides) oder beide woanders:

```sh
export NX_CACHE_DIRECTORY=$PWD/.nx/cache NX_WORKSPACE_DATA_DIRECTORY=$PWD/.nx/workspace-data NX_DAEMON=false
```

Kein automatischer Wächter: ein `preTasksExecution`-Plugin sähe mit eingeschaltetem Daemon dessen Env statt der des Aufrufs, wäre also nur mit `NX_DAEMON=false` zuverlässig — die Regel oben ist die Absicherung.

**Aufräumen** einer verseuchten Haupt-DB: wenn kein anderer Nx-Prozess läuft, im Haupt-Checkout `NX_DAEMON=false npx nx reset`. Vorsicht: `nx reset` **im Worktree** löscht auch die geteilte DB des Haupt-Checkouts (`reset.js` → `cleanupWorkspaceData`) und ohne Override den geteilten Cache — nie, während andere Checkouts bauen (SQLite-Fehler, fehlende Cache-Verzeichnisse).
