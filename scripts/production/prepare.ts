import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"

const requiredWorkerSecrets = [
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "POSTGRES_CONNECTION_STRING",
]

interface ProductionTarget {
  branch: string
  cloudflareAccountId: string
  workerName: string
  d1DatabaseName: string
  d1DatabaseId: string
  d1Region: string
  containerApplicationName: string
  wranglerConfig: string
  postgresProject: string
  migrationManifest: string
  d1Mode: "local" | "remote"
  postgresMode: "local" | "remote"
  d1PersistTo?: string
  tools: {
    node: string
    dotnetSdk: string
    wrangler: string
  }
}

function option(name: string, fallback?: string): string {
  const index = process.argv.lastIndexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : fallback
  if (!value) throw new Error(`missing ${name}`)
  return value
}

interface RunOptions {
  environment?: NodeJS.ProcessEnv
  failureMessage?: string
}

function run(
  command: string,
  args: string[],
  cwd: string,
  options: RunOptions = {},
): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...options.environment },
  })
  if (result.error)
    throw new Error(
      options.failureMessage ?? `${command} could not start: ${result.error.message}`,
    )
  if (result.status !== 0)
    throw new Error(
      options.failureMessage ??
        `${command} ${args.join(" ")} failed: ${result.stderr.trim()}`,
    )
  return result.stdout.trim()
}

function readMigrationConnection(): string {
  process.stdout.write("PostgreSQL migration connection (hidden): ")
  if (!process.stdin.isTTY) return readFileSync(0, "utf8").trim()

  const result = spawnSync(
    "bash",
    ["-c", 'IFS= read -r -s value </dev/tty; printf "%s" "$value"'],
    { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] },
  )
  process.stdout.write("\n")
  if (result.error || result.status !== 0)
    throw new Error("could not read PostgreSQL migration connection")
  return result.stdout
}

function parseJson<T>(value: string, description: string): T {
  try {
    return JSON.parse(value) as T
  } catch {
    throw new Error(`${description} did not return valid JSON`)
  }
}

interface MigrationEntry {
  id: string
  path: string
  sha256: string
  compatibility: "expand"
}

interface MigrationManifest {
  postgres: MigrationEntry[]
  d1: MigrationEntry[]
}

function readTarget(targetPath: string): ProductionTarget {
  const target = parseJson<ProductionTarget>(
    readFileSync(targetPath, "utf8"),
    "Production target",
  )
  for (const field of ["d1Mode", "postgresMode"] as const)
    if (target[field] !== "local" && target[field] !== "remote")
      throw new Error(`production target ${field} must be local or remote`)
  return target
}

function activeWorkerVersion(
  target: ProductionTarget,
  wranglerConfig: string,
  repository: string,
): string {
  const deployments = parseJson<
    Array<{
      created_on: string
      versions: Array<{ version_id: string; percentage: number }>
    }>
  >(
    run(
      "npx",
      [
        "--no-install",
        "wrangler",
        "deployments",
        "list",
        "--name",
        target.workerName,
        "--json",
        "--config",
        wranglerConfig,
      ],
      repository,
    ),
    "Worker deployment lookup",
  )
  const deployment = deployments.toSorted((left, right) =>
    left.created_on.localeCompare(right.created_on),
  ).at(-1)
  const version = deployment?.versions.find(
    ({ percentage }) => percentage === 100,
  )?.version_id
  if (!version) throw new Error(`Worker ${target.workerName} has no active version`)
  return version
}

function workerVersionHasCoreExBinding(
  target: ProductionTarget,
  wranglerConfig: string,
  repository: string,
  version: string,
): boolean {
  const detail = parseJson<{
    id: string
    resources?: {
      bindings?: Array<{ type?: string; class_name?: string }>
    }
  }>(
    run(
      "npx",
      [
        "--no-install",
        "wrangler",
        "versions",
        "view",
        version,
        "--name",
        target.workerName,
        "--json",
        "--config",
        wranglerConfig,
      ],
      repository,
    ),
    "Worker version lookup",
  )
  if (detail.id !== version)
    throw new Error("Worker version lookup returned the wrong ID")
  return detail.resources?.bindings?.some(
    ({ type, class_name: className }) =>
      type === "durable_object_namespace" && className === "CoreExContainer",
  ) === true
}

