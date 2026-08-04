using Acn.Fde.Practice.Application.PracticeState;
using Acn.Fde.Practice.Infrastructure.Persistence;

namespace Acn.Fde.Practice.Infrastructure.Repositories;

[ScopedService<IPracticeStateRepository>]
public sealed class PracticeStateRepository(
    PracticeDbContext dbContext,
    CoreEx.ExecutionContext executionContext) : IPracticeStateRepository
{
    private readonly PracticeDbContext _dbContext = dbContext.ThrowIfNull();
    private readonly CoreEx.ExecutionContext _executionContext = executionContext.ThrowIfNull();

    public async Task<StoredPracticeState?> GetAsync(
        string subject,
        CancellationToken cancellationToken = default)
    {
        var entity = await _dbContext.Set<PracticeStateEntity>()
            .SingleOrDefaultAsync(state => state.UserId == subject, cancellationToken)
            .ConfigureAwait(false);
        return entity is null ? null : PracticeStateMapper.Map(entity);
    }

    public async Task SaveAsync(
        StoredPracticeState practiceState,
        CancellationToken cancellationToken = default)
    {
        var entity = await _dbContext.Set<PracticeStateEntity>()
            .SingleOrDefaultAsync(state => state.UserId == practiceState.Subject, cancellationToken)
            .ConfigureAwait(false);
        var now = _executionContext.Timestamp;
        if (entity is null)
        {
            entity = new PracticeStateEntity
            {
                UserId = practiceState.Subject,
                CreatedBy = practiceState.Subject,
                CreatedOn = now,
                UpdatedBy = practiceState.Subject,
                UpdatedOn = now,
            };
            PracticeStateMapper.MapInto(practiceState, entity);
            _dbContext.Add(entity);
        }
        else
        {
            PracticeStateMapper.MapInto(practiceState, entity);
            entity.UpdatedBy = practiceState.Subject;
            entity.UpdatedOn = now;
        }

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
    }
}
