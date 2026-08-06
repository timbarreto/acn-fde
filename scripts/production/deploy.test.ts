import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { afterEach, describe, expect, it } from "vitest"

const repositoryRoot = path.resolve(import.meta.dirname, "../..")
const temporaryDirectories: string[] = []
const childProcesses: ChildProcess[] = []

function command(cwd: string, executable: string, ...args: string[]): string {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8" })
  if (result.status !== 0)
    throw new Error(`${executable} ${args.join(" ")} failed: ${result.stderr}`)
  return result.stdout.trim()
}

function createReleaseFixture(): {
  checkout: string
  target: string
  environment: NodeJS.ProcessEnv
  commandLog: string
  release: string
} {
  const directory = mkdtempSync(path.join(tmpdir(), "acn-fde-production-deploy-"))
  temporaryDirectories.push(directory)
  const checkout = path.join(directory, "checkout")
  const origin = path.join(directory, "origin.git")
  const bin = path.join(directory, "bin")
  const commandLog = path.join(directory, "commands.log")
  mkdirSync(checkout)
  mkdirSync(bin)
  command(directory, "git", "init", "--bare", origin)
  command(checkout, "git", "init", "--initial-branch=main")
  command(checkout, "git", "config", "user.name", "Production Deploy Test")
  command(checkout, "git", "config", "user.email", "deploy@example.invalid")

  const postgresPath =
    "backend/tools/Acn.Fde.Practice.Database/Migrations/20260804-000001-test.pgsql"
  const d1Path = "worker/migrations/0001_identity.sql"
  const postgres = 'CREATE SCHEMA IF NOT EXISTS "practice";\n'
  const d1 = 'CREATE TABLE "identity" ("id" TEXT PRIMARY KEY);\n'
  mkdirSync(path.join(checkout, path.dirname(postgresPath)), { recursive: true })
  mkdirSync(path.join(checkout, path.dirname(d1Path)), { recursive: true })
  mkdirSync(path.join(checkout, "scripts/production"), { recursive: true })
  mkdirSync(path.join(checkout, "dist"), { recursive: true })
  writeFileSync(path.join(checkout, postgresPath), postgres)
  writeFileSync(path.join(checkout, d1Path), d1)
  writeFileSync(path.join(checkout, "dist/index.html"), "<!doctype html><title>test</title>")
  writeFileSync(path.join(checkout, "worker.ts"), "export default { fetch: () => new Response('ok') }\n")
  writeFileSync(
    path.join(checkout, "package.json"),
    JSON.stringify({
      name: "legacy-release-fixture",
      version: "1.0.0",
      private: true,
      scripts: {
        build:
          "node -e \"require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/index.html','<!doctype html><title>legacy</title>')\"",
      },
    }),
  )
  writeFileSync(
    path.join(checkout, "package-lock.json"),
    JSON.stringify({
      name: "legacy-release-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": { name: "legacy-release-fixture", version: "1.0.0" },
      },
    }),
  )
  writeFileSync(
    path.join(checkout, "scripts/production/migrations.json"),
    JSON.stringify({
      postgres: [{
        id: "Acn.Fde.Practice.Database.Migrations.20260804-000001-test.pgsql",
        path: postgresPath,
        sha256: createHash("sha256").update(postgres).digest("hex"),
        compatibility: "expand",
      }],
      d1: [{
        id: "0001_identity.sql",
        path: d1Path,
        sha256: createHash("sha256").update(d1).digest("hex"),
        compatibility: "expand",
      }],
    }),
  )
  writeFileSync(
    path.join(checkout, "wrangler.jsonc"),
    JSON.stringify({
      name: "test-worker",
      main: "worker.ts",
      compatibility_date: "2026-08-06",
      assets: { directory: "dist", binding: "ASSETS" },
      d1_databases: [{
        binding: "AUTH_DB",
        database_name: "test-auth",
        database_id: "test-database-id",
        migrations_dir: "worker/migrations",
      }],
      containers: [{
        name: "coreex",
        class_name: "CoreExContainer",
        image: "./backend/Dockerfile",
        image_build_context: ".",
        max_instances: 1,
        instance_type: "basic",
        constraints: { regions: ["ENAM"] },
      }],
      durable_objects: {
        bindings: [{ name: "COREEX", class_name: "CoreExContainer" }],
      },
      migrations: [{ tag: "v1", new_sqlite_classes: ["CoreExContainer"] }],
    }),
  )
  writeFileSync(path.join(checkout, ".gitignore"), "dist/\n")
  command(checkout, "git", "add", ".")
  command(checkout, "git", "commit", "-m", "release")
  command(checkout, "git", "remote", "add", "origin", origin)
  command(checkout, "git", "push", "-u", "origin", "main")
  const release = command(checkout, "git", "rev-parse", "HEAD")

  const target = path.join(directory, "production-target.json")
  writeFileSync(
    target,
    JSON.stringify({
      branch: "main",
      cloudflareAccountId: "test-account",
      workerName: "test-worker",
      d1DatabaseName: "test-auth",
      d1DatabaseId: "test-database-id",
      d1Region: "ENAM",
      containerApplicationName: "coreex",
      containerImageName: "coreex",
      wranglerConfig: "wrangler.jsonc",
      postgresProject: "backend/tools/Acn.Fde.Practice.Database/Acn.Fde.Practice.Database.csproj",
      migrationManifest: "scripts/production/migrations.json",
      d1Mode: "remote",
      postgresMode: "remote",
      healthOrigin: "https://test-worker.example.invalid",
      healthGate: { attempts: 13, intervalMilliseconds: 5000 },
      rollbackPrime: {
        legacyCommit: release,
        expectedWorkerVersion: "worker-version-old",
      },
      tools: {
        node: process.versions.node,
        dotnetSdk: "10.0.302",
        wrangler: "4.118.0",
      },
    }),
  )

  writeFileSync(
    path.join(bin, "dotnet"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'dotnet %s\n' "$*" >> "$COMMAND_LOG"
if [ "$*" = "--version" ]; then
  printf '10.0.302\n'
elif [[ "$*" == *"migration-ledger"* ]]; then
  printf '["Acn.Fde.Practice.Database.Migrations.20260804-000001-test.pgsql"]\n'
else
  exit 64
fi
`,
    { mode: 0o755 },
  )
  writeFileSync(
    path.join(bin, "npx"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'npx %s\n' "$*" >> "$COMMAND_LOG"
if [[ "$*" == *"wrangler --version"* ]]; then
  printf '4.118.0\n'
elif [[ "$*" == *"wrangler whoami"* ]]; then
  printf 'Account ID: test-account\n'
elif [[ "$*" == *"deployments list"* ]]; then
  printf '[{"created_on":"2026-08-06T00:00:00Z","versions":[{"version_id":"worker-version-old","percentage":100}]}]\n'
elif [[ "$*" == *"versions view worker-version-old"* ]]; then
  printf '{"id":"worker-version-old","annotations":{},"resources":{"bindings":[]}}\n'
elif [[ "$*" == *"d1 info"* ]]; then
  printf '{"uuid":"test-database-id","name":"test-auth","running_in_region":"ENAM"}\n'
elif [[ "$*" == *"secret list"* ]]; then
  printf '[{"name":"GITHUB_CLIENT_ID"},{"name":"GITHUB_CLIENT_SECRET"},{"name":"BETTER_AUTH_SECRET"},{"name":"POSTGRES_CONNECTION_STRING"}]\n'
elif [[ "$*" == *"containers list"* ]]; then
  if [ -n "\${NO_CONTAINER_APPLICATION:-}" ]; then
    printf '[]\n'
  else
    printf '[{"id":"container-old","name":"coreex","configuration":{"image":"registry.cloudflare.com/test-account/coreex@sha256:old"}}]\n'
  fi
elif [[ "$*" == *"deploy --dry-run"* ]]; then
  printf '%s\n' '--dry-run: exiting now.'
elif [[ "$*" == *"d1 migrations list"* ]]; then
  :
elif [[ "$*" == *"d1 execute"* ]]; then
  printf '[{"results":[{"name":"0001_identity.sql"}],"success":true}]\n'
else
  printf 'unexpected npx command: %s\n' "$*" >&2
  exit 64
fi
`,
    { mode: 0o755 },
  )
  writeFileSync(
    path.join(bin, "container-engine"),
    `#!/usr/bin/env bash
printf 'engine %s\n' "$*" >> "$COMMAND_LOG"
[ "$*" = "info" ]
`,
    { mode: 0o755 },
  )

  return {
    checkout,
    target,
    commandLog,
    release,
    environment: {
      ...process.env,
      COMMAND_LOG: commandLog,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      WRANGLER_DOCKER_BIN: path.join(bin, "container-engine"),
    },
  }
}

