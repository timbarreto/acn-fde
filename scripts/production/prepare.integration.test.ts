import { createHash, randomUUID } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const repositoryRoot = path.resolve(import.meta.dirname, "../..")
const prepareScript = path.join(repositoryRoot, "scripts/production/prepare.ts")
const wrangler = path.join(repositoryRoot, "node_modules/.bin/wrangler")
const temporaryDirectories: string[] = []
const postgresContainer = `acn-fde-deployment-tests-${randomUUID()}`
const postgresPassword = "disposable-deployment-password"
let postgresPort = ""

function command(
  executable: string,
  args: string[],
  options: { cwd?: string; environment?: NodeJS.ProcessEnv; input?: string } = {},
): string {
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    env: options.environment ?? process.env,
    input: options.input,
  })
  if (result.status !== 0)
    throw new Error(
      `${executable} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
    )
  return result.stdout.trim()
}

function git(cwd: string, ...args: string[]): string {
  return command("git", args, { cwd })
}

function copyMigrationRelease(checkout: string): void {
  writeFileSync(path.join(checkout, ".gitignore"), "**/bin/\n**/obj/\n")
  mkdirSync(path.join(checkout, "backend"), { recursive: true })
  for (const name of ["Directory.Build.props", "Directory.Packages.props"])
    cpSync(path.join(repositoryRoot, "backend", name), path.join(checkout, "backend", name))
  cpSync(
    path.join(repositoryRoot, "backend/tools/Acn.Fde.Practice.Database"),
    path.join(checkout, "backend/tools/Acn.Fde.Practice.Database"),
    {
      recursive: true,
      filter: (source) => !source.includes(`${path.sep}bin${path.sep}`) &&
        !source.includes(`${path.sep}obj${path.sep}`),
    },
  )
  cpSync(
    path.join(repositoryRoot, "worker/migrations"),
    path.join(checkout, "worker/migrations"),
    { recursive: true },
  )

  const postgresPaths = [
    "backend/tools/Acn.Fde.Practice.Database/Migrations/20260804-000001-create-practice-schema.pgsql",
    "backend/tools/Acn.Fde.Practice.Database/Migrations/20260804-000002-create-practice-state.pgsql",
  ]
  const d1Paths = ["worker/migrations/0001_identity.sql"]
  const entry = (relativePath: string, id: string) => ({
    id,
    path: relativePath,
    sha256: createHash("sha256")
      .update(readFileSync(path.join(checkout, relativePath)))
      .digest("hex"),
    compatibility: "expand",
  })
  mkdirSync(path.join(checkout, "scripts/production"), { recursive: true })
  writeFileSync(
    path.join(checkout, "scripts/production/migrations.json"),
    JSON.stringify({
      postgres: postgresPaths.map((relativePath) =>
        entry(
          relativePath,
          `Acn.Fde.Practice.Database.Migrations.${path.basename(relativePath)}`,
        ),
      ),
      d1: d1Paths.map((relativePath) => entry(relativePath, path.basename(relativePath))),
    }),
  )

  writeFileSync(path.join(checkout, "worker.ts"), "export default { fetch: () => new Response('ok') }\n")
  writeFileSync(
    path.join(checkout, "wrangler.deployment-test.jsonc"),
    JSON.stringify({
      name: "deployment-test",
      main: "worker.ts",
      compatibility_date: "2026-08-04",
      d1_databases: [
        {
          binding: "AUTH_DB",
          database_name: "test-auth",
          database_id: "test-database-id",
          migrations_dir: "worker/migrations",
        },
      ],
    }),
  )
}

function createCheckout(): { checkout: string; target: string; persistTo: string } {
  const directory = mkdtempSync(path.join(tmpdir(), "acn-fde-deployment-integration-"))
  temporaryDirectories.push(directory)
  const checkout = path.join(directory, "checkout")
  const origin = path.join(directory, "origin.git")
  mkdirSync(checkout)
  git(directory, "init", "--bare", origin)
  git(checkout, "init", "--initial-branch=main")
  git(checkout, "config", "user.name", "Deployment Integration Test")
  git(checkout, "config", "user.email", "deployment@example.invalid")
  copyMigrationRelease(checkout)
  git(checkout, "add", ".")
  git(checkout, "commit", "-m", "deployment fixture")
  git(checkout, "remote", "add", "origin", origin)
  git(checkout, "push", "-u", "origin", "main")

  const persistTo = path.join(directory, "d1")
  const target = path.join(directory, "target.json")
  writeFileSync(
    target,
    JSON.stringify({
      branch: "main",
      cloudflareAccountId: "test-account",
      workerName: "test-worker",
      d1DatabaseName: "test-auth",
      d1DatabaseId: "test-database-id",
      d1Region: "ENAM",
      containerApplicationName: "test-worker-CoreExContainer",
      wranglerConfig: "wrangler.deployment-test.jsonc",
      postgresProject:
        "backend/tools/Acn.Fde.Practice.Database/Acn.Fde.Practice.Database.csproj",
      migrationManifest: "scripts/production/migrations.json",
      d1Mode: "local",
      d1PersistTo: persistTo,
      tools: {
        node: process.versions.node,
        dotnetSdk: command("dotnet", ["--version"]),
        wrangler: JSON.parse(
          readFileSync(path.join(repositoryRoot, "node_modules/wrangler/package.json"), "utf8"),
        ).version,
      },
    }),
  )

  const fakeBin = path.join(directory, "bin")
  mkdirSync(fakeBin)
  writeFileSync(
    path.join(fakeBin, "npx"),
    `#!/usr/bin/env bash
set -euo pipefail
shift 2
case "$*" in
  *"--version"*) printf '%s\\n' "$TEST_WRANGLER_VERSION" ;;
  *"whoami"*) printf 'Account ID: test-account\\n' ;;
  *"deployments list"*)
    version="worker-version-1"
    if [ -n "\${CHANGE_WORKER_AFTER_LOOKUP:-}" ]; then
      count=0
      [ -f "$WORKER_LOOKUP_STATE" ] && count="$(cat "$WORKER_LOOKUP_STATE")"
      count=$((count + 1))
      printf '%s' "$count" > "$WORKER_LOOKUP_STATE"
      [ "$count" -gt 1 ] && version="worker-version-2"
    fi
    printf '[{"created_on":"2026-08-06T00:00:00Z","versions":[{"version_id":"%s","percentage":100}]}]\\n' "$version"
    ;;
  *"d1 info"*) printf '{"uuid":"test-database-id","name":"test-auth","running_in_region":"ENAM"}\\n' ;;
  *"secret list"*) printf '[{"name":"GITHUB_CLIENT_ID"},{"name":"GITHUB_CLIENT_SECRET"},{"name":"BETTER_AUTH_SECRET"},{"name":"POSTGRES_CONNECTION_STRING"}]\\n' ;;
  *"containers list"*) printf '[]\\n' ;;
  *"deploy --dry-run"*) printf '%s\\n' '--dry-run: exiting now.' ;;
  "d1 "*) exec "$TEST_WRANGLER" "$@" ;;
  *) printf 'unexpected npx command: %s\\n' "$*" >&2; exit 64 ;;