function validateMigrationManifest(
  repository: string,
  manifestPath: string,
): MigrationManifest {
  const manifest = parseJson<MigrationManifest>(
    readFileSync(manifestPath, "utf8"),
    "Migration manifest",
  )
  if (!Array.isArray(manifest.postgres) || !Array.isArray(manifest.d1))
    throw new Error("Migration manifest must contain PostgreSQL and D1 arrays")

  for (const [database, migrations, extension] of [
    ["PostgreSQL", manifest.postgres, ".pgsql"],
    ["D1", manifest.d1, ".sql"],
  ] as const) {
    const listedPaths = new Set(migrations.map(({ path: migrationPath }) => migrationPath))
    const listedIds = new Set(migrations.map(({ id }) => id))
    if (listedPaths.size !== migrations.length || listedIds.size !== migrations.length)
      throw new Error(`${database} migration manifest contains duplicate entries`)
    const directories = new Set(
      migrations.map(({ path: migrationPath }) => path.dirname(migrationPath)),
    )
    for (const directory of directories) {
      for (const entry of readdirSync(path.resolve(repository, directory), {
        recursive: true,
        withFileTypes: true,
      })) {
        if (!entry.isFile() || !entry.name.endsWith(extension)) continue
        const migrationPath = path.relative(
          repository,
          path.join(entry.parentPath, entry.name),
        )
        if (!listedPaths.has(migrationPath))
          throw new Error(
            `checked-in ${database} migration is absent from the compatibility manifest: ${migrationPath}`,
          )
      }
    }
  }

  for (const migration of [...manifest.postgres, ...manifest.d1]) {
    if (migration.compatibility !== "expand")
      throw new Error(`migration ${migration.id} is not expand-compatible`)
    const contents = readFileSync(path.resolve(repository, migration.path))
    const digest = createHash("sha256").update(contents).digest("hex")
    if (digest !== migration.sha256)
      throw new Error(`migration ${migration.id} does not match its manifest digest`)
  }
  return manifest
}

function connectionSettingValues(connection: string, key: string): string[] {
  const prefix = `${key}=`
  return connection
    .split(";")
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => entry.slice(prefix.length))
}

function validateMigrationConnection(
  connection: string,
  mode: ProductionTarget["postgresMode"],
): void {
  const normalized = connection.toLowerCase().replaceAll(/\s/g, "")
  const requiredValues = new Map<string, string | undefined>([
    ["database", undefined],
    ["username", undefined],
    ["password", undefined],
    ...(mode === "remote"
      ? [
          ["sslmode", "verifyfull"],
          ["channelbinding", "require"],
          ["gssencryptionmode", "disable"],
        ] as const
      : [["sslmode", "disable"]] as const),
  ])
  const hostValues = connectionSettingValues(normalized, "host")
  const hostIsValid = mode === "remote"
    ? hostValues[0]?.endsWith(".aws.neon.tech") &&
      !hostValues[0].includes("-pooler.")
    : hostValues[0] === "127.0.0.1"
  const settingsAreValid = [...requiredValues].every(([key, expected]) => {
    const values = connectionSettingValues(normalized, key)
    return values.length === 1 && values[0].length > 0 &&
      (expected === undefined || values[0] === expected)
  })
  if (
    hostValues.length !== 1 ||
    !hostIsValid ||
    !settingsAreValid ||
    connectionSettingValues(normalized, "trustservercertificate").length > 0
  )
    throw new Error(
      "PostgreSQL migration connection must use the direct endpoint and required Npgsql settings",
    )
}

function d1LocationArguments(target: ProductionTarget, repository: string): string[] {
  if (target.d1Mode === "remote") return ["--remote"]
  if (!target.d1PersistTo)
    throw new Error("local D1 target requires d1PersistTo")
  return ["--local", "--persist-to", path.resolve(repository, target.d1PersistTo)]
}

