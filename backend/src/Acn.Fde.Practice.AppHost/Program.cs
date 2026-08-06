using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.JavaScript;
using Microsoft.Extensions.Hosting;

var builder = DistributedApplication.CreateBuilder(args);
var integration = builder.Environment.IsEnvironment("Integration");
var containerProfile = builder.Environment.IsEnvironment("Container");
var isolated = integration || containerProfile;
const string isolatedTokenIssuer = "https://acn-fde-full-stack.invalid";
var repositoryRoot = Path.GetFullPath(
    Path.Combine(builder.AppHostDirectory, "../../.."));
var viteExecutable = Path.Combine(repositoryRoot, "node_modules/.bin/vite");
var wranglerExecutable = Path.Combine(repositoryRoot, "node_modules/.bin/wrangler");
var isolatedPostgresDataPath = isolated
    ? builder.Configuration["Integration:PostgresDataPath"]
        ?? throw new InvalidOperationException(
            "Integration:PostgresDataPath is required for an isolated stack.")
    : null;

var postgres = builder
    .AddPostgres("postgres-server")
    .WithImageTag("18.4");

if (isolatedPostgresDataPath is not null)
    postgres.WithBindMount(isolatedPostgresDataPath, "/var/lib/postgresql");
else
    postgres.WithDataVolume("acn-fde-postgres-data");

var practiceDatabase = postgres.AddDatabase("Postgres", "acn_fde_practice");

var migrations = builder
    .AddProject<Projects.Acn_Fde_Practice_Database>("migrations")
    .WithReference(practiceDatabase)
    .WaitFor(practiceDatabase)
    .WithArgs("Migrate");

IResourceBuilder<IResourceWithEndpoints> coreEx;
IResourceBuilder<ContainerResource>? coreExContainer = null;
IResourceBuilder<ProjectResource>? coreExProject = null;
if (containerProfile)
{
    coreExContainer = builder
        .AddDockerfile(
            "coreex",
            repositoryRoot,
            "backend/Dockerfile",
            stage: "runtime")
        .WithReference(practiceDatabase)
        .WithEnvironment(
            "ConnectionStrings__Postgres",
            LocalPostgresConnectionString(practiceDatabase.Resource))
        .WaitForCompletion(migrations)
        .WithHttpEndpoint(targetPort: 8080, name: "http")
        .WithHttpHealthCheck("/health/ready")
        .WithOtlpExporter()
        .WithEnvironment("OTEL_SDK_DISABLED", "false")
        .WithContainerRuntimeArgs("--memory", "1g");
    coreEx = coreExContainer;
}
else
{
    coreExProject = builder
        .AddProject<Projects.Acn_Fde_Practice_Api>("coreex")
        .WithReference(practiceDatabase)
        .WithEnvironment(
            "ConnectionStrings__Postgres",
            LocalPostgresConnectionString(practiceDatabase.Resource))
        .WaitForCompletion(migrations);

    if (integration)
        coreExProject.WithHttpEndpoint(name: "http");
    else
        coreExProject.WithHttpEndpoint(port: 5080, name: "http");

    coreExProject.WithHttpHealthCheck("/health/ready");
    coreEx = coreExProject;
}

if (!File.Exists(viteExecutable) || !File.Exists(wranglerExecutable))
{
    throw new InvalidOperationException(
        "Frontend dependencies are missing. Run npm ci before npm run dev:full.");
}

var workerConfigPath = Path.Combine(
    repositoryRoot,
    isolated ? "wrangler.integration.jsonc" : "wrangler.local.jsonc");
var workerStatePath = isolated
    ? builder.Configuration["Integration:WorkerStatePath"]
        ?? throw new InvalidOperationException(
            "Integration:WorkerStatePath is required for the integration stack.")
    : Path.Combine(repositoryRoot, ".wrangler/state");

