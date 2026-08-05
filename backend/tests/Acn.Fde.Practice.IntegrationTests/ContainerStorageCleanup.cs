using System.Diagnostics;

namespace Acn.Fde.Practice.IntegrationTests;

internal static class ContainerStorageCleanup
{
    public static async Task RemoveAsync(string path)
    {
        if (!Directory.Exists(path))
            return;

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

        process.Start();
        var standardError = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"Could not remove isolated PostgreSQL data: {await standardError}");
        }
    }
}
