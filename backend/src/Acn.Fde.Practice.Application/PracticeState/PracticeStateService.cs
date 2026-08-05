using Acn.Fde.Practice.Contracts;
using System.Text.Json;

namespace Acn.Fde.Practice.Application.PracticeState;

[ScopedService<IPracticeStateService>]
public sealed class PracticeStateService(
    CoreEx.ExecutionContext executionContext,
    IUnitOfWork unitOfWork,
    IPracticeStateRepository repository,
    IPracticeStateMerger merger) : IPracticeStateService
{
    private readonly CoreEx.ExecutionContext _executionContext = executionContext.ThrowIfNull();
    private readonly IUnitOfWork _unitOfWork = unitOfWork.ThrowIfNull();
    private readonly IPracticeStateRepository _repository = repository.ThrowIfNull();
    private readonly IPracticeStateMerger _merger = merger.ThrowIfNull();

    public async Task<Result<PracticeStateEnvelope>> GetAsync(CancellationToken cancellationToken = default)
    {
        var subject = GetUser().Id!;
        var stored = await _repository.GetAsync(subject, cancellationToken).ConfigureAwait(false);
        return Result.Ok(stored?.Envelope ?? EmptyEnvelope());
    }

    public Task<Result<PracticeStateEnvelope>> MergeAsync(
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
            var stored = await _repository.GetForUpdateAsync(user.Id!, ct).ConfigureAwait(false);
            var canonical = _merger.Merge(
                stored?.Envelope ?? EmptyEnvelope(),
                envelope,
                CanonicalReceipt(_executionContext.Timestamp));
            if (stored is not null && EnvelopesAreEqual(stored.Envelope, canonical))
                return Result.Ok(stored.Envelope);

            await _repository.SaveAsync(new StoredPracticeState
            {
                Subject = user.Id!,
                GitHubAccountId = user.GitHubAccountId,
                Envelope = canonical,
            }, ct).ConfigureAwait(false);

            return Result.Ok(canonical);
        }, cancellationToken);
    }

    public Task<Result> DeleteAsync(CancellationToken cancellationToken = default)
    {
        var subject = GetUser().Id!;
        return _unitOfWork.TransactionAsync(async ct =>
        {
            await _repository.DeleteAsync(subject, ct).ConfigureAwait(false);
            return Result.Success;
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

    private static bool EnvelopesAreEqual(PracticeStateEnvelope left, PracticeStateEnvelope right)
        => JsonSerializer.Serialize(left, JsonDefaults.SerializerOptions)
            == JsonSerializer.Serialize(right, JsonDefaults.SerializerOptions);

    private static DateTimeOffset CanonicalReceipt(DateTimeOffset receivedAt)
        => new(
            receivedAt.UtcDateTime.Ticks - receivedAt.UtcDateTime.Ticks % TimeSpan.TicksPerMillisecond,
            TimeSpan.Zero);
}
