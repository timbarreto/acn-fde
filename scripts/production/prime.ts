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
import { spawnSync } from "node:child_process"

interface ProductionTarget {
  branch: string
  cloudflareAccountId: string
  workerName: string
  containerApplicationName: string
  wranglerConfig: string
  rollbackPrime: {
    legacyCommit: string
    expectedWorkerVersion: string
  }
  tools: {
    node: string
    dotnetSdk: string
    wrangler: string
  }
}

interface WorkerConfiguration {
  compatibility_date?: string
  compatibility_flags?: string[]
}

function option(name: string, fallback?: string): string {
  const index = process.argv.lastIndexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : fallback
  if (!value) throw new Error(`missing ${name}`)
  return value
}

function parseJson<T>(value: string, description: string): T {
  try {
    return JSON.parse(value) as T
  } catch {
    throw new Error(`${description} did not return valid JSON`)
  }
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 50 * 1024 * 1024,
  })
  if (result.error)
    throw new Error(`${command} could not start: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "no output"
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status ?? "without a status"}: ${detail}`,
    )
  }
  return result.stdout.trim()
}

function wrangler(repository: string, config: string, ...args: string[]): string {
  return run(
    "npx",
    ["--no-install", "wrangler", ...args, "--config", config],
    repository,
  )
}

