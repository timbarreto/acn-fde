import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

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
  containerApplicationName: string
  containerImageName: string
  wranglerConfig: string
  migrationManifest: string
  healthOrigin: string
  healthGate: {
    attempts: number
    intervalMilliseconds: number
    requestTimeoutMilliseconds?: number
  }
  rollbackPrime: {
    legacyCommit: string
    expectedWorkerVersion: string
  }
}

interface MigrationManifest {
  postgres: Array<{ id: string }>
  d1: Array<{ id: string }>
}

interface WorkerConfiguration {
  $schema?: string
  main?: string
  assets?: { binding?: string; directory?: string }
  d1_databases?: Array<{ binding: string; migrations_dir?: string }>
  containers?: Array<{
    name?: string
    class_name: string
    image: string
    image_build_context?: string
    max_instances?: number
    instance_type?: string
    constraints?: { regions?: string[] }
  }>
  durable_objects?: { bindings: Array<{ name: string }> }
}

interface RecoveryResult {
  workerVersion: string
  containerImage: string
  succeeded: boolean
  failure?: string
}

interface HealthGateResult {
  spaHealthy: number
  coreExHealthy: number
  attempts: number
  firstCoreExHealthyObservation?: number
  passed: boolean
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

function wrangler(
  repository: string,
  config: string,
  ...args: string[]
): string {
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

interface ContainerApplication {
  id?: string
  name: string
  configuration?: { image?: string }
}

function activeContainerApplication(
  target: ProductionTarget,
  repository: string,
  config: string,
): ContainerApplication | undefined {
  const applications = parseJson<ContainerApplication[]>(
    wrangler(repository, config, "containers", "list", "--json"),
    "Container application lookup",
  )
  const application = applications.find(
    ({ name }) => name === target.containerApplicationName,
  )
  if (application && !application.configuration?.image)
    throw new Error("active CoreEx Container image could not be captured")
  return application
}

function activeContainerImage(
  target: ProductionTarget,
  repository: string,
  config: string,
): string {
  return activeContainerApplication(target, repository, config)
    ?.configuration?.image ?? "<none>"
}

function runPreparation(
  repository: string,
  targetPath: string,
  dryRun: boolean,
): void {
  const prepareScript = path.resolve(import.meta.dirname, "prepare.ts")
  const args = [
    prepareScript,
    "--repository",
    repository,
    "--target",
    targetPath,
    "--require-primed",
  ]
  if (dryRun) args.push("--dry-run")
  const result = spawnSync(process.execPath, args, {
    cwd: repository,
    env: process.env,
    stdio: "inherit",
  })
  if (result.error)
    throw new Error(`production preparation could not start: ${result.error.message}`)
  if (result.status !== 0)
    throw new Error(
      dryRun ? "production preparation dry run failed" : "production preparation failed",
    )
}

function bindingNames(configuration: WorkerConfiguration): string[] {
  return [
    configuration.assets?.binding,
    ...(configuration.d1_databases ?? []).map(({ binding }) => binding),
    ...(configuration.durable_objects?.bindings ?? []).map(({ name }) => name),
  ].filter((name): name is string => Boolean(name))
}

function absolutePath(repository: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(repository, value)
}

function validateSingletonConfiguration(
  target: ProductionTarget,
  configuration: WorkerConfiguration,
): void {
  const containers = configuration.containers ?? []
  if (containers.length !== 1) throw new Error("production must define one Container")
  const [container] = containers
  if (
    container.name !== target.containerApplicationName ||
    container.class_name !== "CoreExContainer" ||
    container.max_instances !== 1 ||
    container.instance_type !== "basic" ||
    container.constraints?.regions?.join(",") !== "ENAM"
  )
    throw new Error(
      "production CoreEx Container must use the named CoreEx class and one basic instance constrained to ENAM",
    )
}

function buildImmutableImage(
  target: ProductionTarget,
  configuration: WorkerConfiguration,
  repository: string,
  config: string,
  release: string,
): string {
  const container = configuration.containers?.[0]
  if (!container) throw new Error("production Container configuration is missing")
  const engine = process.env.WRANGLER_DOCKER_BIN ?? "docker"
  const imageTag = `${target.containerImageName}:${release}`
  run(
    engine,
    [
      "build",
      "--platform",
      "linux/amd64",
      "--file",
      absolutePath(repository, container.image),
      "--tag",
      imageTag,
      repository,
    ],
    repository,
  )
  wrangler(
    repository,
    config,
    "containers",
    "push",
    imageTag,
    "--path-to-docker",
    engine,
  )

  const registryTag =
    `registry.cloudflare.com/${target.cloudflareAccountId}/${imageTag}`
  const repoDigests = parseJson<string[]>(
    run(
      engine,
      ["image", "inspect", registryTag, "--format", "{{ json .RepoDigests }}"],
      repository,
    ),
    "Container image digest lookup",
  )
  const prefix =
    `registry.cloudflare.com/${target.cloudflareAccountId}/${target.containerImageName}@sha256:`
  const digest = repoDigests.find((value) => value.startsWith(prefix))
  if (!digest) throw new Error("pushed CoreEx image digest could not be captured")
  return digest
}

function writeDeploymentConfiguration(
  configuration: WorkerConfiguration,
  repository: string,
  image: string,
  directory: string,
): string {
  const deployConfiguration = structuredClone(configuration)
  delete deployConfiguration.$schema
  if (deployConfiguration.main)
    deployConfiguration.main = absolutePath(repository, deployConfiguration.main)
  if (deployConfiguration.assets?.directory)
    deployConfiguration.assets.directory = absolutePath(
      repository,
      deployConfiguration.assets.directory,
    )
  for (const database of deployConfiguration.d1_databases ?? [])
    if (database.migrations_dir)
      database.migrations_dir = absolutePath(repository, database.migrations_dir)
  const container = deployConfiguration.containers?.[0]
  if (!container) throw new Error("production Container configuration is missing")
  container.image = image
  delete container.image_build_context

  const deployConfig = path.join(directory, "wrangler.release.json")
  writeFileSync(deployConfig, JSON.stringify(deployConfiguration))
  return deployConfig
}

interface WorkerVersionDetail {
  id: string
  annotations?: Record<string, string>
  resources?: {
    bindings?: Array<{ type?: string; class_name?: string }>
  }
}

function workerVersionDetail(
  target: ProductionTarget,
  repository: string,
  config: string,
  version: string,
): WorkerVersionDetail {
  const detail = parseJson<WorkerVersionDetail>(
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
  if (detail.id !== version)
    throw new Error("Worker version lookup returned the wrong ID")
  return detail
}

function workerVersionTag(
  target: ProductionTarget,
  repository: string,
  config: string,
  version: string,
): string | undefined {
  return workerVersionDetail(target, repository, config, version)
    .annotations?.["workers/tag"]
}

function workerVersionHasCoreExBinding(
  target: ProductionTarget,
  repository: string,
  config: string,
  version: string,
): boolean {
  return workerVersionDetail(target, repository, config, version)
    .resources?.bindings?.some(
      ({ type, class_name: className }) =>
        type === "durable_object_namespace" && className === "CoreExContainer",
    ) === true
}

function verifyReleaseVersion(
  target: ProductionTarget,
  repository: string,
  config: string,
  version: string,
  release: string,
): void {
  if (workerVersionTag(target, repository, config, version) !== release)
    throw new Error("active Worker version is not addressed by the release commit")
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function responseFinding(
  url: URL,
  timeoutMilliseconds: number,
): Promise<{ status?: number; contentType?: string }> {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMilliseconds),
    })
    const finding = {
      status: response.status,
      contentType: response.headers.get("content-type") ?? undefined,
    }
    await response.body?.cancel()
    return finding
  } catch {
    return {}
  }
}

