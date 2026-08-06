import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { afterEach, describe, expect, it } from "vitest"

const repositoryRoot = path.resolve(import.meta.dirname, "../..")
const temporaryDirectories: string[] = []

interface SecretPut {
  args: string[]
  value: string
}

function createFakeNpx(directory: string): void {
  const executable = path.join(directory, "npx")
  writeFileSync(
    executable,
    `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const recordPath = process.env.BOOTSTRAP_RECORD
if (!recordPath) throw new Error("BOOTSTRAP_RECORD is required")
const args = process.argv.slice(2)
const records = existsSync(recordPath)
  ? JSON.parse(readFileSync(recordPath, "utf8"))
  : []

if (args[0] !== "wrangler" || args[1] !== "secret") process.exit(64)
if (args[2] === "list") {
  process.stdout.write(JSON.stringify(records.map(({ name }) => ({ name, type: "secret_text" }))))
  process.exit(0)
}
if (args[2] !== "put") process.exit(64)

let value = ""
for await (const chunk of process.stdin) value += chunk
records.push({ name: args[3], args, value })
writeFileSync(recordPath, JSON.stringify(records))
`,
    { mode: 0o755 },
  )
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe("production:bootstrap", () => {
  it("installs all four Worker secrets without exposing their values", () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), "acn-fde-production-bootstrap-"),
    )
    temporaryDirectories.push(temporaryDirectory)
    const recordPath = path.join(temporaryDirectory, "secrets.json")
    createFakeNpx(temporaryDirectory)

    const values = {
      githubClientId: "github-production-client-id",
      githubClientSecret: "github-production-client-secret",
      betterAuthSecret: "better-auth-secret-with-at-least-32-characters",
      postgresConnection:
        "Host=ep-example-pooler.us-east-1.aws.neon.tech;Database=neondb;Username=neondb_owner;Password=postgres-secret;Maximum Pool Size=10;Minimum Pool Size=0;Connection Idle Lifetime=240;Timeout=15;Keepalive=0;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable;No Reset On Close=true",
    }
    const result = spawnSync("npm", ["run", "production:bootstrap"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        BOOTSTRAP_RECORD: recordPath,
        PATH: `${temporaryDirectory}:${process.env.PATH ?? ""}`,
      },
      input: `y\n${values.githubClientId}\n${values.githubClientSecret}\n${values.betterAuthSecret}\n${values.postgresConnection}\n`,
    })

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    const records = JSON.parse(readFileSync(recordPath, "utf8")) as Array<
      SecretPut & { name: string }
    >
    expect(records.map(({ name }) => name)).toEqual([
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "BETTER_AUTH_SECRET",
      "POSTGRES_CONNECTION_STRING",
    ])
    expect(records.map(({ value }) => value)).toEqual(Object.values(values))

    const visibleText = `${result.stdout}\n${result.stderr}\n${records
      .flatMap(({ args }) => args)
      .join("\n")}`
    for (const value of Object.values(values)) expect(visibleText).not.toContain(value)
  })

  it("resumes by installing only missing Worker secrets", () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), "acn-fde-production-bootstrap-resume-"),
    )
    temporaryDirectories.push(temporaryDirectory)
    const recordPath = path.join(temporaryDirectory, "secrets.json")
    createFakeNpx(temporaryDirectory)
    writeFileSync(
      recordPath,
      JSON.stringify([
        { name: "GITHUB_CLIENT_ID", args: [], value: "already-installed" },
        { name: "GITHUB_CLIENT_SECRET", args: [], value: "already-installed" },
      ]),
    )

    const betterAuthSecret = "replacement-is-not-needed-on-a-resumed-bootstrap"
    const postgresConnection =
      "Host=ep-example-pooler.us-east-1.aws.neon.tech;Database=neondb;Username=neondb_owner;Password=postgres-secret;Maximum Pool Size=10;Minimum Pool Size=0;Connection Idle Lifetime=240;Timeout=15;Keepalive=0;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable;No Reset On Close=true"
    const result = spawnSync("npm", ["run", "production:bootstrap"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        BOOTSTRAP_RECORD: recordPath,
        PATH: `${temporaryDirectory}:${process.env.PATH ?? ""}`,
      },
      input: `y\n${betterAuthSecret}\n${postgresConnection}\n`,
    })

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    const records = JSON.parse(readFileSync(recordPath, "utf8")) as Array<
      SecretPut & { name: string }
    >
    expect(records.map(({ name }) => name)).toEqual([
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "BETTER_AUTH_SECRET",
      "POSTGRES_CONNECTION_STRING",
    ])
    expect(records.slice(2).map(({ value }) => value)).toEqual([
      betterAuthSecret,
      postgresConnection,
    ])
    expect(result.stdout).toContain("already configured: GITHUB_CLIENT_ID")
    expect(result.stdout).toContain("already configured: GITHUB_CLIENT_SECRET")
  })

  it("rejects unsafe secret values before changing the Worker", () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), "acn-fde-production-bootstrap-validation-"),
    )
    temporaryDirectories.push(temporaryDirectory)
    const recordPath = path.join(temporaryDirectory, "secrets.json")
    createFakeNpx(temporaryDirectory)
    writeFileSync(recordPath, "[]")

    const shortSecret = "too-short"
    const unsafeConnection =
      "Host=ep-example-pooler.us-east-1.aws.neon.tech;Database=neondb;Username=owner;Password=must-not-appear;Maximum Pool Size=10;Minimum Pool Size=0;Connection Idle Lifetime=240;Timeout=15;Keepalive=0;SSL Mode=VerifyFull;Channel Binding=Require;GSS Encryption Mode=Disable;No Reset On Close=true;SSL Mode=Disable"
    const result = spawnSync("npm", ["run", "production:bootstrap"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        BOOTSTRAP_RECORD: recordPath,
        PATH: `${temporaryDirectory}:${process.env.PATH ?? ""}`,
      },
      input: `y\nclient-id\nclient-secret\n${shortSecret}\n${unsafeConnection}\n`,
    })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("BETTER_AUTH_SECRET must contain at least 32 characters")
    expect(result.stderr).toContain(
      "POSTGRES_CONNECTION_STRING must use the pooled endpoint and required Npgsql settings",
    )
    expect(result.stdout).not.toContain(shortSecret)
    expect(result.stderr).not.toContain(shortSecret)
    expect(result.stdout).not.toContain(unsafeConnection)
    expect(result.stderr).not.toContain(unsafeConnection)
    expect(readFileSync(recordPath, "utf8")).toBe("[]")
  })
})
