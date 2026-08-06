using CoreEx.Database;
using DbEx.Migration;
using DbEx.Postgres.Console;
using Npgsql;
using System.Text.Json;

namespace Acn.Fde.Practice.Database;

/// <summary>Represents the <b>database utilities</b> program.</summary>
public class Program
{
    /// <summary>Main startup.</summary>
    public static Task<int> Main(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__Postgres")
            ?? throw new InvalidOperationException(
                "The ConnectionStrings__Postgres environment variable is required.");

        if (args is ["migration-ledger"])
            return WriteMigrationLedgerAsync(connectionString);

        if (args is [var command] &&
            string.Equals(command, "Migrate", StringComparison.OrdinalIgnoreCase))
        {
            var migrationArgs = new MigrationArgs { ConnectionString = connectionString };
            migrationArgs.AddAssembly<Program>();
            ConfigureMigrationArgs(migrationArgs);
            return new ExistingDatabasePostgresMigrationConsole(migrationArgs).RunAsync(args);
        }

        return PostgresMigrationConsole
            .Create<Program>(connectionString)
            .Configure(c => ConfigureMigrationArgs(c.Args))
            .RunAsync(args);
    }

    private static async Task<int> WriteMigrationLedgerAsync(string connectionString)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        await using var exists = new NpgsqlCommand(
            "SELECT to_regclass('public.schemaversions') IS NOT NULL",
            connection);
        if (await exists.ExecuteScalarAsync() is not true)
        {
            Console.WriteLine("[]");
            return 0;
        }

        await using var ledger = new NpgsqlCommand(
            "SELECT scriptname FROM public.schemaversions ORDER BY schemaversionsid",
            connection);
        await using var reader = await ledger.ExecuteReaderAsync();
        var migrations = new List<string>();
        while (await reader.ReadAsync())
            migrations.Add(reader.GetString(0));

        Console.WriteLine(JsonSerializer.Serialize(migrations));
        return 0;
    }

    /// <summary>Configure the <see cref="MigrationArgs"/>.</summary>
    public static MigrationArgs ConfigureMigrationArgs(MigrationArgs args)
    {
        args.AddAssembly<SqlStatement>().AddAssembly<Program>();   // SqlStatement = CoreEx EF code-gen templates; Program = this project's embedded migrations/data. Both REQUIRED — the API tests call ConfigureMigrationArgs directly (not via Main), so the Database assembly must be added here. Do not remove.
        args.DataResetFilterPredicate = ts => ts.Schema == "practice";   // Only reset data for the specified schema.
        return args;
    }
}
