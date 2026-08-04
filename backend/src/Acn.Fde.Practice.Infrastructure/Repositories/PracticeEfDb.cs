namespace Acn.Fde.Practice.Infrastructure.Repositories;

/// <summary>Provides the <see cref="PracticeDbContext"/> <see cref="EfDb{TDbContext}"/> wrapper.</summary>
public sealed class PracticeEfDb(PracticeDbContext dbContext) : EfDb<PracticeDbContext>(dbContext, _options)
{
    private static readonly EfDbOptions _options = new();
}
