import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

interface ProductionWorkerConfiguration {
  assets: {
    run_worker_first: string[]
  }
  containers?: Array<{
    name?: string
    class_name: string
    image: string
    image_build_context?: string
    max_instances?: number
    instance_type?: string
    constraints?: { regions?: string[] }
  }>
  durable_objects?: {
    bindings: Array<{ name: string; class_name: string }>
  }
  migrations?: Array<{ tag: string; new_sqlite_classes?: string[] }>
}

function readProductionConfiguration(): ProductionWorkerConfiguration {
  return JSON.parse(readFileSync("wrangler.jsonc", "utf8")) as ProductionWorkerConfiguration
}

describe("production CoreEx Container configuration", () => {
  it("routes the API and health surface to one basic ENAM instance", () => {
    const configuration = readProductionConfiguration()

    expect(configuration.assets.run_worker_first).toEqual([
      "/api",
      "/api/*",
      "/health",
      "/health/*",
    ])
    expect(configuration.containers).toEqual([{
      name: "coreex",
      class_name: "CoreExContainer",
      image: "./backend/Dockerfile",
      image_build_context: ".",
      max_instances: 1,
      instance_type: "basic",
      constraints: { regions: ["ENAM"] },
    }])
    expect(configuration.durable_objects).toEqual({
      bindings: [{ name: "COREEX", class_name: "CoreExContainer" }],
    })
    expect(configuration.migrations).toEqual([{
      tag: "v1",
      new_sqlite_classes: ["CoreExContainer"],
    }])
  })

  it("keeps production lifecycle and telemetry independent of local Aspire", () => {
    const container = readFileSync("worker/coreex-container.ts", "utf8")

    expect(container).toContain('defaultPort = 8080')
    expect(container).toContain('sleepAfter = "5m"')
    expect(container).toContain('enableInternet = true')
    expect(container).toContain('ConnectionStrings__Postgres: env.POSTGRES_CONNECTION_STRING')
    expect(container).toContain('OTEL_SDK_DISABLED: "true"')
    expect(container).not.toContain("OTEL_EXPORTER_OTLP_ENDPOINT")
  })

  it("builds a framework-dependent Linux AMD64 service on port 8080", () => {
    const dockerfile = readFileSync("backend/Dockerfile", "utf8")

    expect(dockerfile).toContain("mcr.microsoft.com/dotnet/sdk:10.0")
    expect(dockerfile).toContain("mcr.microsoft.com/dotnet/aspnet:10.0")
    expect(dockerfile).toContain("--runtime linux-x64")
    expect(dockerfile).toContain("--self-contained false")
    expect(dockerfile).toContain("/p:UseAppHost=false")
    expect(dockerfile).toContain("ASPNETCORE_HTTP_PORTS=8080")
    expect(dockerfile).toContain("OTEL_SDK_DISABLED=true")
    expect(dockerfile).toContain("USER $APP_UID")
    expect(dockerfile).toContain("EXPOSE 8080")
    expect(dockerfile).toContain(
      "ENTRYPOINT [\"dotnet\", \"Acn.Fde.Practice.Api.dll\"]",
    )
  })
})
