import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { afterEach, describe, expect, it } from "vitest"

const repositoryRoot = path.resolve(import.meta.dirname, "../..")
const temporaryDirectories: string[] = []

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`)
  return result.stdout.trim()
}

function createCurrentMainCheckout(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "acn-fde-production-prepare-"))
  temporaryDirectories.push(directory)
  const checkout = path.join(directory, "checkout")
  const origin = path.join(directory, "origin.git")

  git(directory, "init", "--bare", origin)
  git(directory, "init", "--initial-branch=main", checkout)
  git(checkout, "config", "user.name", "Production Prepare Test")
  git(checkout, "config", "user.email", "prepare@example.invalid")
  writeFileSync(path.join(checkout, "release.txt"), "release\n")
  git(checkout, "add", "release.txt")
  git(checkout, "commit", "-m", "release")
  git(checkout, "remote", "add", "origin", origin)
  git(checkout, "push", "-u", "origin", "main")

  return checkout
}

function addMigrationRelease(checkout: string): void {
  const postgresPath = path.join(
    checkout,
    "backend/tools/Acn.Fde.Practice.Database/Migrations/20260804-000001-test.pgsql",
  )
  const d1Path = path.join(checkout, "worker/migrations/0001_identity.sql")
  const postgres = 'CREATE SCHEMA IF NOT EXISTS "practice";\n'
  const d1 = 'CREATE TABLE "identity" ("id" TEXT PRIMARY KEY);\n'
  mkdirSync(path.dirname(postgresPath), { recursive: true })
  mkdirSync(path.dirname(d1Path), { recursive: true })
  writeFileSync(postgresPath, postgres)
  writeFileSync(d1Path, d1)
  const manifestPath = path.join(checkout, "scripts/production/migrations.json")
  mkdirSync(path.dirname(manifestPath), { recursive: true })
  writeFileSync(
    manifestPath,
    JSON.stringify({
      postgres: [
        {
          id: "Acn.Fde.Practice.Database.Migrations.20260804-000001-test.pgsql",
          path: path.relative(checkout, postgresPath),
          sha256: createHash("sha256").update(postgres).digest("hex"),
          compatibility: "expand",
        },
      ],
      d1: [
        {
          id: "0001_identity.sql",
          path: path.relative(checkout, d1Path),
          sha256: createHash("sha256").update(d1).digest("hex"),
          compatibility: "expand",
        },
      ],
    }),
  )
  git(checkout, "add", ".")
  git(checkout, "commit", "-m", "add migrations")
  git(checkout, "push", "origin", "main")
}

function writeTarget(directory: string): string {
  const targetPath = path.join(directory, "production-target.json")
  writeFileSync(
    targetPath,
    JSON.stringify({
      branch: "main",
      cloudflareAccountId: "test-account",
      workerName: "test-worker",
      d1DatabaseName: "test-auth",
      d1DatabaseId: "test-database-id",
      d1Region: "ENAM",
      containerApplicationName: "test-worker-CoreExContainer",
      wranglerConfig: "wrangler.jsonc",
      postgresProject:
        "backend/tools/Acn.Fde.Practice.Database/Acn.Fde.Practice.Database.csproj",
      migrationManifest: "scripts/production/migrations.json",
      d1Mode: "remote",
      tools: {
        node: process.versions.node,
        dotnetSdk: "10.0.302",
        wrangler: "4.118.0",
      },
    }),
  )
  return targetPath
}

function prepare(
  checkout: string,
  targetPath: string,
  input = "",
  environment: NodeJS.ProcessEnv = process.env,
): ReturnType<typeof spawnSync> {
  return spawnSync(
    "npm",
    [
      "run",
      "production:prepare",
      "--",
      "--repository",
      checkout,
      "--target",
      targetPath,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: environment,
      input,
    },
  )
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe("production:prepare preflight", () => {
  it("refuses to inspect or mutate production from a dirty checkout", () => {
    const checkout = createCurrentMainCheckout()
    const targetPath = writeTarget(path.dirname(checkout))
    writeFileSync(path.join(checkout, "uncommitted.txt"), "dirty\n")

    const result = prepare(checkout, targetPath)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("checkout must be clean")
    expect(result.stdout).not.toContain("PostgreSQL migration connection")
  })

  it("requires the target deployment branch", () => {
    const checkout = createCurrentMainCheckout()
    const targetPath = writeTarget(path.dirname(checkout))
    git(checkout, "switch", "-c", "feature")

    const result = prepare(checkout, targetPath)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("deployment branch must be main")
  })

  it("requires HEAD to exactly match the current origin branch", () => {
    const checkout = createCurrentMainCheckout()
    const targetPath = writeTarget(path.dirname(checkout))
    writeFileSync(path.join(checkout, "release.txt"), "newer release\n")
    git(checkout, "add", "release.txt")
    git(checkout, "commit", "-m", "newer release")
    git(checkout, "push", "origin", "main")
    git(checkout, "reset", "--hard", "HEAD~1")

    const result = prepare(checkout, targetPath)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("HEAD must exactly match origin/main")
  })

  it("requires the pinned Wrangler version before production inspection", () => {
    const checkout = createCurrentMainCheckout()
    const directory = path.dirname(checkout)
    const targetPath = writeTarget(directory)
    const fakeNpx = path.join(directory, "npx")
    writeFileSync(
      fakeNpx,
      "#!/usr/bin/env bash\nprintf '4.999.0\\n'\n",
      { mode: 0o755 },
    )

    const result = prepare(checkout, targetPath, "", {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("Wrangler 4.118.0 is required")
  })

  it("requires the configured container engine to be usable", () => {
    const checkout = createCurrentMainCheckout()
    const directory = path.dirname(checkout)
    const targetPath = writeTarget(directory)
    const fakeNpx = path.join(directory, "npx")
    writeFileSync(fakeNpx, "#!/usr/bin/env bash\nprintf '4.118.0\\n'\n", {
      mode: 0o755,
    })

    const result = prepare(checkout, targetPath, "", {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      WRANGLER_DOCKER_BIN: path.join(directory, "missing-container-engine"),
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("configured container engine is not usable")
  })

  it("requires the exact Cloudflare account before reading database credentials", () => {
    const checkout = createCurrentMainCheckout()
    const directory = path.dirname(checkout)
    const targetPath = writeTarget(directory)
    const fakeNpx = path.join(directory, "npx")
    const fakeEngine = path.join(directory, "container-engine")
    writeFileSync(
      fakeNpx,
      `#!/usr/bin/env bash
