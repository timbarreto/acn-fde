using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using AwesomeAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace Acn.Fde.Practice.IntegrationTests;

public sealed class AppHostConfigurationTests
{
    [Test]
    public async Task Development_configuration_wires_named_auth_secrets_and_the_local_identity_contract_Async()
    {
        var appHost = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.Acn_Fde_Practice_AppHost>(
                [
                    "--environment=Development",
                    "--Parameters:github-client-id=development-client",
                    "--Parameters:github-client-secret=development-client-secret",
                    "--Parameters:better-auth-secret=development-better-auth-secret-32",
                ]);

        var frontend = appHost.Resources.Single(resource => resource.Name == "app");
        var executionConfiguration = await ExecutionConfigurationBuilder
            .Create(frontend)
            .WithEnvironmentVariablesConfig()
            .BuildAsync(
                new DistributedApplicationExecutionContext(
                    DistributedApplicationOperation.Publish),
                NullLogger.Instance,
                CancellationToken.None);

        executionConfiguration.Exception.Should().BeNull();
        var environment = executionConfiguration.EnvironmentVariables
            .ToDictionary(variable => variable.Key, variable => variable.Value);
        environment["GITHUB_CLIENT_ID"].Should().Be("{github-client-id.value}");
        environment["GITHUB_CLIENT_SECRET"].Should().Be("{github-client-secret.value}");
        environment["BETTER_AUTH_SECRET"].Should().Be("{better-auth-secret.value}");
        environment.Should().NotContainKey("CLOUDFLARE_INCLUDE_PROCESS_ENV");

        var authParameters = appHost.Resources.OfType<ParameterResource>()
            .Where(parameter => parameter.Name is
                "github-client-id" or "github-client-secret" or "better-auth-secret")
            .ToArray();
        authParameters.Should().HaveCount(3);
        authParameters.Should().OnlyContain(parameter => parameter.Secret);

        var coreEx = appHost.Resources.Single(resource => resource.Name == "coreex");
        var coreExExecution = await ExecutionConfigurationBuilder
            .Create(coreEx)
            .WithEnvironmentVariablesConfig()
            .BuildAsync(
                new DistributedApplicationExecutionContext(
                    DistributedApplicationOperation.Publish),
                NullLogger.Instance,
                CancellationToken.None);
        coreExExecution.Exception.Should().BeNull();
        var coreExEnvironment = coreExExecution.EnvironmentVariables
            .ToDictionary(variable => variable.Key, variable => variable.Value);
        coreExEnvironment["IdentityToken__Issuer"]
            .Should().Be("http://localhost:5173");
        coreExEnvironment["IdentityToken__JwksUri"]
            .Should().Be("{app.bindings.http.url}/api/auth/jwks");
        coreExEnvironment["IdentityToken__RequireHttps"].Should().Be("false");
    }

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
