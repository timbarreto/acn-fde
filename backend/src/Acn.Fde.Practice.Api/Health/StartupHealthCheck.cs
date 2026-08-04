using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Acn.Fde.Practice.Api.Health;

/// <summary>Reports whether ASP.NET Core has completed application startup.</summary>
public sealed class StartupHealthCheck : IHealthCheck
{
    private int _started;

    /// <summary>Marks application initialization as complete.</summary>
    public void MarkStarted() => Interlocked.Exchange(ref _started, 1);

    /// <inheritdoc/>
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(Volatile.Read(ref _started) == 1
            ? HealthCheckResult.Healthy()
            : HealthCheckResult.Unhealthy("Application startup has not completed."));
}