if [[ "$*" == *"--version"* ]]; then
  printf '4.118.0\\n'
elif [[ "$*" == *"whoami"* ]]; then
  printf 'Account ID: wrong-account\\n'
else
  exit 64
fi
`,
      { mode: 0o755 },
    )
    writeFileSync(fakeEngine, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 })

    const result = prepare(checkout, targetPath, "", {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      WRANGLER_DOCKER_BIN: fakeEngine,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("Cloudflare account must be test-account")
    expect(result.stdout).not.toContain("PostgreSQL migration connection")
  })

  it("requires the exact D1 identity and region", () => {
    const checkout = createCurrentMainCheckout()
    const directory = path.dirname(checkout)
    const targetPath = writeTarget(directory)
    const fakeNpx = path.join(directory, "npx")
    const fakeEngine = path.join(directory, "container-engine")
    writeFileSync(
      fakeNpx,
      `#!/usr/bin/env bash
case "$*" in
  *"--version"*) printf '4.118.0\\n' ;;
  *"whoami"*) printf 'Account ID: test-account\\n' ;;
  *"deployments list"*) printf '[{"created_on":"2026-08-06T00:00:00Z","versions":[{"version_id":"worker-version-1","percentage":100}]}]\\n' ;;
  *"d1 info"*) printf '{"uuid":"wrong-database","name":"test-auth","running_in_region":"ENAM"}\\n' ;;
  *) exit 64 ;;
esac
`,
      { mode: 0o755 },
    )
    writeFileSync(fakeEngine, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 })

    const result = prepare(checkout, targetPath, "", {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      WRANGLER_DOCKER_BIN: fakeEngine,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      "D1 database must be test-auth (test-database-id) in ENAM",
    )
  })

  it("requires all four pre-bootstrapped Worker secret names", () => {
    const checkout = createCurrentMainCheckout()
    const directory = path.dirname(checkout)
    const targetPath = writeTarget(directory)
    const fakeNpx = path.join(directory, "npx")
    const fakeEngine = path.join(directory, "container-engine")
    writeFileSync(
      fakeNpx,
      `#!/usr/bin/env bash
case "$*" in
  *"--version"*) printf '4.118.0\\n' ;;
  *"whoami"*) printf 'Account ID: test-account\\n' ;;
  *"deployments list"*) printf '[{"created_on":"2026-08-06T00:00:00Z","versions":[{"version_id":"worker-version-1","percentage":100}]}]\\n' ;;
  *"d1 info"*) printf '{"uuid":"test-database-id","name":"test-auth","running_in_region":"ENAM"}\\n' ;;
  *"secret list"*) printf '[{"name":"GITHUB_CLIENT_ID"},{"name":"GITHUB_CLIENT_SECRET"},{"name":"BETTER_AUTH_SECRET"}]\\n' ;;
  *) exit 64 ;;