function activeWorkerVersion(
  target: ProductionTarget,
  repository: string,
  config: string,
): string {
  const deployments = parseJson<
    Array<{
      created_on: string
      versions: Array<{ version_id: string; percentage: number }>
    }>
  >(
    wrangler(
      repository,
      config,
      "deployments",
      "list",
      "--name",
      target.workerName,
      "--json",
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

function versionTag(
  target: ProductionTarget,
  repository: string,
  config: string,
  version: string,
): string | undefined {
  const detail = parseJson<{
    id: string
    annotations?: Record<string, string>
    resources?: {
      bindings?: Array<{ type?: string; class_name?: string }>
    }
  }>(
    wrangler(
      repository,
      config,
      "versions",
      "view",
      version,
      "--name",
      target.workerName,
      "--json",
    ),
    "Worker version lookup",
  )
  if (detail.id !== version) throw new Error("Worker version lookup returned the wrong ID")
  return detail.annotations?.["workers/tag"]
}

function versionHasCoreExBinding(
  target: ProductionTarget,
  repository: string,
  config: string,
  version: string,
): boolean {
  const detail = parseJson<{
    id: string
    resources?: {
      bindings?: Array<{ type?: string; class_name?: string }>
    }
  }>(
    wrangler(
      repository,
      config,
      "versions",
      "view",
      version,
      "--name",
      target.workerName,
      "--json",
    ),
    "Worker version lookup",
  )
  if (detail.id !== version) throw new Error("Worker version lookup returned the wrong ID")
  return detail.resources?.bindings?.some(
    ({ type, class_name: className }) =>
      type === "durable_object_namespace" && className === "CoreExContainer",
  ) === true
}

function containerApplicationPresent(
  target: ProductionTarget,
  repository: string,
  config: string,
): boolean {
  const applications = parseJson<Array<{ name: string }>>(
    wrangler(repository, config, "containers", "list", "--json"),
    "Container application lookup",
  )
  return applications.some(({ name }) => name === target.containerApplicationName)
}

function extractLegacyRelease(
  repository: string,
  commit: string,
  destination: string,
): void {
  const result = spawnSync(
    "bash",
    [
      "-c",
      'set -o pipefail; git archive --format=tar "$1" | tar -xf - -C "$2"',
      "production-prime",
      commit,
      destination,
    ],
    { cwd: repository, encoding: "utf8", env: process.env },
  )
  if (result.error)
    throw new Error(`legacy release extraction could not start: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "no output"
    throw new Error(
      `legacy release extraction exited ${result.status ?? "without a status"}: ${detail}`,
    )
  }
}

function writeBridgeConfiguration(
  target: ProductionTarget,
  sourceConfiguration: WorkerConfiguration,
  legacyDirectory: string,
  temporaryDirectory: string,
): string {
  const bridge = path.join(temporaryDirectory, "rollback-bridge.mjs")
  writeFileSync(
    bridge,
    `export class CoreExContainer {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async fetch() {
    return new Response("Rollback bridge only", { status: 503 })
  }
}

export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request)
  },
}
`,
  )
  const config = path.join(temporaryDirectory, "wrangler.prime.json")
  writeFileSync(
    config,
    JSON.stringify({
      name: target.workerName,
      main: bridge,
      compatibility_date: sourceConfiguration.compatibility_date,
      compatibility_flags: sourceConfiguration.compatibility_flags,
      assets: {
        directory: path.join(legacyDirectory, "dist"),
        binding: "ASSETS",
        not_found_handling: "single-page-application",
      },
      durable_objects: {
        bindings: [{ name: "COREEX", class_name: "CoreExContainer" }],
      },
      migrations: [{ tag: "v1", new_sqlite_classes: ["CoreExContainer"] }],
    }),
  )
  return config
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
  const target = parseJson<ProductionTarget>(
    readFileSync(targetPath, "utf8"),
    "Production target",
  )
  if (!target.rollbackPrime?.legacyCommit || !target.rollbackPrime.expectedWorkerVersion)
    throw new Error("production target rollbackPrime is required")

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
  if (run("dotnet", ["--version"], repository) !== target.tools.dotnetSdk)
    throw new Error(`.NET SDK ${target.tools.dotnetSdk} is required`)
  if (
    run("npx", ["--no-install", "wrangler", "--version"], repository) !==
    target.tools.wrangler
  )
    throw new Error(`Wrangler ${target.tools.wrangler} is required`)

  const engine = process.env.WRANGLER_DOCKER_BIN ?? "docker"
  try {
    run(engine, ["info"], repository)
  } catch {
    throw new Error("configured container engine is not usable")
  }

  const config = path.resolve(repository, target.wranglerConfig)
  const whoami = wrangler(repository, config, "whoami")
  if (!whoami.split(/\s+/).includes(target.cloudflareAccountId))
    throw new Error(`Cloudflare account must be ${target.cloudflareAccountId}`)

  const expectedTag = `prime-${target.rollbackPrime.legacyCommit}`
  const activeVersion = activeWorkerVersion(target, repository, config)
  const activeTag = versionTag(target, repository, config, activeVersion)
  const hasContainerApplication = containerApplicationPresent(
    target,
    repository,
    config,
  )
  const isPrimed =
    activeTag === expectedTag ||
    versionHasCoreExBinding(target, repository, config, activeVersion)
  if (isPrimed && !hasContainerApplication) {
    process.stdout.write(
      `Legacy source commit: ${target.rollbackPrime.legacyCommit}\nPrevious Worker version: ${activeVersion}\nMode: ${dryRun ? "dry-run" : "prime"}\nCoreEx Container application: absent\nStatus: already primed\n${dryRun ? "Application mutations: none\n" : ""}`,
    )
    return
  }
  if (activeVersion !== target.rollbackPrime.expectedWorkerVersion)
    throw new Error(
      `rollback priming expected Worker ${target.rollbackPrime.expectedWorkerVersion}, found ${activeVersion}`,
    )
  if (hasContainerApplication)
    throw new Error("rollback priming requires no existing CoreEx Container application")

  run(
    "git",
    ["merge-base", "--is-ancestor", target.rollbackPrime.legacyCommit, "HEAD"],
    repository,
  )
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "acn-fde-production-prime-"),
  )
  try {
    const legacyDirectory = path.join(temporaryDirectory, "legacy")
    mkdirSync(legacyDirectory)
    extractLegacyRelease(
      repository,
      target.rollbackPrime.legacyCommit,
      legacyDirectory,
    )
    run("npm", ["ci"], legacyDirectory)
    run("npm", ["run", "build"], legacyDirectory)
    if (!existsSync(path.join(legacyDirectory, "dist/index.html")))
      throw new Error("legacy release build did not produce dist/index.html")

    const sourceConfiguration = parseJson<WorkerConfiguration>(
      readFileSync(path.join(legacyDirectory, "wrangler.jsonc"), "utf8"),
      "Legacy Worker configuration",
    )
    const bridgeConfig = writeBridgeConfiguration(
      target,
      sourceConfiguration,
      legacyDirectory,
      temporaryDirectory,
    )
    wrangler(repository, bridgeConfig, "deploy", "--dry-run", "--strict")

    process.stdout.write(
      `Legacy source commit: ${target.rollbackPrime.legacyCommit}\nPrevious Worker version: ${activeVersion}\nMode: ${dryRun ? "dry-run" : "prime"}\nCoreEx Container application: absent\n`,
    )
    if (dryRun) {
      process.stdout.write("Application mutations: none\n")
      return
    }

    wrangler(
      repository,
      bridgeConfig,
      "deploy",
      "--strict",
      "--tag",
      expectedTag,
      "--message",
      `Establish rollback bridge from ${target.rollbackPrime.legacyCommit}`,
    )
    const primedVersion = activeWorkerVersion(target, repository, config)
    if (versionTag(target, repository, config, primedVersion) !== expectedTag)
      throw new Error("rollback bridge did not become the active Worker version")
    if (containerApplicationPresent(target, repository, config))
      throw new Error("rollback bridge unexpectedly created a Container application")
    process.stdout.write(
      `Status: primed\nRollback Worker version: ${primedVersion}\n`,
    )
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : "production priming failed"
  process.stderr.write(`error: ${message}\n`)
  process.exitCode = 1
}
