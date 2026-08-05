using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using AwesomeAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace Acn.Fde.Practice.IntegrationTests;

public sealed class AppHostConfigurationTests
{
    [Test]
    public async Task Container_profile_wires_the_production_image_database_telemetry_and_memory_limit_Async()
    {
        var workerState = Path.Combine(
            Path.GetTempPath(),
            "acn-fde-container-configuration");
        var appHost = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.Acn_Fde_Practice_AppHost>(
                [
                    "--environment=Container",
                    $"--Integration:WorkerStatePath={workerState}",
                    $"--Integration:PostgresDataPath={workerState}-postgres",
                ]);

        var frontend = appHost.Resources.Single(resource => resource.Name == "app");
        frontend.Annotations.OfType<EndpointAnnotation>()
            .Single(endpoint => endpoint.Name == "http");

        var coreEx = appHost.Resources.Single(resource => resource.Name == "coreex");
        coreEx.Should().BeOfType<ContainerResource>();
        coreEx.HasAnnotationOfType<OtlpExporterAnnotation>().Should().BeTrue();
        coreEx.Annotations.OfType<EndpointAnnotation>()
            .Single(endpoint => endpoint.Name == "http")
            .TargetPort.Should().Be(8080);

        var executionConfiguration = await ExecutionConfigurationBuilder
            .Create(coreEx)
            .WithEnvironmentVariablesConfig()
            .BuildAsync(
                new DistributedApplicationExecutionContext(
                    DistributedApplicationOperation.Publish),
                NullLogger.Instance,
                CancellationToken.None);
        executionConfiguration.Exception.Should().BeNull();
        var environment = executionConfiguration.EnvironmentVariables
            .ToDictionary(variable => variable.Key, variable => variable.Value);
        environment.Should().ContainKey("ConnectionStrings__Postgres");
        environment["OTEL_SDK_DISABLED"].Should().Be("false");
        environment["IdentityToken__Issuer"]
            .Should().Be("https://acn-fde-full-stack.invalid");
        environment["IdentityToken__JwksUri"]
            .Should().Be("{app.bindings.http.url}/api/auth/jwks");
        environment["IdentityToken__RequireHttps"].Should().Be("false");

        var runtimeArgs = new List<object>();
        var runtimeArgsAnnotation = coreEx.Annotations
            .OfType<ContainerRuntimeArgsCallbackAnnotation>()
            .Single();
        await runtimeArgsAnnotation.Callback(new(runtimeArgs, CancellationToken.None));
        runtimeArgs.Select(value => value.ToString()).Should().Equal("--memory", "1g");
    }

    [Test]
    public async Task Container_runtime_is_Podman_Async()
    {
        var workerState = Path.Combine(
            Path.GetTempPath(),
            "acn-fde-apphost-configuration");
        var appHost = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.Acn_Fde_Practice_AppHost>(
                [
                    "--environment=Integration",
                    $"--Integration:WorkerStatePath={workerState}",
                    $"--Integration:PostgresDataPath={workerState}-postgres",
                ]);

        appHost.Configuration["DcpPublisher:ContainerRuntime"].Should().Be("podman");
    }
}