esac
`,
      { mode: 0o755 },
    )
    writeFileSync(fakeEngine, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 })

    const result = prepare(checkout, targetPath, "", {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      WRANGLER_DOCKER_BIN: fakeEngine,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      "missing Worker secrets: POSTGRES_CONNECTION_STRING",
    )
  })

  it("captures the active Worker and Container image and dry-runs the incoming image", () => {
    const checkout = createCurrentMainCheckout()
    const directory = path.dirname(checkout)
    const targetPath = writeTarget(directory)
    const commandLog = path.join(directory, "commands.log")
    const fakeNpx = path.join(directory, "npx")
    const fakeEngine = path.join(directory, "container-engine")
    writeFileSync(
      fakeNpx,
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$COMMAND_LOG"
case "$*" in
  *"--version"*) printf '4.118.0\\n' ;;
  *"whoami"*) printf 'Account ID: test-account\\n' ;;
  *"deployments list"*) printf '[{"created_on":"2026-08-06T00:00:00Z","versions":[{"version_id":"worker-version-1","percentage":100}]}]\\n' ;;
  *"d1 info"*) printf '{"uuid":"test-database-id","name":"test-auth","running_in_region":"ENAM"}\\n' ;;
  *"secret list"*) printf '[{"name":"GITHUB_CLIENT_ID"},{"name":"GITHUB_CLIENT_SECRET"},{"name":"BETTER_AUTH_SECRET"},{"name":"POSTGRES_CONNECTION_STRING"}]\\n' ;;
  *"containers list"*) printf '[{"name":"test-worker-CoreExContainer","configuration":{"image":"registry.example/coreex@sha256:old-image"}}]\\n' ;;
  *"deploy --dry-run"*) printf '%s\\n' '--dry-run: exiting now.' ;;
  *) exit 64 ;;
esac
`,
      { mode: 0o755 },
    )
    writeFileSync(fakeEngine, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 })

    const result = prepare(checkout, targetPath, "", {
      ...process.env,
      COMMAND_LOG: commandLog,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      WRANGLER_DOCKER_BIN: fakeEngine,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("PostgreSQL migration connection is required")
    expect(result.stdout).toContain("Active Worker version: worker-version-1")
    expect(result.stdout).toContain(
      "Active CoreEx image: registry.example/coreex@sha256:old-image",
    )
    expect(readFileSync(commandLog, "utf8")).toContain(
      "wrangler deploy --dry-run --containers-rollout immediate",
    )
  })

  it("rejects a pooled or weak PostgreSQL migration connection without exposing it", () => {
    const checkout = createCurrentMainCheckout()
    const directory = path.dirname(checkout)
    const targetPath = writeTarget(directory)
    const commandLog = path.join(directory, "commands.log")
    const fakeNpx = path.join(directory, "npx")
    const fakeEngine = path.join(directory, "container-engine")
    writeFileSync(
      fakeNpx,
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$COMMAND_LOG"
case "$*" in
  *"--version"*) printf '4.118.0\\n' ;;
  *"whoami"*) printf 'Account ID: test-account\\n' ;;
  *"deployments list"*) printf '[{"created_on":"2026-08-06T00:00:00Z","versions":[{"version_id":"worker-version-1","percentage":100}]}]\\n' ;;
  *"d1 info"*) printf '{"uuid":"test-database-id","name":"test-auth","running_in_region":"ENAM"}\\n' ;;
  *"secret list"*) printf '[{"name":"GITHUB_CLIENT_ID"},{"name":"GITHUB_CLIENT_SECRET"},{"name":"BETTER_AUTH_SECRET"},{"name":"POSTGRES_CONNECTION_STRING"}]\\n' ;;
  *"containers list"*) printf '[]\\n' ;;
  *"deploy --dry-run"*) printf '%s\\n' '--dry-run: exiting now.' ;;
  *) exit 64 ;;
