namespace Acn.Fde.Practice.Application.PracticeState;

/// <summary>
/// Runs practice-state work inside a single database transaction that also owns any
/// transient-failure retry.
/// </summary>
/// <remarks>
/// Merge serialization depends on a transaction-scoped advisory lock and
/// <c>SELECT ... FOR UPDATE</c>, so a transient database failure must replay the whole
/// transaction rather than an individual command. Retrying a command on its own would
/// re-issue it on a connection that no longer holds either lock.
/// </remarks>
public interface IPracticeStateTransaction
{
    /// <summary>Executes <paramref name="work"/> within one retryable transaction.</summary>
    Task<T> ExecuteAsync<T>(
        Func<CancellationToken, Task<T>> work,
        CancellationToken cancellationToken = default);
}
