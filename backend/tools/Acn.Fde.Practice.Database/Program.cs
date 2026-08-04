using CoreEx.Database;
using DbEx.Migration;
using DbEx.Postgres.Console;

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

        return PostgresMigrationConsole
            .Create<Program>(connectionString)
            .Configure(c => ConfigureMigrationArgs(c.Args))
            .RunAsync(args);
    }

    /// <summary>Configure the <see cref="MigrationArgs"/>.</summary>
    public static MigrationArgs ConfigureMigrationArgs(MigrationArgs args)
    {
        args.AddAssembly<SqlStatement>().AddAssembly<Program>();   // SqlStatement = CoreEx EF code-gen templates; Program = this project's embedded migrations/data. Both REQUIRED — the API tests call ConfigureMigrationArgs directly (not via Main), so the Database assembly must be added here. Do not remove.
        args.DataResetFilterPredicate = ts => ts.Schema == "practice";   // Only reset data for the specified schema.
        return args;
    }
}