esac
`,
      { mode: 0o755 },
    )
    writeFileSync(fakeEngine, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 })
    const unsafeConnection =
      "Host=ep-example.us-east-1.aws.neon.tech;Database=neondb;Username=owner;Password=must-never-appear;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable;SSL Mode=Disable"

    const result = prepare(checkout, targetPath, `${unsafeConnection}\n`, {
      ...process.env,
      COMMAND_LOG: commandLog,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      WRANGLER_DOCKER_BIN: fakeEngine,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      "PostgreSQL migration connection must use the direct endpoint and required Npgsql settings",
    )
    const visibleText = `${result.stdout}\n${result.stderr}\n${readFileSync(commandLog, "utf8")}`
    expect(visibleText).not.toContain(unsafeConnection)
    expect(visibleText).not.toContain("must-never-appear")
  })

  it("prepares a fresh release in PostgreSQL-first order and verifies both ledgers", () => {
    const checkout = createCurrentMainCheckout()
    addMigrationRelease(checkout)
    const directory = path.dirname(checkout)
    const targetPath = writeTarget(directory)
    const commandLog = path.join(directory, "commands.log")
    const stateDirectory = path.join(directory, "state")
    mkdirSync(stateDirectory)
    const fakeNpx = path.join(directory, "npx")
    const fakeDotnet = path.join(directory, "dotnet")
    const fakeEngine = path.join(directory, "container-engine")
    writeFileSync(
      fakeNpx,
      `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *"--version"*) printf '4.118.0\\n' ;;
  *"whoami"*) printf 'Account ID: test-account\\n' ;;
  *"deployments list"*)
    printf 'worker:lookup\\n' >> "$COMMAND_LOG"
    printf '[{"created_on":"2026-08-06T00:00:00Z","versions":[{"version_id":"worker-version-1","percentage":100}]}]\\n'
    ;;
  *"d1 info"*) printf '{"uuid":"test-database-id","name":"test-auth","running_in_region":"ENAM"}\\n' ;;
  *"secret list"*) printf '[{"name":"GITHUB_CLIENT_ID"},{"name":"GITHUB_CLIENT_SECRET"},{"name":"BETTER_AUTH_SECRET"},{"name":"POSTGRES_CONNECTION_STRING"}]\\n' ;;
  *"containers list"*) printf '[]\\n' ;;
  *"deploy --dry-run"*) printf '%s\\n' '--dry-run: exiting now.' ;;
  *"d1 migrations list"*) printf 'd1:list\\n' >> "$COMMAND_LOG" ;;
  *"d1 execute"*)
    if [ -f "$STATE_DIRECTORY/d1-applied" ]; then
      printf '[{"results":[{"name":"0001_identity.sql"}],"success":true}]\\n'
    else
      printf '[{"results":[],"success":true}]\\n'
    fi
    ;;
  *"d1 migrations apply"*)
    printf 'd1:apply\\n' >> "$COMMAND_LOG"
    touch "$STATE_DIRECTORY/d1-applied"
    ;;
  *) printf 'unexpected npx command: %s\\n' "$*" >&2; exit 64 ;;
esac
`,
      { mode: 0o755 },
    )
    writeFileSync(
      fakeDotnet,
      `#!/usr/bin/env bash
set -euo pipefail
if [ "$*" = "--version" ]; then
  printf '10.0.302\\n'
elif [[ "$*" == *"migration-ledger"* ]]; then
  if [ -f "$STATE_DIRECTORY/postgres-applied" ]; then
    printf '["Acn.Fde.Practice.Database.Migrations.20260804-000001-test.pgsql"]\\n'
  else
    printf '[]\\n'
  fi
elif [[ "$*" == *" Migrate"* ]]; then
  printf 'postgres:migrate\\n' >> "$COMMAND_LOG"
  touch "$STATE_DIRECTORY/postgres-applied"
else
  printf 'unexpected dotnet command: %s\\n' "$*" >&2
  exit 64
fi
`,
      { mode: 0o755 },
    )
    writeFileSync(fakeEngine, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 })
    const directConnection =
      "Host=ep-example.us-east-1.aws.neon.tech;Database=neondb;Username=owner;Password=must-never-appear;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable"

    const result = prepare(checkout, targetPath, `${directConnection}\n`, {
      ...process.env,
      COMMAND_LOG: commandLog,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      STATE_DIRECTORY: stateDirectory,
      WRANGLER_DOCKER_BIN: fakeEngine,
    })

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(readFileSync(commandLog, "utf8").split("\n")).toEqual([
      "worker:lookup",
      "d1:list",
      "postgres:migrate",
      "d1:apply",
      "worker:lookup",
      "",
    ])
    expect(result.stdout).toContain(
      "PostgreSQL migration head: Acn.Fde.Practice.Database.Migrations.20260804-000001-test.pgsql",
    )
    expect(result.stdout).toContain("D1 migration head: 0001_identity.sql")
    expect(result.stdout).toContain("Production databases are prepared")
    expect(`${result.stdout}\n${result.stderr}\n${readFileSync(commandLog, "utf8")}`).not.toContain(
      directConnection,
    )
    expect(result.stdout).not.toContain("must-never-appear")
    expect(result.stderr).not.toContain("must-never-appear")
  })
})
