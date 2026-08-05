using Acn.Fde.Practice.Application.PracticeState;

namespace Acn.Fde.Practice.Infrastructure.Repositories;

/// <summary>Combines the unit-of-work transaction with the Entity Framework execution strategy.</summary>
/// <remarks>
/// The unit of work opens its transaction on the shared ADO connection, which Entity
/// Framework does not observe. Running the transaction inside the execution strategy
/// suspends per-command retries for its duration, so a transient failure replays the
/// whole transaction instead of committing part of it outside the advisory lock.
/// </remarks>
[ScopedService<IPracticeStateTransaction>]
public sealed class PracticeStateTransaction(
    PracticeDbContext dbContext,
    IUnitOfWork unitOfWork) : IPracticeStateTransaction
{
    private readonly PracticeDbContext _dbContext = dbContext.ThrowIfNull();
    private readonly IUnitOfWork _unitOfWork = unitOfWork.ThrowIfNull();

    /// <inheritdoc/>
    public Task<T> ExecuteAsync<T>(
        Func<CancellationToken, Task<T>> work,
        CancellationToken cancellationToken = default)
    {
        work.ThrowIfNull();

        return _dbContext.Database.CreateExecutionStrategy().ExecuteAsync(
            work,
            (_, state, ct) => _unitOfWork.TransactionAsync(state, ct),
            verifySucceeded: null,
            cancellationToken);
    }
}