async function observeHealth(target: ProductionTarget): Promise<HealthGateResult> {
  const attempts = target.healthGate.attempts
  if (!Number.isInteger(attempts) || attempts < 1)
    throw new Error("health gate attempts must be a positive integer")
  if (target.healthGate.intervalMilliseconds < 0)
    throw new Error("health gate interval must not be negative")
  const timeout = target.healthGate.requestTimeoutMilliseconds ?? 4500
  const origin = new URL(target.healthOrigin)
  const spaUrl = new URL("/", origin)
  const coreExUrl = new URL("/api/practice-state", origin)
  let spaHealthy = 0
  let coreExHealthy = 0
  let firstCoreExHealthyObservation: number | undefined
  let jointlyHealthy = false
  let unstableAfterHealthy = false
  let finalHealthy = false

  const observationWindowStartedAt = Date.now()
  for (let observation = 1; observation <= attempts; observation += 1) {
    const [spa, coreEx] = await Promise.all([
      responseFinding(spaUrl, timeout),
      responseFinding(coreExUrl, timeout),
    ])
    const spaPassed =
      spa.status === 200 && spa.contentType?.toLowerCase().includes("text/html") === true
    const coreExPassed = coreEx.status === 401
    if (spaPassed) spaHealthy += 1
    if (coreExPassed) {
      coreExHealthy += 1
      firstCoreExHealthyObservation ??= observation
    }
    finalHealthy = spaPassed && coreExPassed
    if (jointlyHealthy && !finalHealthy) unstableAfterHealthy = true
    if (finalHealthy) jointlyHealthy = true
    process.stdout.write(
      `Health observation ${observation}/${attempts}: SPA ${spa.status ?? "unreachable"}; CoreEx ${coreEx.status ?? "unreachable"}\n`,
    )
    if (observation < attempts) {
      const nextObservationAt =
        observationWindowStartedAt +
        observation * target.healthGate.intervalMilliseconds
      await delay(Math.max(0, nextObservationAt - Date.now()))
    }
  }

  return {
    spaHealthy,
    coreExHealthy,
    attempts,
    firstCoreExHealthyObservation,
    passed: jointlyHealthy && finalHealthy && !unstableAfterHealthy,
  }
}

