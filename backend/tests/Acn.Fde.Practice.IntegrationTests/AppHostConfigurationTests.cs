using Aspire.Hosting.Testing;
using AwesomeAssertions;

namespace Acn.Fde.Practice.IntegrationTests;

public sealed class AppHostConfigurationTests
{
    [Test]
    public async Task Container_runtime_is_Podman_Async()
    {
        var workerState = Path.Combine(
            Path.GetTempPath(),
            "acn-fde-apphost-configuration");
        var appHost = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.Acn_Fde_Practice_AppHost>(
                ["--environment=Integration", $"--Integration:WorkerStatePath={workerState}"]);

        appHost.Configuration["DcpPublisher:ContainerRuntime"].Should().Be("podman");
    }
}
