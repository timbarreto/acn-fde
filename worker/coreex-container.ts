import { Container } from "@cloudflare/containers"

/** Runs the singleton CoreEx API process behind the production Worker. */
export class CoreExContainer extends Container<Cloudflare.Env> {
  defaultPort = 8080
  sleepAfter = "5m"
  enableInternet = true

  constructor(
    ctx: ConstructorParameters<typeof Container>[0],
    env: Cloudflare.Env,
  ) {
    super(ctx, env)
    this.envVars = {
      ASPNETCORE_HTTP_PORTS: "8080",
      ASPNETCORE_ENVIRONMENT: "Production",
      ConnectionStrings__Postgres: env.POSTGRES_CONNECTION_STRING,
      OTEL_SDK_DISABLED: "true",
    }
  }

  override onStart(): void {
    console.log(JSON.stringify({ event: "coreex.container.started" }))
  }

  override onStop(): void {
    console.log(JSON.stringify({ event: "coreex.container.stopped" }))
  }

  override onError(error: unknown): never {
    console.error(JSON.stringify({
      event: "coreex.container.failed",
      error: error instanceof Error ? error.message : String(error),
    }))
    throw error
  }
}