function readPostgresLedger(
  target: ProductionTarget,
  repository: string,
  migrationConnection: string,
): string[] {
  return parseJson<string[]>(
    run(
      "dotnet",
      [
        "run",
        "--project",
        path.resolve(repository, target.postgresProject),
        "--",
        "migration-ledger",
      ],
      repository,
      {
        environment: { ConnectionStrings__Postgres: migrationConnection },
        failureMessage: "PostgreSQL migration ledger check failed",
      },
    ),
    "PostgreSQL migration ledger",
  )
}

function executeD1Query<T>(
  target: ProductionTarget,
  wranglerConfig: string,
  repository: string,
  query: string,
  description: string,
): T[] {
  const response = parseJson<
    Array<{ results: T[]; success: boolean }>
  >(
    run(
      "npx",
      [
        "--no-install",
        "wrangler",
        "d1",
        "execute",
        target.d1DatabaseName,
        ...d1LocationArguments(target, repository),
        "--command",
        query,
        "--json",
        "--config",
        wranglerConfig,
      ],
      repository,
    ),
    description,
  )
  if (response.some(({ success }) => !success))
    throw new Error(`${description} failed`)
  return response.flatMap(({ results }) => results)
}

function readD1Ledger(
  target: ProductionTarget,
  wranglerConfig: string,
  repository: string,
): string[] {
  try {
    return executeD1Query<{ name: string }>(
      target,
      wranglerConfig,
      repository,
      "SELECT name FROM d1_migrations ORDER BY id",
      "D1 migration ledger",
    ).map(({ name }) => name)
  } catch (ledgerError) {
    const tableCheck = executeD1Query<{ present: number }>(
      target,
      wranglerConfig,
      repository,
      "SELECT COUNT(*) AS present FROM sqlite_schema WHERE type = 'table' AND name = 'd1_migrations'",
      "D1 migration ledger table check",
    )
    if (tableCheck.length === 1 && Number(tableCheck[0].present) === 0)
      return []
    throw ledgerError
  }
}

