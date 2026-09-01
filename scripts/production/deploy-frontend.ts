import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

interface ProductionTarget {
  branch: string
  cloudflareAccountId: string
  workerName: string
  containerApplicationName: string
  wranglerConfig: string
  tools: {
    node: string
    wrangler: string
  }
}

interface WorkerConfiguration {
  name?: string
  assets?: {
    binding?: string
    directory?: string
  }
  containers?: Array<{
    name?: string
  }>
}

interface ContainerApplication {
  id?: string
  name: string
  image?: string
  configuration?: {
    image?: string
  }
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

function run(
  command: string,
  args: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: environment,
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

function containerApplicationImage(
  application: ContainerApplication,
): string | undefined {
  return application.image ?? application.configuration?.image
}

function activeContainerImage(
  target: ProductionTarget,
  repository: string,
  config: string,
): string {
  const applications = parseJson<ContainerApplication[]>(
    wrangler(repository, config, "containers", "list", "--json"),
    "Container application lookup",
  )
  const application = applications.find(
    ({ name }) => name === target.containerApplicationName,
  )
  if (!application?.id)
    throw new Error(
      `CoreEx Container application ${target.containerApplicationName} was not found`,
    )
  const detail = parseJson<ContainerApplication>(
    wrangler(
      repository,
      config,
      "containers",
      "info",
      application.id,
      "--json",
    ),
    "Container application detail lookup",
  )
  if (detail.id !== application.id || detail.name !== application.name)
    throw new Error("Container application detail lookup returned the wrong application")
  const image =
    containerApplicationImage(detail) ?? containerApplicationImage(application)
  if (!image) throw new Error("active CoreEx Container image could not be captured")
  return image
}

function validateConfiguration(
  target: ProductionTarget,
  configuration: WorkerConfiguration,
): void {
  if (configuration.name !== target.workerName)
    throw new Error(`Worker configuration must target ${target.workerName}`)
  if (!configuration.assets?.directory || !configuration.assets.binding)
    throw new Error("Worker configuration must define bound static assets")
  if (
    configuration.containers?.length !== 1 ||
    configuration.containers[0]?.name !== target.containerApplicationName
  )
    throw new Error(
      `Worker configuration must define only ${target.containerApplicationName}`,
    )
}

export function frontendDeployArguments(
  release: string,
  dryRun: boolean,
): string[] {
  return [
    "deploy",
    ...(dryRun ? ["--dry-run"] : []),
    "--strict",
    "--containers-rollout",
    "none",
    ...(dryRun
      ? []
      : [
          "--tag",
          `frontend-${release}`,
          "--message",
          `Frontend release ${release}`,
        ]),
  ]
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
  const config = path.resolve(repository, target.wranglerConfig)
  const configuration = parseJson<WorkerConfiguration>(
    readFileSync(config, "utf8"),
    "Worker configuration",
  )
  validateConfiguration(target, configuration)

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
  const wranglerVersion = run(
    "npx",
    ["--no-install", "wrangler", "--version"],
    repository,
  )
  if (wranglerVersion !== target.tools.wrangler)
    throw new Error(`Wrangler ${target.tools.wrangler} is required`)
  const whoami = wrangler(repository, config, "whoami")
  if (!whoami.split(/\s+/).includes(target.cloudflareAccountId))
    throw new Error(`Cloudflare account must be ${target.cloudflareAccountId}`)

  const previousVersion = activeWorkerVersion(target, repository, config)
  const previousImage = activeContainerImage(target, repository, config)

  run("npm", ["run", "build"], repository, {
    ...process.env,
    ACN_FDE_ACCOUNT_MODE: "true",
    ACN_FDE_FULL_STACK: "false",
    ACN_FDE_INTEGRATION: "false",
  })
  wrangler(
    repository,
    config,
    ...frontendDeployArguments(release, true),
  )

  process.stdout.write(
    `Frontend deployment target: ${target.branch} at ${release}\nPrevious Worker version: ${previousVersion}\nCoreEx image: ${previousImage}\nProduction account assets: built and validated\nContainer rollout: none\n`,
  )

  if (dryRun) {
    process.stdout.write("Worker and Container mutations: none\n")
    return
  }

  const currentVersion = activeWorkerVersion(target, repository, config)
  if (currentVersion !== previousVersion)
    throw new Error(
      `active Worker changed before frontend deployment (${previousVersion} -> ${currentVersion})`,
    )

  wrangler(
    repository,
    config,
    ...frontendDeployArguments(release, false),
  )

  const newVersion = activeWorkerVersion(target, repository, config)
  const newImage = activeContainerImage(target, repository, config)
  if (newVersion === previousVersion)
    throw new Error("frontend deployment did not activate a new Worker version")
  if (newImage !== previousImage)
    throw new Error(
      `CoreEx image changed during frontend deployment (${previousImage} -> ${newImage})`,
    )

  process.stdout.write(
    `\nFrontend deployment record\nStatus: succeeded\nRelease: ${release}\nPrevious Worker version: ${previousVersion}\nNew Worker version: ${newVersion}\nCoreEx image: ${newImage} (unchanged)\nDatabase migrations: not run\nContainer rollout: none\n`,
  )
}

const invokedPath = process.argv[1]
if (
  invokedPath &&
  path.resolve(invokedPath) === path.resolve(fileURLToPath(import.meta.url))
) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  })
}