var identityMigrations = builder
    .AddExecutable(
        "identity-migrations",
        wranglerExecutable,
        repositoryRoot,
        "d1",
        "migrations",
        "apply",
        "AUTH_DB",
        "--local",
        "--config",
        workerConfigPath,
        "--persist-to",
        workerStatePath)
    .WithEnvironment("CI", "true");

var app = builder
    .AddViteApp("app", repositoryRoot)
    .WithNpm(install: false)
    .WithEnvironment("ACN_FDE_FULL_STACK", "true")
    .WithEnvironment("ACN_FDE_WORKER_CONFIG", workerConfigPath)
    .WithEnvironment("ACN_FDE_WORKER_STATE", workerStatePath)
    .WaitFor(coreEx)
    .WaitForCompletion(identityMigrations);

if (isolated)
{
    app.WithHttpEndpoint(name: "http")
        .WithArgs("--host", "0.0.0.0")
        .WithEnvironment("ACN_FDE_INTEGRATION", "true")
        .WithEnvironment("COREEX_API_ORIGIN", coreEx.GetEndpoint("http"))
        .WithEnvironment("BETTER_AUTH_URL", app.GetEndpoint("http"))
        .WithEnvironment("AUTH_TOKEN_ISSUER", isolatedTokenIssuer)
        .WithEnvironment("AUTH_TOKEN_AUDIENCE", "acn-fde-practice-api")
        .WithEnvironment("GITHUB_CLIENT_ID", "full-stack-test-github-client")
        .WithEnvironment("GITHUB_CLIENT_SECRET", "full-stack-test-github-secret")
        .WithEnvironment(
            "BETTER_AUTH_SECRET",
            "full-stack-test-secret-is-not-a-credential");

    if (coreExContainer is not null)
        ConfigureCoreExIdentity(
            coreExContainer,
            app.GetEndpoint(
                "http",
                KnownNetworkIdentifiers.DefaultAspireContainerNetwork),
            isolatedTokenIssuer);
    else
        ConfigureCoreExIdentity(
            coreExProject!,
            app.GetEndpoint("http"),
            isolatedTokenIssuer);
}
else
{
    app.WithHttpEndpoint(port: 5173, name: "http");
}

app.WithHttpHealthCheck("/health/ready");

// Aspire's Vite resource normally starts through `npm run`. Launch the pinned
// binary directly so stopping AppHost signals Vite/workerd without a wrapper.
foreach (var annotation in app.Resource.Annotations
    .OfType<JavaScriptRunScriptAnnotation>()
    .ToArray())
{
    app.Resource.Annotations.Remove(annotation);
}

// Keep npm metadata for Aspire's installer resource, but remove its argument
// separator now that Vite is the executable instead of an npm script.
app.WithAnnotation(new JavaScriptPackageManagerAnnotation("npm", "run")
{
    CommandSeparator = null,
});

app.WithCommand(viteExecutable);
builder.OnBeforeStart((_, _) =>
{
    app.WithCommand(viteExecutable);
    return Task.CompletedTask;
});

builder.Build().Run();

static ReferenceExpression LocalPostgresConnectionString(
    IResourceWithConnectionString database) =>
    ReferenceExpression.Create(
        $"{database.ConnectionStringExpression};Maximum Pool Size=10;Minimum Pool Size=0;Connection Idle Lifetime=240;Timeout=15;Keepalive=0;GSS Encryption Mode=Disable");

static void ConfigureCoreExIdentity<T>(
    IResourceBuilder<T> coreEx,
    EndpointReference appEndpoint,
    string tokenIssuer)
    where T : IResourceWithEnvironment
{
    var jwksUri = ReferenceExpression.Create($"{appEndpoint}/api/auth/jwks");

    coreEx
        .WithEnvironment("IdentityToken__Issuer", tokenIssuer)
        .WithEnvironment("IdentityToken__Audience", "acn-fde-practice-api")
        .WithEnvironment("IdentityToken__JwksUri", jwksUri)
        .WithEnvironment("IdentityToken__RequireHttps", "false");
}
