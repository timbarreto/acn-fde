using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Acn.Fde.Practice.Api.Health;

/// <summary>Reports whether the API process can execute a health check.</summary>
public sealed class LiveHealthCheck : IHealthCheck
{
    /// <inheritdoc/>
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(HealthCheckResult.Healthy());
}