function rejectUnknownMigrations(
  database: string,
  expected: string[],
  applied: string[],
): void {
  const expectedNames = new Set(expected)
  const unknown = applied.filter((name) => !expectedNames.has(name))
  if (unknown.length > 0)
    throw new Error(`${database} ledger contains unknown migrations: ${unknown.join(", ")}`)

  if (applied.some((name, index) => expected[index] !== name))
    throw new Error(
      `${database} ledger order does not match the checked-out release`,
    )
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run")
  const repository = path.resolve(option("--repository", process.cwd()))
  const targetPath = path.resolve(
    option(
      "--target",
      path.join(repository, "scripts/production/production-target.json"),
    ),
  )
  const target = readTarget(targetPath)

  if (run("git", ["status", "--porcelain"], repository))
    throw new Error("checkout must be clean")

  const branch = run("git", ["branch", "--show-current"], repository)
  if (branch !== target.branch)
    throw new Error(`deployment branch must be ${target.branch}`)

  run("git", ["fetch", "--quiet", "origin", target.branch], repository)
  const release = run("git", ["rev-parse", "HEAD"], repository)
  const originRelease = run(
    "git",
    ["rev-parse", `refs/remotes/origin/${target.branch}`],
    repository,
  )
  if (release !== originRelease)
    throw new Error(`HEAD must exactly match origin/${target.branch}`)

  if (process.versions.node !== target.tools.node)
    throw new Error(`Node ${target.tools.node} is required`)

  const dotnetVersion = run("dotnet", ["--version"], repository)
  if (dotnetVersion !== target.tools.dotnetSdk)
    throw new Error(`.NET SDK ${target.tools.dotnetSdk} is required`)

  const wranglerVersion = run(
    "npx",
    ["--no-install", "wrangler", "--version"],
    repository,
  )
  if (wranglerVersion !== target.tools.wrangler)
    throw new Error(`Wrangler ${target.tools.wrangler} is required`)

  const containerEngine = process.env.WRANGLER_DOCKER_BIN ?? "docker"
  try {
    run(containerEngine, ["info"], repository)
  } catch {
    throw new Error("configured container engine is not usable")
  }

  const wranglerConfig = path.resolve(repository, target.wranglerConfig)
  const whoami = run(
    "npx",
    ["--no-install", "wrangler", "whoami", "--config", wranglerConfig],
    repository,
  )
  if (!whoami.split(/\s+/).includes(target.cloudflareAccountId))
    throw new Error(`Cloudflare account must be ${target.cloudflareAccountId}`)

  const activeVersion = activeWorkerVersion(target, wranglerConfig, repository)

  const d1 = parseJson<{
    uuid: string
    name: string
    running_in_region: string
  }>(
    run(
      "npx",
      [
        "--no-install",
        "wrangler",
        "d1",
        "info",
        target.d1DatabaseName,
        "--json",
        "--config",
        wranglerConfig,
      ],
      repository,
    ),
    "D1 identity lookup",
  )
  if (
    d1.uuid !== target.d1DatabaseId ||
    d1.name !== target.d1DatabaseName ||
    d1.running_in_region !== target.d1Region
  )
    throw new Error(
      `D1 database must be ${target.d1DatabaseName} (${target.d1DatabaseId}) in ${target.d1Region}`,
    )

  const workerSecrets = parseJson<Array<{ name: string }>>(
    run(
      "npx",
      [
        "--no-install",
        "wrangler",
        "secret",
        "list",
        "--name",
        target.workerName,
        "--format",
        "json",
        "--config",
        wranglerConfig,
      ],
      repository,
    ),
    "Worker secret lookup",
  )
  const installedSecretNames = new Set(workerSecrets.map(({ name }) => name))
  const missingSecrets = requiredWorkerSecrets.filter(
    (name) => !installedSecretNames.has(name),
  )
  if (missingSecrets.length > 0)
    throw new Error(`missing Worker secrets: ${missingSecrets.join(", ")}`)

  const containerApplications = parseJson<
    Array<{
      name: string
      image?: string
      configuration?: { image?: string }
    }>
  >(
    run(
      "npx",
      [
        "--no-install",
        "wrangler",
        "containers",
        "list",
        "--json",
        "--config",
        wranglerConfig,
      ],
      repository,
    ),
    "Container application lookup",
  )
  const activeContainer = containerApplications.find(
    ({ name }) => name === target.containerApplicationName,
  )
  const activeImage = activeContainer
    ? activeContainer.image ?? activeContainer.configuration?.image
    : "<none>"
  if (!activeImage)
    throw new Error("active CoreEx Container image could not be captured")
  if (
    process.argv.includes("--require-primed") &&
    activeImage === "<none>" &&
    !workerVersionHasCoreExBinding(
      target,
      wranglerConfig,
      repository,
      activeVersion,
    )
  )
    throw new Error(
      "production has no rollback-compatible CoreEx application; run npm run production:prime first",
    )

  const dryRunDirectory = mkdtempSync(
    path.join(tmpdir(), "acn-fde-production-dry-run-"),
  )
  try {
    run(
      "npx",
      [
        "--no-install",
        "wrangler",
        "deploy",
        "--dry-run",
        "--containers-rollout",
        "immediate",
        "--config",
        wranglerConfig,
        "--outdir",
        dryRunDirectory,
      ],
      repository,
    )
  } finally {
    rmSync(dryRunDirectory, { recursive: true, force: true })
  }

  process.stdout.write(
    `Production preparation target: ${target.branch} at ${release}\nActive Worker version: ${activeVersion}\nActive CoreEx image: ${activeImage}\n`,
  )

  const migrationConnection = readMigrationConnection()
  if (!migrationConnection)
    throw new Error("PostgreSQL migration connection is required")

  validateMigrationConnection(migrationConnection, target.postgresMode)

  const manifest = validateMigrationManifest(
    repository,
    path.resolve(repository, target.migrationManifest),
  )
  const expectedPostgres = manifest.postgres.map(({ id }) => id)
  const expectedD1 = manifest.d1.map(({ id }) => id)

  const initialPostgres = readPostgresLedger(
    target,
    repository,
    migrationConnection,
  )
  rejectUnknownMigrations("PostgreSQL", expectedPostgres, initialPostgres)

  const initialD1 = readD1Ledger(target, wranglerConfig, repository)
  rejectUnknownMigrations("D1", expectedD1, initialD1)

  const pendingPostgres = expectedPostgres.filter(
    (name) => !initialPostgres.includes(name),
  )
  const pendingD1 = expectedD1.filter((name) => !initialD1.includes(name))
  process.stdout.write(
    `PostgreSQL pending before apply: ${pendingPostgres.join(", ") || "<none>"}\nD1 pending before apply: ${pendingD1.join(", ") || "<none>"}\n`,
  )

  const postgresWasCurrent = pendingPostgres.length === 0
  const d1WasCurrent = pendingD1.length === 0
  if (dryRun) {
    const currentVersion = activeWorkerVersion(target, wranglerConfig, repository)
    if (currentVersion !== activeVersion)
      throw new Error(
        `active Worker changed during preparation (${activeVersion} -> ${currentVersion})`,
      )
    process.stdout.write(
      `PostgreSQL migrations: ${postgresWasCurrent ? "current" : "pending"}\nD1 migrations: ${d1WasCurrent ? "current" : "pending"}\nPostgreSQL migration head: ${expectedPostgres.at(-1) ?? "<none>"}\nD1 migration head: ${expectedD1.at(-1) ?? "<none>"}\nProduction preparation dry run completed for ${release}\n`,
    )
    return
  }

  if (!postgresWasCurrent) {
    run(
      "dotnet",
      [
        "run",
        "--project",
        path.resolve(repository, target.postgresProject),
        "--",
        "Migrate",
      ],
      repository,
      {
        environment: { ConnectionStrings__Postgres: migrationConnection },
        failureMessage: "PostgreSQL migration failed; repair the cause and resume",
      },
    )
  }
  const finalPostgres = readPostgresLedger(
    target,
    repository,
    migrationConnection,
  )
  rejectUnknownMigrations("PostgreSQL", expectedPostgres, finalPostgres)
  const missingPostgres = expectedPostgres.filter(
    (name) => !finalPostgres.includes(name),
  )
  if (missingPostgres.length > 0)
    throw new Error(`PostgreSQL migrations remain pending: ${missingPostgres.join(", ")}`)

  if (!d1WasCurrent) {
    run(
      "npx",
      [
        "--no-install",
        "wrangler",
        "d1",
        "migrations",
        "apply",
        target.d1DatabaseName,
        ...d1LocationArguments(target, repository),
        "--config",
        wranglerConfig,
      ],
      repository,
      { failureMessage: "D1 migration failed; repair the cause and resume" },
    )
  }
  const finalD1 = readD1Ledger(target, wranglerConfig, repository)
  rejectUnknownMigrations("D1", expectedD1, finalD1)
  const missingD1 = expectedD1.filter((name) => !finalD1.includes(name))
  if (missingD1.length > 0)
    throw new Error(`D1 migrations remain pending: ${missingD1.join(", ")}`)

  const currentVersion = activeWorkerVersion(target, wranglerConfig, repository)
  if (currentVersion !== activeVersion)
    throw new Error(
      `active Worker changed during preparation (${activeVersion} -> ${currentVersion})`,
    )

  process.stdout.write(
    `PostgreSQL migrations: ${postgresWasCurrent ? "current" : "applied"}\nD1 migrations: ${d1WasCurrent ? "current" : "applied"}\nPostgreSQL migration head: ${expectedPostgres.at(-1) ?? "<none>"}\nD1 migration head: ${expectedD1.at(-1) ?? "<none>"}\nProduction databases are prepared for ${release}\n`,
  )
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : "production preparation failed"
  process.stderr.write(`error: ${message}\n`)
  process.exitCode = 1
}