function recoverApplication(
  target: ProductionTarget,
  configuration: WorkerConfiguration,
  repository: string,
  config: string,
  temporaryDirectory: string,
  release: string,
  previousVersion: string,
  previousImage: string,
): RecoveryResult {
  const failures: string[] = []
  let observedVersion = "<unknown>"
  let observedImage = "<unknown>"
  try {
    observedVersion = activeWorkerVersion(target, repository, config)
    observedImage = activeContainerImage(target, repository, config)
  } catch {
    // A transient initial lookup is not a recovery failure when the final
    // verification proves that both captured application states were restored.
  }

  if (observedImage !== previousImage) {
    if (previousImage === "<none>") {
      try {
        const application = activeContainerApplication(
          target,
          repository,
          config,
        )
        if (!application?.id)
          throw new Error("partially created CoreEx Container ID could not be captured")
        wrangler(
          repository,
          config,
          "containers",
          "delete",
          application.id,
        )
      } catch (error) {
        failures.push(
          error instanceof Error
            ? error.message
            : "CoreEx Container removal failed",
        )
      }
    } else {
      try {
        const recoveryConfig = writeDeploymentConfiguration(
          configuration,
          repository,
          previousImage,
          temporaryDirectory,
        )
        wrangler(
          repository,
          recoveryConfig,
          "deploy",
          "--containers-rollout",
          "immediate",
          "--tag",
          `${release}-recovery`,
          "--message",
          `Restore CoreEx image after failed release ${release}`,
        )
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : "CoreEx image recovery failed",
        )
      }
    }
  }

  try {
    const currentVersion = activeWorkerVersion(target, repository, config)
    if (currentVersion !== previousVersion)
      wrangler(
        repository,
        config,
        "rollback",
        previousVersion,
        "--name",
        target.workerName,
        "--message",
        `Recover failed release ${release}`,
        "--yes",
      )
  } catch (error) {
    failures.push(
      error instanceof Error ? error.message : "Worker recovery failed",
    )
  }

  try {
    observedVersion = activeWorkerVersion(target, repository, config)
    observedImage = activeContainerImage(target, repository, config)
  } catch (error) {
    failures.push(
      error instanceof Error ? error.message : "recovery verification failed",
    )
  }
  const succeeded =
    failures.length === 0 &&
    observedVersion === previousVersion &&
    observedImage === previousImage
  const failure = failures[0] ?? (!succeeded
    ? `recovery verification found Worker ${observedVersion} and CoreEx image ${observedImage}`
    : undefined)
  return {
    workerVersion: observedVersion,
    containerImage: observedImage,
    succeeded,
    failure,
  }
}

