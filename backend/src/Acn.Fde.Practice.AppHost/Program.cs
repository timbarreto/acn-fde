using Aspire.Hosting.JavaScript;

var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder
    .AddPostgres("postgres-server")
    .WithImageTag("18.4")
    .WithDataVolume("acn-fde-postgres-data");

var practiceDatabase = postgres.AddDatabase("Postgres", "acn_fde_practice");

var migrations = builder
    .AddProject<Projects.Acn_Fde_Practice_Database>("migrations")
    .WithReference(practiceDatabase)
    .WaitFor(practiceDatabase)
    .WithArgs("Migrate");

var coreEx = builder
    .AddProject<Projects.Acn_Fde_Practice_Api>("coreex")
    .WithReference(practiceDatabase)
    .WaitForCompletion(migrations)
    .WithHttpEndpoint(port: 5080, name: "http")
    .WithHttpHealthCheck("/health/live");

var repositoryRoot = Path.GetFullPath(
    Path.Combine(builder.AppHostDirectory, "../../.."));
var viteExecutable = Path.Combine(repositoryRoot, "node_modules/.bin/vite");

if (!File.Exists(viteExecutable))
{
    throw new InvalidOperationException(
        "Frontend dependencies are missing. Run npm ci before npm run dev:full.");
}

var app = builder
    .AddViteApp("app", repositoryRoot)
    .WithNpm(install: false)
    .WithEnvironment("ACN_FDE_FULL_STACK", "true")
    .WithHttpEndpoint(port: 5173, name: "http")
    .WithHttpHealthCheck("/")
    .WaitFor(coreEx);

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
