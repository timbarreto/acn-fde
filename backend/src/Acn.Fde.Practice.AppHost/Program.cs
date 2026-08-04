using Aspire.Hosting.JavaScript;
using Microsoft.Extensions.Hosting;

var builder = DistributedApplication.CreateBuilder(args);
var integration = builder.Environment.IsEnvironment("Integration");
var repositoryRoot = Path.GetFullPath(
    Path.Combine(builder.AppHostDirectory, "../../.."));
var viteExecutable = Path.Combine(repositoryRoot, "node_modules/.bin/vite");
var wranglerExecutable = Path.Combine(repositoryRoot, "node_modules/.bin/wrangler");

var postgres = builder
    .AddPostgres("postgres-server")
    .WithImageTag("18.4");

if (!integration)
    postgres.WithDataVolume("acn-fde-postgres-data");

var practiceDatabase = postgres.AddDatabase("Postgres", "acn_fde_practice");

var migrations = builder
    .AddProject<Projects.Acn_Fde_Practice_Database>("migrations")
    .WithReference(practiceDatabase)
    .WaitFor(practiceDatabase)
    .WithArgs("Migrate");

var coreEx = builder
    .AddProject<Projects.Acn_Fde_Practice_Api>("coreex")
    .WithReference(practiceDatabase)
    .WaitForCompletion(migrations);

if (integration)
    coreEx.WithHttpEndpoint(name: "http");
else
    coreEx.WithHttpEndpoint(port: 5080, name: "http");

coreEx.WithHttpHealthCheck("/health/ready");

if (!File.Exists(viteExecutable) || !File.Exists(wranglerExecutable))
{
    throw new InvalidOperationException(
        "Frontend dependencies are missing. Run npm ci before npm run dev:full.");
}

var workerConfigPath = Path.Combine(
    repositoryRoot,
    integration ? "wrangler.integration.jsonc" : "wrangler.local.jsonc");
var workerStatePath = integration
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

if (integration)
{
    app.WithHttpEndpoint(name: "http")
        .WithEnvironment("ACN_FDE_INTEGRATION", "true")
        .WithEnvironment("COREEX_API_ORIGIN", coreEx.GetEndpoint("http"))
        .WithEnvironment("BETTER_AUTH_URL", app.GetEndpoint("http"))
        .WithEnvironment("AUTH_TOKEN_ISSUER", app.GetEndpoint("http"))
        .WithEnvironment("AUTH_TOKEN_AUDIENCE", "acn-fde-practice-api")
        .WithEnvironment("GITHUB_CLIENT_ID", "full-stack-test-github-client")
        .WithEnvironment("GITHUB_CLIENT_SECRET", "full-stack-test-github-secret")
        .WithEnvironment(
            "BETTER_AUTH_SECRET",
            "full-stack-test-secret-is-not-a-credential");

    coreEx
        .WithEnvironment("IdentityToken__Issuer", app.GetEndpoint("http"))
        .WithEnvironment("IdentityToken__Audience", "acn-fde-practice-api")
        .WithEnvironment(
            "IdentityToken__JwksUri",
            ReferenceExpression.Create($"{app.GetEndpoint("http")}/api/auth/jwks"));
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
