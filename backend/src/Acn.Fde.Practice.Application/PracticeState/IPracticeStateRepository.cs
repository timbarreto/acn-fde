using Acn.Fde.Practice.Contracts;

namespace Acn.Fde.Practice.Application.PracticeState;

public interface IPracticeStateRepository
{
    Task<StoredPracticeState?> GetAsync(string subject, CancellationToken cancellationToken = default);

    Task SaveAsync(StoredPracticeState practiceState, CancellationToken cancellationToken = default);
}

public sealed class StoredPracticeState
{
    public required string Subject { get; init; }
    public required string GitHubAccountId { get; init; }
    public required PracticeStateEnvelope Envelope { get; init; }
}