esac
`,
    { mode: 0o755 },
  )
  const fakeEngine = path.join(fakeBin, "container-engine")
  writeFileSync(fakeEngine, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 })

  return { checkout, target, persistTo }
}

function runPreparation(
  checkout: string,
  target: string,
  connection: string,
  environment: NodeJS.ProcessEnv = {},
): ReturnType<typeof spawnSync> {
  const directory = path.dirname(target)
  return spawnSync(
    process.execPath,
    [prepareScript, "--repository", checkout, "--target", target],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ...environment,
        PATH: `${path.join(directory, "bin")}:${process.env.PATH ?? ""}`,
        TEST_WRANGLER: wrangler,
        TEST_WRANGLER_VERSION: JSON.parse(
          readFileSync(path.join(repositoryRoot, "node_modules/wrangler/package.json"), "utf8"),
        ).version,
        WRANGLER_DOCKER_BIN: path.join(directory, "bin/container-engine"),
      },
      input: `${connection}\n`,
    },
  )
}

function createDatabase(): { name: string; connection: string } {
  const name = `deployment_${randomUUID().replaceAll("-", "")}`
  command("podman", ["exec", postgresContainer, "createdb", "-U", "postgres", name])
  return {
    name,
    connection:
      `Host=127.0.0.1;Port=${postgresPort};Database=${name};Username=postgres;` +
      `Password=${postgresPassword};SSL Mode=Disable`,
  }
}

beforeAll(() => {
  command("podman", [
    "run",
    "--detach",
    "--rm",
    "--name",
    postgresContainer,
    "--env",
    `POSTGRES_PASSWORD=${postgresPassword}`,
    "--publish",
    "127.0.0.1::5432",
    "docker.io/library/postgres:18.4",
  ])
  postgresPort = command("podman", ["port", postgresContainer, "5432/tcp"])
    .split(":")
    .at(-1)!
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = spawnSync(
      "podman",
      ["exec", postgresContainer, "pg_isready", "-U", "postgres"],
      { stdio: "ignore" },
    )
    if (ready.status === 0) return
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
  }
  throw new Error("disposable PostgreSQL did not become ready")
})

afterAll(() => {
  spawnSync("podman", ["rm", "--force", postgresContainer], { stdio: "ignore" })
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe.sequential("production:prepare disposable databases", () => {
  it("applies a fresh release and records both native ledgers", () => {
    const { checkout, target, persistTo } = createCheckout()
    const database = createDatabase()
    const environment = {
      ...process.env,
      PATH: `${path.dirname(path.join(path.dirname(target), "bin/npx"))}:${process.env.PATH ?? ""}`,
      TEST_WRANGLER: wrangler,
      TEST_WRANGLER_VERSION: JSON.parse(
        readFileSync(path.join(repositoryRoot, "node_modules/wrangler/package.json"), "utf8"),
      ).version,
      WRANGLER_DOCKER_BIN: path.join(path.dirname(target), "bin/container-engine"),
    }

    const result = spawnSync(
      process.execPath,
      [prepareScript, "--repository", checkout, "--target", target],
      { encoding: "utf8", env: environment, input: `${database.connection}\n` },
    )

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    const postgresLedger = command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-Atc",
      'SELECT scriptname FROM public.schemaversions ORDER BY schemaversionsid',
    ]).split("\n")
    expect(postgresLedger).toEqual([
      "Acn.Fde.Practice.Database.Migrations.20260804-000001-create-practice-schema.pgsql",
      "Acn.Fde.Practice.Database.Migrations.20260804-000002-create-practice-state.pgsql",
    ])

    const d1LedgerResponse = JSON.parse(
      command(wrangler, [
        "d1",
        "execute",
        "test-auth",
        "--local",
        "--persist-to",
        persistTo,
        "--command",
        "SELECT name FROM d1_migrations ORDER BY id",
        "--json",
        "--config",
        path.join(checkout, "wrangler.deployment-test.jsonc"),
      ]),
    ) as Array<{ results: Array<{ name: string }> }>
    expect(d1LedgerResponse[0].results.map(({ name }) => name)).toEqual([
      "0001_identity.sql",
    ])
  })

  it("recognizes current ledgers without repeating migrations", () => {
    const { checkout, target } = createCheckout()
    const database = createDatabase()

    const first = runPreparation(checkout, target, database.connection)
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
    const second = runPreparation(checkout, target, database.connection)

    expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0)
    expect(second.stdout).toContain("PostgreSQL migrations: current")
    expect(second.stdout).toContain("D1 migrations: current")
    const appliedCount = command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-Atc",
      "SELECT count(*) FROM public.schemaversions",
    ])
    expect(appliedCount).toBe("2")
  })

  it("continues from the first pending entry in a native ledger", () => {
    const { checkout, target, persistTo } = createCheckout()
    const database = createDatabase()
    command(
      "dotnet",
      [
        "run",
        "--project",
        path.join(
          checkout,
          "backend/tools/Acn.Fde.Practice.Database/Acn.Fde.Practice.Database.csproj",
        ),
        "--",
        "Migrate",
      ],
      {
        cwd: checkout,
        environment: {
          ...process.env,
          ConnectionStrings__Postgres: database.connection,
        },
      },
    )
    command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-c",
      `DROP TABLE practice.practice_state; DELETE FROM public.schemaversions WHERE scriptname = 'Acn.Fde.Practice.Database.Migrations.20260804-000002-create-practice-state.pgsql';`,
    ])
    command(wrangler, [
      "d1",
      "migrations",
      "apply",
      "test-auth",
      "--local",
      "--persist-to",
      persistTo,
      "--config",
      path.join(checkout, "wrangler.deployment-test.jsonc"),
    ])

    const result = runPreparation(checkout, target, database.connection)

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain(
      "PostgreSQL pending before apply: Acn.Fde.Practice.Database.Migrations.20260804-000002-create-practice-state.pgsql",
    )
    expect(result.stdout).toContain("D1 migrations: current")
    const appliedCount = command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-Atc",
      "SELECT count(*) FROM public.schemaversions",
    ])
    expect(appliedCount).toBe("2")
  })

  it("rejects an unexpected checked-in migration before either database changes", () => {
    const { checkout, target } = createCheckout()
    const database = createDatabase()
    const unexpected = path.join(
      checkout,
      "backend/tools/Acn.Fde.Practice.Database/Migrations/20260806-000003-unexpected.pgsql",
    )
    writeFileSync(unexpected, 'CREATE TABLE practice."must_not_exist" (id int);\n')
    git(checkout, "add", unexpected)
    git(checkout, "commit", "-m", "unexpected migration")
    git(checkout, "push", "origin", "main")

    const result = runPreparation(checkout, target, database.connection)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      "checked-in PostgreSQL migration is absent from the compatibility manifest",
    )
    const ledgerExists = command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-Atc",
      "SELECT to_regclass('public.schemaversions') IS NOT NULL",
    ])
    expect(ledgerExists).toBe("f")
  })

  it("rejects an incompatible migration before either database changes", () => {
    const { checkout, target } = createCheckout()
    const database = createDatabase()
    const manifestPath = path.join(checkout, "scripts/production/migrations.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      postgres: Array<Record<string, string>>
    }
    manifest.postgres[0].compatibility = "contract"
    writeFileSync(manifestPath, JSON.stringify(manifest))
    git(checkout, "add", manifestPath)
    git(checkout, "commit", "-m", "mark incompatible migration")
    git(checkout, "push", "origin", "main")

    const result = runPreparation(checkout, target, database.connection)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      "migration Acn.Fde.Practice.Database.Migrations.20260804-000001-create-practice-schema.pgsql is not expand-compatible",
    )
    const ledgerExists = command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-Atc",
      "SELECT to_regclass('public.schemaversions') IS NOT NULL",
    ])
    expect(ledgerExists).toBe("f")
  })

  it("rejects a reordered PostgreSQL ledger before D1 changes", () => {
    const { checkout, target, persistTo } = createCheckout()
    const database = createDatabase()
    command(
      "dotnet",
      [
        "run",
        "--project",
        path.join(
          checkout,
          "backend/tools/Acn.Fde.Practice.Database/Acn.Fde.Practice.Database.csproj",
        ),
        "--",
        "Migrate",
      ],
      {
        cwd: checkout,
        environment: {
          ...process.env,
          ConnectionStrings__Postgres: database.connection,
        },
      },
    )
    command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-c",
      "UPDATE public.schemaversions SET schemaversionsid = 3 WHERE schemaversionsid = 1; UPDATE public.schemaversions SET schemaversionsid = 1 WHERE schemaversionsid = 2; UPDATE public.schemaversions SET schemaversionsid = 2 WHERE schemaversionsid = 3;",
    ])

    const result = runPreparation(checkout, target, database.connection)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      "PostgreSQL ledger order does not match the checked-out release",
    )
    expect(existsSync(persistTo)).toBe(false)
  })

  it("rejects an unknown PostgreSQL ledger entry before D1 changes", () => {
    const { checkout, target, persistTo } = createCheckout()
    const database = createDatabase()
    command(
      "dotnet",
      [
        "run",
        "--project",
        path.join(
          checkout,
          "backend/tools/Acn.Fde.Practice.Database/Acn.Fde.Practice.Database.csproj",
        ),
        "--",
        "Migrate",
      ],
      {
        cwd: checkout,
        environment: {
          ...process.env,
          ConnectionStrings__Postgres: database.connection,
        },
      },
    )
    command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-c",
      "INSERT INTO public.schemaversions (scriptname, applied) VALUES ('unknown.pgsql', now())",
    ])

    const result = runPreparation(checkout, target, database.connection)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      "PostgreSQL ledger contains unknown migrations: unknown.pgsql",
    )
    expect(existsSync(persistTo)).toBe(false)
  })

  it("rejects an unknown D1 ledger entry before PostgreSQL changes", () => {
    const { checkout, target, persistTo } = createCheckout()
    const database = createDatabase()
    const config = path.join(checkout, "wrangler.deployment-test.jsonc")
    command(wrangler, [
      "d1",
      "migrations",
      "list",
      "test-auth",
      "--local",
      "--persist-to",
      persistTo,
      "--config",
      config,
    ])
    command(wrangler, [
      "d1",
      "execute",
      "test-auth",
      "--local",
      "--persist-to",
      persistTo,
      "--command",
      "INSERT INTO d1_migrations (name) VALUES ('9999_unknown.sql')",
      "--config",
      config,
    ])

    const result = runPreparation(checkout, target, database.connection)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      "D1 ledger contains unknown migrations: 9999_unknown.sql",
    )
    const ledgerExists = command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-Atc",
      "SELECT to_regclass('public.schemaversions') IS NOT NULL",
    ])
    expect(ledgerExists).toBe("f")
  })

  it("stops after a D1 migration failure while retaining successful PostgreSQL work", () => {
    const { checkout, target, persistTo } = createCheckout()
    const database = createDatabase()
    const failedMigrationPath = "worker/migrations/0002_fail.sql"
    const failedMigration = "THIS IS NOT VALID SQL;\n"
    writeFileSync(path.join(checkout, failedMigrationPath), failedMigration)
    const manifestPath = path.join(checkout, "scripts/production/migrations.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      d1: Array<Record<string, string>>
    }
    manifest.d1.push({
      id: "0002_fail.sql",
      path: failedMigrationPath,
      sha256: createHash("sha256").update(failedMigration).digest("hex"),
      compatibility: "expand",
    })
    writeFileSync(manifestPath, JSON.stringify(manifest))
    git(checkout, "add", ".")
    git(checkout, "commit", "-m", "add failing D1 migration")
    git(checkout, "push", "origin", "main")

    const result = runPreparation(checkout, target, database.connection)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("D1 migration failed; repair the cause and resume")
    const postgresApplied = command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-Atc",
      "SELECT count(*) FROM public.schemaversions",
    ])
    expect(postgresApplied).toBe("2")
    const d1LedgerResponse = JSON.parse(
      command(wrangler, [
        "d1",
        "execute",
        "test-auth",
        "--local",
        "--persist-to",
        persistTo,
        "--command",
        "SELECT name FROM d1_migrations ORDER BY id",
        "--json",
        "--config",
        path.join(checkout, "wrangler.deployment-test.jsonc"),
      ]),
    ) as Array<{ results: Array<{ name: string }> }>
    expect(d1LedgerResponse[0].results.map(({ name }) => name)).toEqual([
      "0001_identity.sql",
    ])
  })

  it("resumes after interruption without repeating completed migrations", () => {
    const { checkout, target, persistTo } = createCheckout()
    const database = createDatabase()
    const migrationPath = "worker/migrations/0002_resume.sql"
    const brokenMigration = "BROKEN MIGRATION;\n"
    writeFileSync(path.join(checkout, migrationPath), brokenMigration)
    const manifestPath = path.join(checkout, "scripts/production/migrations.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      d1: Array<Record<string, string>>
    }
    manifest.d1.push({
      id: "0002_resume.sql",
      path: migrationPath,
      sha256: createHash("sha256").update(brokenMigration).digest("hex"),
      compatibility: "expand",
    })
    writeFileSync(manifestPath, JSON.stringify(manifest))
    git(checkout, "add", ".")
    git(checkout, "commit", "-m", "add interrupted migration")
    git(checkout, "push", "origin", "main")

    const interrupted = runPreparation(checkout, target, database.connection)
    expect(interrupted.status).not.toBe(0)

    const repairedMigration =
      'CREATE TABLE "resume_proof" ("id" INTEGER PRIMARY KEY);\n'
    writeFileSync(path.join(checkout, migrationPath), repairedMigration)
    const repairedManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      d1: Array<Record<string, string>>
    }
    repairedManifest.d1.find(({ id }) => id === "0002_resume.sql")!.sha256 =
      createHash("sha256").update(repairedMigration).digest("hex")
    writeFileSync(manifestPath, JSON.stringify(repairedManifest))
    git(checkout, "add", ".")
    git(checkout, "commit", "-m", "repair interrupted migration")
    git(checkout, "push", "origin", "main")

    const resumed = runPreparation(checkout, target, database.connection)

    expect(resumed.status, `${resumed.stdout}\n${resumed.stderr}`).toBe(0)
    expect(resumed.stdout).toContain("PostgreSQL migrations: current")
    expect(resumed.stdout).toContain("D1 pending before apply: 0002_resume.sql")
    const postgresApplied = command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-Atc",
      "SELECT count(*) FROM public.schemaversions",
    ])
    expect(postgresApplied).toBe("2")
    const d1LedgerResponse = JSON.parse(
      command(wrangler, [
        "d1",
        "execute",
        "test-auth",
        "--local",
        "--persist-to",
        persistTo,
        "--command",
        "SELECT name FROM d1_migrations ORDER BY id",
        "--json",
        "--config",
        path.join(checkout, "wrangler.deployment-test.jsonc"),
      ]),
    ) as Array<{ results: Array<{ name: string }> }>
    expect(d1LedgerResponse[0].results.map(({ name }) => name)).toEqual([
      "0001_identity.sql",
      "0002_resume.sql",
    ])
  })

  it("aborts when the active Worker changes while leaving additive migrations applied", () => {
    const { checkout, target, persistTo } = createCheckout()
    const database = createDatabase()
    const workerLookupState = path.join(path.dirname(target), "worker-lookups")

    const result = runPreparation(checkout, target, database.connection, {
      CHANGE_WORKER_AFTER_LOOKUP: "1",
      WORKER_LOOKUP_STATE: workerLookupState,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(
      "active Worker changed during preparation (worker-version-1 -> worker-version-2)",
    )
    const postgresApplied = command("podman", [
      "exec",
      postgresContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      database.name,
      "-Atc",
      "SELECT count(*) FROM public.schemaversions",
    ])
    expect(postgresApplied).toBe("2")
    const d1LedgerResponse = JSON.parse(
      command(wrangler, [
        "d1",
        "execute",
        "test-auth",
        "--local",
        "--persist-to",
        persistTo,
        "--command",
        "SELECT name FROM d1_migrations ORDER BY id",
        "--json",
        "--config",
        path.join(checkout, "wrangler.deployment-test.jsonc"),
      ]),
    ) as Array<{ results: Array<{ name: string }> }>
    expect(d1LedgerResponse[0].results.map(({ name }) => name)).toEqual([
      "0001_identity.sql",
    ])
  })
})