function startHealthServer(directory: string, coreExStatus = 401): string {
  const serverPath = path.join(directory, "health-server.mjs")
  const portPath = path.join(directory, "health-port")
  writeFileSync(
    serverPath,
    `import { createServer } from "node:http"
import { writeFileSync } from "node:fs"
const server = createServer((request, response) => {
  if (request.url === "/") {
    response.writeHead(200, { "content-type": "text/html" })
    response.end("<!doctype html><title>healthy</title>")
  } else if (request.url === "/api/practice-state") {
    response.writeHead(${coreExStatus}, { "content-type": "application/problem+json" })
    response.end("{}")
  } else {
    response.writeHead(404)
    response.end()
  }
})
server.listen(0, "127.0.0.1", () => {
  writeFileSync(process.argv[2], String(server.address().port))
})
`,
  )
  const server = spawn(process.execPath, [serverPath, portPath], {
    stdio: "ignore",
  })
  childProcesses.push(server)
  for (let attempt = 0; attempt < 100 && !existsSync(portPath); attempt += 1)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  if (!existsSync(portPath)) throw new Error("health server did not start")
  return `http://127.0.0.1:${readFileSync(portPath, "utf8")}`
}

function configureFailedRollout(
  fixture: ReturnType<typeof createReleaseFixture>,
  failure: "worker" | "coreex",
  previousImage = "registry.cloudflare.com/test-account/coreex@sha256:old",
): void {
  const directory = path.dirname(fixture.target)
  const bin = path.join(directory, "bin")
  const workerState = path.join(directory, "worker-state")
  const imageState = path.join(directory, "image-state")
  const previousTag = previousImage ? "" : `prime-${fixture.release}`
  const previousBindings = previousImage
    ? "[]"
    : '[{"type":"durable_object_namespace","class_name":"CoreExContainer"}]'
  writeFileSync(workerState, "worker-version-old")
  writeFileSync(imageState, previousImage)

  writeFileSync(
    path.join(bin, "npx"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'npx %s\\n' "$*" >> "$COMMAND_LOG"
if [[ "$*" == *"wrangler --version"* ]]; then
  printf '4.118.0\\n'
elif [[ "$*" == *"wrangler whoami"* ]]; then
  printf 'Account ID: test-account\\n'
elif [[ "$*" == *"deployments list"* ]]; then
  version="$(cat "${workerState}")"
  printf '[{"created_on":"2026-08-06T00:00:00Z","versions":[{"version_id":"%s","percentage":100}]}]\\n' "$version"
elif [[ "$*" == *"versions view worker-version-old"* ]]; then
  printf '{"id":"worker-version-old","annotations":{"workers/tag":"${previousTag}"},"resources":{"bindings":${previousBindings}}}\\n'
elif [[ "$*" == *"d1 info"* ]]; then
  printf '{"uuid":"test-database-id","name":"test-auth","running_in_region":"ENAM"}\\n'
elif [[ "$*" == *"secret list"* ]]; then
  printf '[{"name":"GITHUB_CLIENT_ID"},{"name":"GITHUB_CLIENT_SECRET"},{"name":"BETTER_AUTH_SECRET"},{"name":"POSTGRES_CONNECTION_STRING"}]\\n'
elif [[ "$*" == *"containers list"* ]]; then
  image="$(cat "${imageState}")"
  if [ -n "$image" ]; then
    printf '[{"id":"container-app","name":"coreex","configuration":{"image":"%s"}}]\\n' "$image"
  else
    printf '[]\\n'
  fi
elif [[ "$*" == *"containers delete container-app"* ]]; then
  : > "${imageState}"
  printf 'Deleted container-app\\n'
elif [[ "$*" == *"deploy --dry-run"* ]]; then
  printf '%s\\n' '--dry-run: exiting now.'
elif [[ "$*" == *"d1 migrations list"* ]]; then
  :
elif [[ "$*" == *"d1 execute"* ]]; then
  printf '[{"results":[{"name":"0001_identity.sql"}],"success":true}]\\n'
elif [[ "$*" == *"containers push coreex:${fixture.release}"* ]]; then
  printf 'Pushed image\\n'
elif [[ "$*" == *"--tag ${fixture.release}-recovery"* ]]; then
  printf 'worker-version-recovery' > "${workerState}"
  printf 'registry.cloudflare.com/test-account/coreex@sha256:old' > "${imageState}"
  printf 'Current Version ID: worker-version-recovery\\n'
elif [[ "$*" == *"wrangler deploy"* ]]; then
  printf 'worker-version-new' > "${workerState}"
  if [ "${failure}" = "coreex" ]; then
    printf 'registry.cloudflare.com/test-account/coreex@sha256:newdigest' > "${imageState}"
  fi
  printf 'simulated ${failure} rollout failure\\n' >&2
  exit 71
elif [[ "$*" == *"wrangler rollback worker-version-old"* ]]; then
  printf 'worker-version-old' > "${workerState}"
  printf 'Rolled back\\n'
else
  printf 'unexpected npx command: %s\\n' "$*" >&2
  exit 64
fi
`,
    { mode: 0o755 },
  )
  writeFileSync(
    path.join(bin, "container-engine"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'engine %s\\n' "$*" >> "$COMMAND_LOG"
if [ "$*" = "info" ]; then
  exit 0
elif [[ "$*" == build* ]]; then
  exit 0
elif [[ "$*" == *"image inspect"* ]]; then
  printf '["registry.cloudflare.com/test-account/coreex@sha256:newdigest"]\\n'
else
  exit 64
fi
`,
    { mode: 0o755 },
  )
}

function configureSuccessfulRollout(
  fixture: ReturnType<typeof createReleaseFixture>,
  coreExStatus = 401,
): void {
  const directory = path.dirname(fixture.target)
  const bin = path.join(directory, "bin")
  const deployed = path.join(directory, "deployed")
  const origin = startHealthServer(directory, coreExStatus)
  const target = JSON.parse(readFileSync(fixture.target, "utf8")) as Record<string, unknown>
  target.healthOrigin = origin
  target.healthGate = {
    attempts: 2,
    intervalMilliseconds: 1,
    requestTimeoutMilliseconds: 1000,
  }
  writeFileSync(fixture.target, JSON.stringify(target))

  writeFileSync(
    path.join(bin, "npx"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'npx %s\\n' "$*" >> "$COMMAND_LOG"
if [[ "$*" == *"wrangler --version"* ]]; then
  printf '4.118.0\\n'
elif [[ "$*" == *"wrangler whoami"* ]]; then
  printf 'Account ID: test-account\\n'
elif [[ "$*" == *"deployments list"* ]]; then
  version="worker-version-old"
  [ -f "${deployed}" ] && version="worker-version-new"
  printf '[{"created_on":"2026-08-06T00:00:00Z","versions":[{"version_id":"%s","percentage":100}]}]\\n' "$version"
elif [[ "$*" == *"versions view worker-version-new"* ]]; then
  printf '{"id":"worker-version-new","annotations":{"workers/tag":"${fixture.release}"}}\\n'
elif [[ "$*" == *"d1 info"* ]]; then
  printf '{"uuid":"test-database-id","name":"test-auth","running_in_region":"ENAM"}\\n'
elif [[ "$*" == *"secret list"* ]]; then
  printf '[{"name":"GITHUB_CLIENT_ID"},{"name":"GITHUB_CLIENT_SECRET"},{"name":"BETTER_AUTH_SECRET"},{"name":"POSTGRES_CONNECTION_STRING"}]\\n'
elif [[ "$*" == *"containers list"* ]]; then
  if [ -f "${deployed}" ]; then
    printf '[{"id":"container-new","name":"coreex","configuration":{"image":"registry.cloudflare.com/test-account/coreex@sha256:newdigest"}}]\\n'
  else
    printf '[{"id":"container-old","name":"coreex","configuration":{"image":"registry.cloudflare.com/test-account/coreex@sha256:old"}}]\\n'
  fi
elif [[ "$*" == *"deploy --dry-run"* ]]; then
  printf '%s\\n' '--dry-run: exiting now.'
elif [[ "$*" == *"d1 migrations list"* ]]; then
  :
elif [[ "$*" == *"d1 execute"* ]]; then
  printf '[{"results":[{"name":"0001_identity.sql"}],"success":true}]\\n'
elif [[ "$*" == *"containers push coreex:${fixture.release}"* ]]; then
  printf 'Pushed image\\n'
elif [[ "$*" == *"wrangler deploy"* ]]; then
  [[ "$*" == *"--strict"* ]]
  [[ "$*" == *"--containers-rollout immediate"* ]]
  [[ "$*" == *"--tag ${fixture.release}"* ]]
  config=""
  previous=""
  for argument in "$@"; do
    [ "$previous" = "--config" ] && config="$argument"
    previous="$argument"
  done
  node -e '
const config = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
const container = config.containers[0]
if (container.image !== "registry.cloudflare.com/test-account/coreex@sha256:newdigest") process.exit(65)
if (container.max_instances !== 1 || container.instance_type !== "basic") process.exit(66)
if (container.image_build_context !== undefined) process.exit(67)
' "$config"
  touch "${deployed}"
  printf 'Current Version ID: worker-version-new\\n'
else
  printf 'unexpected npx command: %s\\n' "$*" >&2
  exit 64
fi
`,
    { mode: 0o755 },
  )
  writeFileSync(
    path.join(bin, "container-engine"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'engine %s\\n' "$*" >> "$COMMAND_LOG"
if [ "$*" = "info" ]; then
  exit 0
elif [[ "$*" == build* ]]; then
  exit 0
elif [[ "$*" == *"image inspect"* ]]; then
  printf '["registry.cloudflare.com/test-account/coreex@sha256:newdigest"]\\n'
else
  exit 64
fi
`,
    { mode: 0o755 },
  )
}

function configurePrimeRollout(
  fixture: ReturnType<typeof createReleaseFixture>,
  inheritedBinding = false,
): void {
  const directory = path.dirname(fixture.target)
  const bin = path.join(directory, "bin")
  const primed = path.join(directory, "primed")
  const primedTag = inheritedBinding ? "" : `prime-${fixture.release}`
  const primedBindings = inheritedBinding
    ? '[{"type":"durable_object_namespace","class_name":"CoreExContainer"}]'
    : "[]"
  if (inheritedBinding) writeFileSync(primed, "secret-created-version")
  writeFileSync(
    path.join(bin, "npx"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'npx %s\\n' "$*" >> "$COMMAND_LOG"
if [[ "$*" == *"wrangler --version"* ]]; then
  printf '4.118.0\\n'
elif [[ "$*" == *"wrangler whoami"* ]]; then
  printf 'Account ID: test-account\\n'
elif [[ "$*" == *"deployments list"* ]]; then
  version="worker-version-old"
  [ -f "${primed}" ] && version="worker-version-prime"
  printf '[{"created_on":"2026-08-06T00:00:00Z","versions":[{"version_id":"%s","percentage":100}]}]\\n' "$version"
elif [[ "$*" == *"versions view worker-version-old"* ]]; then
  printf '{"id":"worker-version-old","annotations":{}}\\n'
elif [[ "$*" == *"versions view worker-version-prime"* ]]; then
  printf '{"id":"worker-version-prime","annotations":{"workers/tag":"${primedTag}"},"resources":{"bindings":${primedBindings}}}\\n'
elif [[ "$*" == *"containers list"* ]]; then
  printf '[]\\n'
elif [[ "$*" == *"deploy --dry-run"* ]]; then
  config=""
  previous=""
  for argument in "$@"; do
    [ "$previous" = "--config" ] && config="$argument"
    previous="$argument"
  done
  node -e '
const fs = require("fs")
const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
if (config.containers !== undefined) process.exit(65)
if (config.durable_objects.bindings[0].class_name !== "CoreExContainer") process.exit(66)
if (!fs.readFileSync(config.assets.directory + "/index.html", "utf8").includes("legacy")) process.exit(67)
' "$config"
  printf '%s\\n' '--dry-run: exiting now.'
elif [[ "$*" == *"wrangler deploy"* ]]; then
  [[ "$*" == *"--tag prime-${fixture.release}"* ]]
  touch "${primed}"
  printf 'Current Version ID: worker-version-prime\\n'
else
  printf 'unexpected npx command: %s\\n' "$*" >&2
  exit 64
fi
`,
    { mode: 0o755 },
  )
  writeFileSync(
    path.join(bin, "container-engine"),
    `#!/usr/bin/env bash
printf 'engine %s\\n' "$*" >> "$COMMAND_LOG"
[ "$*" = "info" ]
`,
    { mode: 0o755 },
  )
}

afterEach(() => {
  for (const process of childProcesses.splice(0)) process.kill("SIGTERM")
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe("production:prime", () => {
  it.each([true, false])(
    "preserves the legacy static release while establishing a rollback target (dry run: %s)",
    (dryRun) => {
      const fixture = createReleaseFixture()
      configurePrimeRollout(fixture)
      const args = [
        "run",
        "production:prime",
        "--",
        "--repository",
        fixture.checkout,
        "--target",
        fixture.target,
      ]
      if (dryRun) args.splice(3, 0, "--dry-run")

      const result = spawnSync("npm", args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: fixture.environment,
      })

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(result.stdout).toContain(`Legacy source commit: ${fixture.release}`)
      expect(result.stdout).toContain("Previous Worker version: worker-version-old")
      expect(result.stdout).toContain(`Mode: ${dryRun ? "dry-run" : "prime"}`)
      expect(result.stdout).toContain("CoreEx Container application: absent")
      if (dryRun) {
        expect(result.stdout).toContain("Application mutations: none")
      } else {
        expect(result.stdout).toContain("Status: primed")
        expect(result.stdout).toContain(
          "Rollback Worker version: worker-version-prime",
        )
      }
      const commands = readFileSync(fixture.commandLog, "utf8")
      expect(commands).not.toContain("containers push")
      expect(commands).not.toContain("d1 migrations")
      expect(commands).not.toContain(" Migrate")
      if (dryRun)
        expect(commands).not.toContain(`--tag prime-${fixture.release}`)
      else
        expect(commands).toContain(`--tag prime-${fixture.release}`)
    },
  )

  it("recognizes a secret-created version that inherited the primed Durable Object class", () => {
    const fixture = createReleaseFixture()
    configurePrimeRollout(fixture, true)

    const result = spawnSync(
      "npm",
      [
        "run",
        "production:prime",
        "--",
        "--repository",
        fixture.checkout,
        "--target",
        fixture.target,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: fixture.environment,
      },
    )

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain("Status: already primed")
    const commands = readFileSync(fixture.commandLog, "utf8")
    expect(commands).not.toContain(`--tag prime-${fixture.release}`)
  })
})

describe("production:deploy", () => {
  it("reports a non-mutating dry run through the operator CLI", () => {
    const fixture = createReleaseFixture()
    const connection =
      "Host=ep-example.us-east-1.aws.neon.tech;Database=neondb;Username=owner;Password=must-never-appear;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable"

    const result = spawnSync(
      "npm",
      [
        "run",
        "production:deploy",
        "--",
        "--dry-run",
        "--repository",
        fixture.checkout,
        "--target",
        fixture.target,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: fixture.environment,
        input: `${connection}\n`,
      },
    )

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain(`Release: ${fixture.release}`)
    expect(result.stdout).toContain("Mode: dry-run")
    expect(result.stdout).toContain("Active Worker version: worker-version-old")
    expect(result.stdout).toContain(
      "Active CoreEx image: registry.cloudflare.com/test-account/coreex@sha256:old",
    )
    expect(result.stdout).toContain(
      `Intended image: registry.cloudflare.com/test-account/coreex:${fixture.release} (deployment pins its digest)`,
    )
    expect(result.stdout).toContain("Bindings: ASSETS, AUTH_DB, COREEX")
    expect(result.stdout).toContain(
      "Worker secrets present: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, BETTER_AUTH_SECRET, POSTGRES_CONNECTION_STRING",
    )
    expect(result.stdout).toContain(
      "PostgreSQL migration head: Acn.Fde.Practice.Database.Migrations.20260804-000001-test.pgsql",
    )
    expect(result.stdout).toContain("D1 migration head: 0001_identity.sql")
    expect(result.stdout).toContain("Intended rollout: immediate, one CoreEx instance")
    expect(result.stdout).toContain("Database mutations: none")
    expect(result.stdout).toContain("Application mutations: none")

    const commands = readFileSync(fixture.commandLog, "utf8")
    expect(commands).not.toContain(" Migrate")
    expect(commands).not.toContain("d1 migrations apply")
    expect(commands).not.toContain("containers push")
    expect(commands).not.toContain("--tag")
    expect(commands).not.toContain("rollback")
    expect(`${result.stdout}\n${result.stderr}\n${commands}`).not.toContain(connection)
    expect(`${result.stdout}\n${result.stderr}\n${commands}`).not.toContain(
      "must-never-appear",
    )
  })

  it("refuses a first rollout until the legacy Worker has been primed", () => {
    const fixture = createReleaseFixture()
    const connection =
      "Host=ep-example.us-east-1.aws.neon.tech;Database=neondb;Username=owner;Password=must-never-appear;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable"

    const result = spawnSync(
      "npm",
      [
        "run",
        "production:deploy",
        "--",
        "--repository",
        fixture.checkout,
        "--target",
        fixture.target,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...fixture.environment, NO_CONTAINER_APPLICATION: "1" },
        input: `${connection}\n`,
      },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("run npm run production:prime first")
    const commands = readFileSync(fixture.commandLog, "utf8")
    expect(commands).not.toContain(" Migrate")
    expect(commands).not.toContain("d1 migrations apply")
    expect(commands).not.toContain("engine build")
    expect(commands).not.toContain("containers push")
  })

  it("stops before image or application rollout when migration preparation fails", () => {
    const fixture = createReleaseFixture()
    const bin = path.join(path.dirname(fixture.target), "bin")
    writeFileSync(
      path.join(bin, "dotnet"),
      `#!/usr/bin/env bash
set -euo pipefail
printf 'dotnet %s\\n' "$*" >> "$COMMAND_LOG"
if [ "$*" = "--version" ]; then
  printf '10.0.302\\n'
elif [[ "$*" == *"migration-ledger"* ]]; then
  printf '[]\\n'
elif [[ "$*" == *" Migrate"* ]]; then
  exit 70
else
  exit 64
fi
`,
      { mode: 0o755 },
    )
    const connection =
      "Host=ep-example.us-east-1.aws.neon.tech;Database=neondb;Username=owner;Password=must-never-appear;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable"

    const result = spawnSync(
      "npm",
      [
        "run",
        "production:deploy",
        "--",
        "--repository",
        fixture.checkout,
        "--target",
        fixture.target,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: fixture.environment,
        input: `${connection}\n`,
      },
    )

    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain("Deployment record")
    expect(result.stdout).toContain("Status: preparation aborted")
    expect(result.stdout).toContain(`Release: ${fixture.release}`)
    expect(result.stdout).toContain("Application rollout: not started")
    expect(result.stdout).toContain("Database rollback: not attempted")
    const commands = readFileSync(fixture.commandLog, "utf8")
    expect(commands).toContain(" Migrate")
    expect(commands).not.toContain("engine build")
    expect(commands).not.toContain("containers push")
    expect(commands).not.toContain("--tag")
    expect(commands).not.toContain("rollback")
    expect(`${result.stdout}\n${result.stderr}\n${commands}`).not.toContain(connection)
  })

  it.each(["worker", "coreex"] as const)(
    "restores the captured application after a partial %s rollout without reverting databases",
    (failure) => {
      const fixture = createReleaseFixture()
      configureFailedRollout(fixture, failure)
      const connection =
        "Host=ep-example.us-east-1.aws.neon.tech;Database=neondb;Username=owner;Password=must-never-appear;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable"

      const result = spawnSync(
        "npm",
        [
          "run",
          "production:deploy",
          "--",
          "--repository",
          fixture.checkout,
          "--target",
          fixture.target,
        ],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: fixture.environment,
          input: `${connection}\n`,
        },
      )

      expect(result.status).not.toBe(0)
      expect(result.stdout).toContain("Deployment record")
      expect(result.stdout).toContain("Status: rollout failed; recovery succeeded")
      expect(result.stdout).toContain("Previous Worker version: worker-version-old")
      expect(result.stdout).toContain("Restored Worker version: worker-version-old")
      expect(result.stdout).toContain(
        "Previous CoreEx image: registry.cloudflare.com/test-account/coreex@sha256:old",
      )
      expect(result.stdout).toContain(
        "Restored CoreEx image: registry.cloudflare.com/test-account/coreex@sha256:old",
      )
      expect(result.stdout).toContain("Database rollback: not attempted")
      const commands = readFileSync(fixture.commandLog, "utf8")
      expect(commands).toContain("rollback worker-version-old")
      if (failure === "coreex")
        expect(commands).toContain(`--tag ${fixture.release}-recovery`)
      else
        expect(commands).not.toContain(`--tag ${fixture.release}-recovery`)
      expect(commands).not.toContain("d1 migrations rollback")
      expect(commands).not.toContain("PostgreSQL rollback")
      expect(`${result.stdout}\n${result.stderr}\n${commands}`).not.toContain(connection)
    },
  )

  it("removes a partially created Container when recovering the first rollout to its primed Worker", () => {
    const fixture = createReleaseFixture()
    configureFailedRollout(fixture, "coreex", "")
    const connection =
      "Host=ep-example.us-east-1.aws.neon.tech;Database=neondb;Username=owner;Password=must-never-appear;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable"

    const result = spawnSync(
      "npm",
      [
        "run",
        "production:deploy",
        "--",
        "--repository",
        fixture.checkout,
        "--target",
        fixture.target,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: fixture.environment,
        input: `${connection}\n`,
      },
    )

    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain("Status: rollout failed; recovery succeeded")
    expect(result.stdout).toContain("Previous CoreEx image: <none>")
    expect(result.stdout).toContain("Restored CoreEx image: <none>")
    const commands = readFileSync(fixture.commandLog, "utf8")
    expect(commands).toContain("containers delete container-app")
    expect(commands).toContain("rollback worker-version-old")
    expect(commands).not.toContain(`--tag ${fixture.release}-recovery`)
  })

  it("leaves a completed rollout active when the post-deploy health gate fails", () => {
    const fixture = createReleaseFixture()
    configureSuccessfulRollout(fixture, 503)
    const connection =
      "Host=ep-example.us-east-1.aws.neon.tech;Database=neondb;Username=owner;Password=must-never-appear;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable"

    const result = spawnSync(
      "npm",
      [
        "run",
        "production:deploy",
        "--",
        "--repository",
        fixture.checkout,
        "--target",
        fixture.target,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: fixture.environment,
        input: `${connection}\n`,
      },
    )

    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain("Status: health gate failed")
    expect(result.stdout).toContain("New Worker version: worker-version-new")
    expect(result.stdout).toContain(
      "New CoreEx image: registry.cloudflare.com/test-account/coreex@sha256:newdigest",
    )
    expect(result.stdout).toContain("SPA observations: 2/2 healthy")
    expect(result.stdout).toContain("CoreEx live observations: 0/2 healthy (HTTP 401)")
    expect(result.stderr).toContain(
      "post-deploy health gate failed; the completed release remains active",
    )
    const commands = readFileSync(fixture.commandLog, "utf8")
    expect(commands).not.toContain("rollback")
    expect(commands).not.toContain(`--tag ${fixture.release}-recovery`)
  })

  it("deploys a commit-addressed immutable image and observes health for the full gate", () => {
    const fixture = createReleaseFixture()
    configureSuccessfulRollout(fixture)
    const connection =
      "Host=ep-example.us-east-1.aws.neon.tech;Database=neondb;Username=owner;Password=must-never-appear;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable"

    const result = spawnSync(
      "npm",
      [
        "run",
        "production:deploy",
        "--",
        "--repository",
        fixture.checkout,
        "--target",
        fixture.target,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: fixture.environment,
        input: `${connection}\n`,
      },
    )

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain("Status: succeeded")
    expect(result.stdout).toContain("Previous Worker version: worker-version-old")
    expect(result.stdout).toContain("New Worker version: worker-version-new")
    expect(result.stdout).toContain(
      "Previous CoreEx image: registry.cloudflare.com/test-account/coreex@sha256:old",
    )
    expect(result.stdout).toContain(
      "New CoreEx image: registry.cloudflare.com/test-account/coreex@sha256:newdigest",
    )
    expect(result.stdout).toContain("SPA observations: 2/2 healthy")
    expect(result.stdout).toContain("CoreEx live observations: 2/2 healthy (HTTP 401)")
    expect(result.stdout).toContain(
      "Readiness finding: not probed; production health routes are private",
    )

    const commands = readFileSync(fixture.commandLog, "utf8")
    const build = commands.indexOf(`engine build --platform linux/amd64`)
    const push = commands.indexOf(`containers push coreex:${fixture.release}`)
    const deploy = commands.indexOf(
      `wrangler deploy --strict --containers-rollout immediate --tag ${fixture.release}`,
    )
    expect(build).toBeGreaterThan(-1)
    expect(push).toBeGreaterThan(build)
    expect(deploy).toBeGreaterThan(push)
    expect(commands).toContain(
      "versions view worker-version-new --name test-worker --json",
    )
    expect(commands).not.toContain("rollback")
    expect(`${result.stdout}\n${result.stderr}\n${commands}`).not.toContain(connection)
    expect(`${result.stdout}\n${result.stderr}\n${commands}`).not.toContain(
      "must-never-appear",
    )
  })
})
