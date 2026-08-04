using Acn.Fde.Practice.Contracts;
using System.Text.Json;

namespace Acn.Fde.Practice.Application.PracticeState;

[ScopedService<IPracticeStateService>]
public sealed class PracticeStateService(
    CoreEx.ExecutionContext executionContext,
    IUnitOfWork unitOfWork,
    IPracticeStateRepository repository) : IPracticeStateService
{
    private readonly CoreEx.ExecutionContext _executionContext = executionContext.ThrowIfNull();
    private readonly IUnitOfWork _unitOfWork = unitOfWork.ThrowIfNull();
    private readonly IPracticeStateRepository _repository = repository.ThrowIfNull();

    public async Task<Result<PracticeStateEnvelope>> GetAsync(CancellationToken cancellationToken = default)
    {
        var subject = GetUser().Id!;
        var stored = await _repository.GetAsync(subject, cancellationToken).ConfigureAwait(false);
        return Result.Ok(stored?.Envelope ?? EmptyEnvelope());
    }

    public Task<Result<PracticeStateEnvelope>> SaveAsync(
        PracticeStateEnvelope envelope,
        CancellationToken cancellationToken = default)
    {
        envelope.ThrowIfNull();
        var validation = PracticeStateEnvelopeValidator.Validate(envelope, _executionContext.Timestamp);
        if (validation.IsFailure)
            return Task.FromResult(validation.ToResult<PracticeStateEnvelope>());

        var user = GetUser();

        return _unitOfWork.TransactionAsync(async ct =>
        {
            var stored = await _repository.GetAsync(user.Id!, ct).ConfigureAwait(false);
            if (stored is not null && StatesAreEqual(stored.Envelope.State, envelope.State))
                return Result.Ok(stored.Envelope);

            var canonical = Canonicalize(envelope, _executionContext.Timestamp);
            await _repository.SaveAsync(new StoredPracticeState
            {
                Subject = user.Id!,
                GitHubAccountId = user.GitHubAccountId,
                Envelope = canonical,
            }, ct).ConfigureAwait(false);

            return Result.Ok(canonical);
        }, cancellationToken);
    }

    private PracticeAuthenticationUser GetUser() => _executionContext.User as PracticeAuthenticationUser
        ?? throw new InvalidOperationException("The authenticated practice identity is unavailable.");

    private static PracticeStateEnvelope EmptyEnvelope() => new()
    {
        SchemaVersion = 2,
        State = new Contracts.PracticeState(),
        Receipts = new PracticeStateReceipts(),
    };

    private static bool StatesAreEqual(Contracts.PracticeState left, Contracts.PracticeState right)
        => JsonSerializer.Serialize(left, JsonDefaults.SerializerOptions)
            == JsonSerializer.Serialize(right, JsonDefaults.SerializerOptions);

    private static PracticeStateEnvelope Canonicalize(
        PracticeStateEnvelope incoming,
        DateTimeOffset receivedAt)
    {
        var receipt = new DateTimeOffset(
            receivedAt.UtcDateTime.Ticks - receivedAt.UtcDateTime.Ticks % TimeSpan.TicksPerMillisecond,
            TimeSpan.Zero);
        var bookmarkReceipts = incoming.Receipts.Bookmarks
            .ToDictionary(
                pair => pair.Key,
                pair => new BookmarkReceipt
                {
                    IsBookmarked = pair.Value.IsBookmarked,
                    ReceivedAt = receipt,
                });

        foreach (var questionId in incoming.State.Bookmarks)
            bookmarkReceipts[questionId] = new BookmarkReceipt { IsBookmarked = true, ReceivedAt = receipt };

        return new PracticeStateEnvelope
        {
            SchemaVersion = 2,
            State = incoming.State,
            Receipts = new PracticeStateReceipts
            {
                ActiveAttemptReceivedAt = incoming.State.ActiveAttempt is null ? null : receipt,
                FinishedAttempts = incoming.State.Attempts.ToDictionary(attempt => attempt.Id, _ => receipt),
                Bookmarks = bookmarkReceipts,
                LatestAnswers = incoming.State.LatestAnswers.ToDictionary(answer => answer.Key, _ => receipt),
            },
        };
    }
}
