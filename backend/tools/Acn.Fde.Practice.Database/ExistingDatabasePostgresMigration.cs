using CoreEx.Database;
using DbEx.Console;
using DbEx.Migration;
using DbEx.Postgres.Migration;

namespace Acn.Fde.Practice.Database;

/// <summary>
/// Runs migrations against a PostgreSQL database that is provisioned before DbEx starts.
/// </summary>
internal sealed class ExistingDatabasePostgresMigration(MigrationArgsBase args)
    : PostgresMigration(args)
{
    /// <summary>
    /// Verifies the connected database without opening DbEx's database-less master connection.
    /// Managed PostgreSQL proxies such as Neon require a database in every startup packet.
    /// </summary>
    protected override async Task<bool> DatabaseExistsAsync(
        CancellationToken cancellationToken = default)
    {
        var currentDatabase = await Database
            .SqlStatement("SELECT current_database()")
            .ScalarAsync<string?>(cancellationToken);
        return string.Equals(currentDatabase, DatabaseName, StringComparison.Ordinal);
    }
}

/// <summary>Hosts the existing-database migration through the standard DbEx CLI.</summary>
internal sealed class ExistingDatabasePostgresMigrationConsole(MigrationArgs args)
    : MigrationConsoleBase(args)
{
    /// <inheritdoc/>
    protected override DatabaseMigrationBase CreateMigrator() =>
        new ExistingDatabasePostgresMigration(Args);

    /// <inheritdoc/>
    public override string AppTitle => base.AppTitle + " [PostgreSQL]";
}
