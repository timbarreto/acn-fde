using Acn.Fde.Practice.Contracts;

namespace Acn.Fde.Practice.Application.PracticeState;

public interface IPracticeStateRepository
{
    Task<StoredPracticeState?> GetAsync(string subject, CancellationToken cancellationToken = default);

    /// <summary>
    /// Serializes this subject's exchange and locks its row for update inside the caller's transaction.
    /// </summary>
    /// <remarks>The caller must hold an active unit-of-work transaction until the canonical state is saved.</remarks>
    Task<StoredPracticeState?> GetForUpdateAsync(
        string subject,
        CancellationToken cancellationToken = default);

    Task SaveAsync(StoredPracticeState practiceState, CancellationToken cancellationToken = default);
}

public sealed class StoredPracticeState
{
    public required string Subject { get; init; }
    public required string GitHubAccountId { get; init; }
    public required PracticeStateEnvelope Envelope { get; init; }
}