async function main(): Promise<void> {
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
  if (!target.containerImageName)
    throw new Error("production target containerImageName is required")
  if (!target.healthOrigin || !target.healthGate)
    throw new Error("production target health gate is required")
  if (
    !Number.isInteger(target.healthGate.attempts) ||
    target.healthGate.attempts < 1 ||
    target.healthGate.intervalMilliseconds < 0 ||
    (target.healthGate.requestTimeoutMilliseconds !== undefined &&
      target.healthGate.requestTimeoutMilliseconds < 1)
  )
    throw new Error("production target health gate is invalid")

  const config = path.resolve(repository, target.wranglerConfig)
  const configuration = parseJson<WorkerConfiguration>(
    readFileSync(config, "utf8"),
    "Worker configuration",
  )
  validateSingletonConfiguration(target, configuration)
  const release = run("git", ["rev-parse", "HEAD"], repository)
  try {
    runPreparation(repository, targetPath, dryRun)
  } catch (error) {
    process.stdout.write(
      `\nDeployment record\nStatus: preparation aborted\nRelease: ${release}\nApplication rollout: not started\nDatabase rollback: not attempted\n`,
    )
    throw error
  }

  const manifest = parseJson<MigrationManifest>(
    readFileSync(path.resolve(repository, target.migrationManifest), "utf8"),
    "Migration manifest",
  )
  const activeVersion = activeWorkerVersion(target, repository, config)
  const activeImage = activeContainerImage(target, repository, config)
  const secrets = parseJson<Array<{ name: string }>>(
    wrangler(
      repository,
      config,
      "secret",
      "list",
      "--name",
      target.workerName,
      "--format",
      "json",
    ),
    "Worker secret lookup",
  )
  const secretNames = new Set(secrets.map(({ name }) => name))
  const presentSecrets = requiredWorkerSecrets.filter((name) => secretNames.has(name))

  process.stdout.write(
    `\nProduction deployment summary\nRelease: ${release}\nMode: ${dryRun ? "dry-run" : "deploy"}\nActive Worker version: ${activeVersion}\nActive CoreEx image: ${activeImage}\nIntended image: registry.cloudflare.com/${target.cloudflareAccountId}/${target.containerImageName}:${release} (deployment pins its digest)\nBindings: ${bindingNames(configuration).join(", ") || "<none>"}\nWorker secrets present: ${presentSecrets.join(", ") || "<none>"}\nPostgreSQL migration head: ${manifest.postgres.at(-1)?.id ?? "<none>"}\nD1 migration head: ${manifest.d1.at(-1)?.id ?? "<none>"}\nIntended rollout: immediate, one CoreEx instance\n`,
  )

  if (
    activeImage === "<none>" &&
    !workerVersionHasCoreExBinding(target, repository, config, activeVersion)
  )
    throw new Error(
      "production has no rollback-compatible CoreEx application; run npm run production:prime first",
    )

  if (dryRun) {
    process.stdout.write(
      "Database mutations: none\nApplication mutations: none\n",
    )
    return
  }

  const startedAt = new Date().toISOString()
  const temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), "acn-fde-production-release-"),
  )
  let newVersion = "<unknown>"
  let newImage = "<unknown>"
  let deploymentRecordWritten = false
  let rolloutCompleted = false
  try {
    const immutableImage = buildImmutableImage(
      target,
      configuration,
      repository,
      config,
      release,
    )
    const deployConfig = writeDeploymentConfiguration(
      configuration,
      repository,
      immutableImage,
      temporaryDirectory,
    )

    const currentVersion = activeWorkerVersion(target, repository, config)
    if (currentVersion !== activeVersion)
      throw new Error(
        `active Worker changed before rollout (${activeVersion} -> ${currentVersion})`,
      )

    try {
      wrangler(
        repository,
        deployConfig,
        "deploy",
        "--strict",
        "--containers-rollout",
        "immediate",
        "--tag",
        release,
        "--message",
        `Release ${release}`,
      )

      newVersion = activeWorkerVersion(target, repository, config)
      newImage = activeContainerImage(target, repository, config)
      verifyReleaseVersion(target, repository, config, newVersion, release)
      if (newImage !== immutableImage)
        throw new Error(
          `active CoreEx image does not match the immutable release image (${immutableImage} -> ${newImage})`,
        )
    } catch (error) {
      const recovery = recoverApplication(
        target,
        configuration,
        repository,
        config,
        temporaryDirectory,
        release,
        activeVersion,
        activeImage,
      )
      const finishedAt = new Date().toISOString()
      process.stdout.write(
        `\nDeployment record\nStatus: rollout failed; recovery ${recovery.succeeded ? "succeeded" : "failed"}\nStarted: ${startedAt}\nFinished: ${finishedAt}\nRelease: ${release}\nPrevious Worker version: ${activeVersion}\nRestored Worker version: ${recovery.workerVersion}\nPrevious CoreEx image: ${activeImage}\nRestored CoreEx image: ${recovery.containerImage}\nDatabase rollback: not attempted\n${recovery.failure ? `Recovery failure: ${recovery.failure}\n` : ""}`,
      )
      deploymentRecordWritten = true
      const cause = error instanceof Error ? error.message : "application rollout failed"
      throw new Error(
        `application rollout failed (${cause}); recovery ${recovery.succeeded ? "succeeded" : "failed"}`,
      )
    }

    rolloutCompleted = true
    const health = await observeHealth(target)
    const finishedAt = new Date().toISOString()
    process.stdout.write(
      `\nDeployment record\nStatus: ${health.passed ? "succeeded" : "health gate failed"}\nStarted: ${startedAt}\nFinished: ${finishedAt}\nRelease: ${release}\nPrevious Worker version: ${activeVersion}\nNew Worker version: ${newVersion}\nPrevious CoreEx image: ${activeImage}\nNew CoreEx image: ${newImage}\nPostgreSQL migration head: ${manifest.postgres.at(-1)?.id ?? "<none>"}\nD1 migration head: ${manifest.d1.at(-1)?.id ?? "<none>"}\nSPA observations: ${health.spaHealthy}/${health.attempts} healthy\nCoreEx live observations: ${health.coreExHealthy}/${health.attempts} healthy (HTTP 401)\nStartup finding: ${health.firstCoreExHealthyObservation ? `CoreEx first answered at observation ${health.firstCoreExHealthyObservation}` : "CoreEx did not answer"}\nReadiness finding: not probed; production health routes are private\n`,
    )
    deploymentRecordWritten = true
    if (!health.passed)
      throw new Error(
        "post-deploy health gate failed; the completed release remains active",
      )
  } catch (error) {
    if (!deploymentRecordWritten) {
      const finishedAt = new Date().toISOString()
      process.stdout.write(
        `\nDeployment record\nStatus: ${rolloutCompleted ? "completed rollout validation failed; release remains active" : "aborted before application rollout"}\nStarted: ${startedAt}\nFinished: ${finishedAt}\nRelease: ${release}\nPrevious Worker version: ${activeVersion}\nPrevious CoreEx image: ${activeImage}\nDatabase rollback: not attempted\n`,
      )
    }
    throw error
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : "production deployment failed"
  process.stderr.write(`error: ${message}\n`)
  process.exitCode = 1
}
