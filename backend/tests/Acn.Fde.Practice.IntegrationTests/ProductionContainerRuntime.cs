using AwesomeAssertions;
using System.Diagnostics;
using System.Globalization;
using System.Text.Json.Nodes;

namespace Acn.Fde.Practice.IntegrationTests;

internal static class ProductionContainerRuntime
{
    private const long OneGibibyte = 1024L * 1024 * 1024;

    public static async Task AssertCoreExAsync(DateTimeOffset stackStartedAt)
    {
        var containerIds = (await RunPodmanAsync(
                "ps",
                "--filter",
                "name=coreex-",
                "--format",
                "{{.ID}}"))
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var candidates = new List<(string Id, JsonNode Inspection)>();

        foreach (var containerId in containerIds)
        {
            var inspection = ParseFirst(await RunPodmanAsync("inspect", containerId));
            var startedAt = DateTimeOffset.Parse(
                inspection["State"]!["StartedAt"]!.GetValue<string>(),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal);
            var issuer = EnvironmentValue(inspection, "IdentityToken__Issuer");
            if (startedAt >= stackStartedAt.AddSeconds(-1)
                && issuer == "https://acn-fde-full-stack.invalid")
            {
                candidates.Add((containerId, inspection));
            }
        }

        if (candidates.Count != 1)
        {
            throw new AssertionException(
                $"The Container profile should start exactly one isolated CoreEx container; found {candidates.Count}.");
        }
        var (id, container) = candidates.Single();

        container["State"]!["Running"]!.GetValue<bool>().Should().BeTrue();
        container["Config"]!["User"]!.GetValue<string>().Should().Be("1654");
        container["Config"]!["Entrypoint"]!.AsArray()
            .Select(value => value!.GetValue<string>())
            .Should().Equal("dotnet", "Acn.Fde.Practice.Api.dll");
        container["Config"]!["ExposedPorts"]!["8080/tcp"].Should().NotBeNull();
        container["HostConfig"]!["Memory"]!.GetValue<long>().Should().Be(OneGibibyte);
        container["Mounts"]!.AsArray().Should().BeEmpty(
            "CoreEx keeps durable practice and identity state outside its filesystem");

        EnvironmentValue(container, "ASPNETCORE_HTTP_PORTS").Should().Be("8080");
        EnvironmentValue(container, "ASPNETCORE_ENVIRONMENT").Should().Be("Production");
        EnvironmentValue(container, "OTEL_SDK_DISABLED").Should().Be("false",
            "the local Container profile explicitly supplies Aspire OTLP configuration");
        EnvironmentValue(container, "OTEL_EXPORTER_OTLP_ENDPOINT").Should().NotBeNullOrWhiteSpace();
        EnvironmentValue(container, "ConnectionStrings__Postgres").Should().NotBeNullOrWhiteSpace();

        (await RunPodmanAsync("exec", id, "id", "-u")).Trim().Should().Be("1654");

        var image = ParseFirst(await RunPodmanAsync(
            "image",
            "inspect",
            container["Image"]!.GetValue<string>()));
        image["Os"]!.GetValue<string>().Should().Be("linux");
        image["Architecture"]!.GetValue<string>().Should().Be("amd64");
    }

    private static string? EnvironmentValue(JsonNode inspection, string name)
    {
        var prefix = $"{name}=";
        var entry = inspection["Config"]!["Env"]!.AsArray()
            .Select(value => value!.GetValue<string>())
            .SingleOrDefault(value => value.StartsWith(prefix, StringComparison.Ordinal));
        return entry?[prefix.Length..];
    }

    private static JsonNode ParseFirst(string json) =>
        JsonNode.Parse(json)!.AsArray().Single()!;

    private static async Task<string> RunPodmanAsync(params string[] arguments)
    {
        var startInfo = new ProcessStartInfo("podman")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        foreach (var argument in arguments)
            startInfo.ArgumentList.Add(argument);

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Podman could not be started.");
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(30));
        var output = await standardOutput;
        var error = await standardError;
        if (process.ExitCode != 0)
        {
            throw new AssertionException(
                $"podman {string.Join(' ', arguments)} failed with exit code {process.ExitCode}: {error.Trim()}");
        }

        return output;
    }
}
