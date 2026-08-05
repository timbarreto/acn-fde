using Aspire.Hosting;
using System.Diagnostics;

namespace Acn.Fde.Practice.IntegrationTests;

/// <summary>
/// Shuts an isolated stack down and removes its temporary stores, reporting rather than
/// throwing so a cleanup failure never replaces the failure a test is already reporting.
/// </summary>
internal static class IsolatedStackCleanup
{
    private static readonly TimeSpan RemovalTimeout = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Returns a description of the first shutdown or removal failure, or
    /// <see langword="null"/> when the stack and its stores were fully released.
    /// </summary>
    public static async Task<string?> TryShutDownAsync(
        DistributedApplication? app,
        string testRoot,
        string postgresDataPath)
    {
        string? failure = null;

        try
        {
            if (app is not null)
                await app.DisposeAsync();
        }
        catch (Exception error)
        {
            failure = $"Disposing the isolated stack failed: {error.Message}";
        }

        var storageFailure = await TryRemoveContainerStorageAsync(postgresDataPath);
        failure ??= storageFailure;

        try
        {
            if (Directory.Exists(testRoot))
                Directory.Delete(testRoot, recursive: true);
        }
        catch (Exception error)
        {
            failure ??= $"Could not remove {testRoot}: {error.Message}";
        }

        if (failure is not null)
            TestContext.Error.WriteLine($"Isolated stack cleanup failed. {failure}");

        return failure;
    }

    private static async Task<string?> TryRemoveContainerStorageAsync(string path)
    {
        if (!Directory.Exists(path))
            return null;

        // PostgreSQL writes its bind-mounted data directory as a container-mapped root
        // user, so removal has to run inside the user namespace Podman created it in.
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo("podman")
            {
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
            },
        };
        process.StartInfo.ArgumentList.Add("unshare");
        process.StartInfo.ArgumentList.Add("rm");
        process.StartInfo.ArgumentList.Add("-rf");
        process.StartInfo.ArgumentList.Add("--");
        process.StartInfo.ArgumentList.Add(path);

        try
        {
            process.Start();
            var standardOutput = process.StandardOutput.ReadToEndAsync();
            var standardError = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync().WaitAsync(RemovalTimeout);
            await standardOutput;
            var error = await standardError;

            return process.ExitCode == 0
                ? null
                : $"Could not remove isolated PostgreSQL data at {path}: {error.Trim()}";
        }
        catch (Exception error)
        {
            Terminate(process);
            return $"Could not remove isolated PostgreSQL data at {path}: {error.Message}";
        }
    }

    private static void Terminate(Process process)
    {
        try
        {
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
        }
        catch (Exception)
        {
            // The process already exited, or the platform refused the signal. Either
            // way termination is best effort and must never leave this helper.
        }
    }
}
