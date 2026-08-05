using Acn.Fde.Practice.Contracts;

namespace Acn.Fde.Practice.Application.PracticeState;

public interface IPracticeStateService
{
    Task<Result<PracticeStateEnvelope>> GetAsync(CancellationToken cancellationToken = default);

    Task<Result<PracticeStateEnvelope>> MergeAsync(
        PracticeStateEnvelope envelope,
        CancellationToken cancellationToken = default);
}
