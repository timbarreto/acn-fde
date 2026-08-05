using Acn.Fde.Practice.Api.Health;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Cryptography;

namespace Acn.Fde.Practice.Test.Api;

public sealed class HealthTests
{
    [Test]
    public async Task Startup_changes_from_unhealthy_to_healthy_Async()
    {
        var check = new StartupHealthCheck();

        var before = await check.CheckHealthAsync(new());
        check.MarkStarted();
        var after = await check.CheckHealthAsync(new());

        before.Status.Should().Be(HealthStatus.Unhealthy);
        after.Status.Should().Be(HealthStatus.Healthy);
    }

    [Test]
    public void Data_protection_is_deliberately_ephemeral_between_host_instances()
    {
        string protectedValue;
        using (var firstFactory = new ApiFactory())
        {
            var firstProvider = firstFactory.Services
                .GetRequiredService<IDataProtectionProvider>();
            firstProvider.Should().BeOfType<EphemeralDataProtectionProvider>();
            var firstProtector = firstProvider
                .CreateProtector("container-resilience-test");
            protectedValue = firstProtector.Protect("process-local-only");
            firstProtector.Unprotect(protectedValue).Should().Be("process-local-only");
        }

        using var restartedFactory = new ApiFactory();
        var restartedProtector = restartedFactory.Services
            .GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("container-resilience-test");

        var unprotect = () => restartedProtector.Unprotect(protectedValue);
        unprotect.Should().Throw<CryptographicException>();
    }

    [Test]
    public async Task Endpoints_separate_process_startup_and_dependency_health_Async()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        using var live = await client.GetAsync("/health/live");
        using var startup = await client.GetAsync("/health/startup");
        using var ready = await client.GetAsync("/health/ready");

        live.StatusCode.Should().Be(HttpStatusCode.OK);
        startup.StatusCode.Should().Be(HttpStatusCode.OK);
        ready.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }

    private sealed class ApiFactory : WebApplicationFactory<Acn.Fde.Practice.Api.Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.UseSetting(
                "ConnectionStrings:Postgres",
                "Host=127.0.0.1;Port=1;Database=practice;Username=test;Password=test;Timeout=1");
        }
    }
}
