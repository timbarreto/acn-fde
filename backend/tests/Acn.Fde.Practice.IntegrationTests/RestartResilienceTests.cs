using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using AwesomeAssertions;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace Acn.Fde.Practice.IntegrationTests;

[NonParallelizable]
[Category("Resilience")]
public sealed class RestartResilienceTests
{
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan TransitionTimeout = TimeSpan.FromMinutes(2);
    private static readonly string[] ResourceNames =
        ["postgres-server", "migrations", "identity-migrations", "coreex", "app"];

    [Test]
    public Task Project_stack_survives_process_and_database_restarts_Async() =>
        ExerciseRestartSequenceAsync("Integration");

    [Test]
    [Category("Container")]
    public Task Production_container_stack_survives_process_and_database_restarts_Async() =>
        ExerciseRestartSequenceAsync("Container");

    private static async Task ExerciseRestartSequenceAsync(string environment)
    {
        var testRoot = Path.Combine(
            Path.GetTempPath(),
            "acn-fde-restart-resilience",
            Guid.NewGuid().ToString("N"));
        var stackStartedAt = DateTimeOffset.UtcNow;
        var workerState = Path.Combine(testRoot, "worker-state");
        var postgresData = Path.Combine(testRoot, "postgres-data");
        var queuedCache = Path.Combine(testRoot, "browser-cache.json");
        Directory.CreateDirectory(testRoot);
        DistributedApplication? app = null;
        var exercised = false;

        try
        {
            var appHost = await DistributedApplicationTestingBuilder
                .CreateAsync<Projects.Acn_Fde_Practice_AppHost>(
                    [
                        $"--environment={environment}",
                        $"--Integration:WorkerStatePath={workerState}",
                        $"--Integration:PostgresDataPath={postgresData}",
                    ]);
            app = await appHost.BuildAsync().WaitAsync(StartupTimeout);
            await app.StartAsync().WaitAsync(StartupTimeout);
            await app.ResourceNotifications
                .WaitForResourceHealthyAsync("app")
                .WaitAsync(StartupTimeout);

            if (environment == "Container")
                await ProductionContainerRuntime.AssertCoreExAsync(stackStartedAt);

            using var client = app.CreateHttpClient("app");
            client.Timeout = TimeSpan.FromSeconds(30);
            using var coreExClient = app.CreateHttpClient("coreex");
            coreExClient.Timeout = TimeSpan.FromSeconds(5);
            var identity = await IssueIdentityAsync(client, "Restart candidate");
            await AssertSigningKeyIsPublishedAsync(client, identity.Token);
            var accepted = await SaveAsync(
                client,
                identity.Token,
                CreateEnvelope("arch-001", "a"));
            var firstReceipt = accepted["receipts"]!["bookmarks"]!["arch-001"]!["receivedAt"]!
                .GetValue<string>();

            await StopResourceAsync(app, "coreex");
            await WaitForUnavailableAsync(coreExClient, "/health/live");
            using (var unavailableClient = app.CreateHttpClient("app"))
            {
                unavailableClient.Timeout = TimeSpan.FromSeconds(2);
                await WaitForUnavailableAsync(unavailableClient, "/health/live");
            }
            await StartResourceAsync(app, "coreex");
            await WaitForStatusAsync(coreExClient, "/health/ready", HttpStatusCode.OK);
            await WaitForStatusAsync(client, "/health/ready", HttpStatusCode.OK);
            JsonNode.DeepEquals(await LoadAsync(client, identity.Token), accepted)
                .Should().BeTrue("accepted practice state belongs in PostgreSQL, not the API process");

            await RestartResourceAsync(app, "app");
            await WaitForStatusAsync(client, "/health/ready", HttpStatusCode.OK);
            (await GetSessionAsync(client, identity.SessionCookie)).Should().NotBe("null");
            var tokenAfterWorkerRestart = await GetTokenAsync(client, identity.SessionCookie);

            var queued = AddQueuedEdit(accepted, "arch-002", "b");
            await File.WriteAllTextAsync(queuedCache, queued.ToJsonString());

            await StopResourceAsync(app, "postgres-server");
            await WaitForStatusAsync(
                client,
                "/health/ready",
                HttpStatusCode.ServiceUnavailable,
                TransitionTimeout);
            (await client.GetAsync("/health/live")).StatusCode.Should().Be(HttpStatusCode.OK);
            (await client.GetAsync("/health/startup")).StatusCode.Should().Be(HttpStatusCode.OK);

            var queuedAfterBrowserRestart = JsonNode.Parse(
                await File.ReadAllTextAsync(queuedCache))!;
            await StartResourceAsync(app, "postgres-server");
            await WaitForStatusAsync(client, "/health/ready", HttpStatusCode.OK);

            var recovered = await SaveAsync(
                client,
                tokenAfterWorkerRestart,
                queuedAfterBrowserRestart);
            var repeated = await SaveAsync(
                client,
                tokenAfterWorkerRestart,
                queuedAfterBrowserRestart);

            recovered["state"]!["bookmarks"]!.AsArray()
                .Select(value => value!.GetValue<string>())
                .Should().Equal("arch-001", "arch-002");
            recovered["receipts"]!["bookmarks"]!.AsObject().Should().HaveCount(2);
            recovered["receipts"]!["latestAnswers"]!.AsObject().Should().HaveCount(2);
            recovered["receipts"]!["bookmarks"]!["arch-001"]!["receivedAt"]!
                .GetValue<string>().Should().Be(firstReceipt);
            JsonNode.DeepEquals(recovered, repeated)
                .Should().BeTrue("replaying a durable queued edit must not duplicate or roll back state");
            JsonNode.DeepEquals(
                await LoadAsync(client, tokenAfterWorkerRestart),
                recovered).Should().BeTrue();
            exercised = true;
        }
        catch
        {
            if (app is not null)
                await WriteResourceLogsAsync(app);
            throw;
        }
        finally
        {
            var cleanupFailure = await IsolatedStackCleanup.TryShutDownAsync(
                app,
                testRoot,
                postgresData);
            if (exercised && cleanupFailure is not null)
                throw new InvalidOperationException(cleanupFailure);
        }
    }

    private static async Task StopResourceAsync(
        DistributedApplication app,
        string resourceName) =>
        await ExecuteResourceCommandAsync(
            app,
            resourceName,
            KnownResourceCommands.StopCommand,
            requireSuccess: false);

    private static async Task StartResourceAsync(
        DistributedApplication app,
        string resourceName) =>
        await ExecuteResourceCommandAsync(
            app,
            resourceName,
            KnownResourceCommands.StartCommand);

    private static async Task RestartResourceAsync(
        DistributedApplication app,
        string resourceName) =>
        await ExecuteResourceCommandAsync(
            app,
            resourceName,
            KnownResourceCommands.RestartCommand);

    private static async Task ExecuteResourceCommandAsync(
        DistributedApplication app,
        string resourceName,
        string command,
        bool requireSuccess = true)
    {
        var commands = app.Services.GetRequiredService<ResourceCommandService>();
        var result = await commands.ExecuteCommandAsync(
            resourceName,
            command,
            CancellationToken.None).WaitAsync(TransitionTimeout);
        if (requireSuccess)
            result.Success.Should().BeTrue(result.Message);
        else if (!result.Success)
            TestContext.Progress.WriteLine(
                $"Stop command for {resourceName} reported '{result.Message}'; endpoint state remains authoritative.");
    }

    private static async Task WaitForUnavailableAsync(
        HttpClient client,
        string path)
    {
        var deadline = DateTimeOffset.UtcNow + TransitionTimeout;
        while (DateTimeOffset.UtcNow < deadline)
        {
            try
            {
                using var response = await client.GetAsync(path);
                if (response.StatusCode != HttpStatusCode.OK)
                    return;
            }
            catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
            {
                return;
            }

            await Task.Delay(250);
        }

        throw new AssertionException($"{path} remained available after its resource stopped.");
    }

    private static async Task WaitForStatusAsync(
        HttpClient client,
        string path,
        HttpStatusCode expected,
        TimeSpan? timeout = null)
    {
        var deadline = DateTimeOffset.UtcNow + (timeout ?? TransitionTimeout);
        HttpStatusCode? lastStatus = null;
        Exception? lastError = null;

        while (DateTimeOffset.UtcNow < deadline)
        {
            try
            {
                using var response = await client.GetAsync(path);
                lastStatus = response.StatusCode;
                lastError = null;
                if (response.StatusCode == expected)
                    return;
            }
            catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
            {
                lastError = error;
            }

            await Task.Delay(250);
        }

        throw new AssertionException(
            $"{path} did not reach {(int)expected}. Last status: {lastStatus}; last error: {lastError?.Message}");
    }

    private static async Task<TestIdentity> IssueIdentityAsync(
        HttpClient client,
        string name)
    {
        using var response = await client.PostAsJsonAsync(
            "/api/test-auth/identity",
            new { name });
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<TestIdentity>())!;
    }

    private static async Task AssertSigningKeyIsPublishedAsync(
        HttpClient client,
        string token)
    {
        var headerBytes = WebEncoders.Base64UrlDecode(token.Split('.')[0]);
        var header = JsonNode.Parse(headerBytes)!;
        var keyId = header["kid"]!.GetValue<string>();

        using var response = await client.GetAsync("/api/auth/jwks");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var keySet = await response.Content.ReadFromJsonAsync<JsonNode>();
        keySet!["keys"]!.AsArray()
            .Select(key => key!["kid"]!.GetValue<string>())
            .Should().Contain(keyId);
    }

    private static async Task<string> GetSessionAsync(
        HttpClient client,
        string sessionCookie)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            "/api/auth/get-session");
        request.Headers.Add("Cookie", sessionCookie);
        using var response = await client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return await response.Content.ReadAsStringAsync();
    }

    private static async Task<string> GetTokenAsync(
        HttpClient client,
        string sessionCookie)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/token");
        request.Headers.Add("Cookie", sessionCookie);
        using var response = await client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonNode>();
        return body!["token"]!.GetValue<string>();
    }

    private static async Task<JsonNode> SaveAsync(
        HttpClient client,
        string token,
        JsonNode envelope)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/practice-state")
        {
            Content = JsonContent.Create(envelope),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        var challenges = string.Join(", ", response.Headers.WwwAuthenticate);
        response.StatusCode.Should().Be(
            HttpStatusCode.OK,
            $"the practice response was {body}; authentication challenge was {challenges}");
        return JsonNode.Parse(body)!;
    }

    private static async Task<JsonNode> LoadAsync(HttpClient client, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/practice-state");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<JsonNode>())!;
    }

    private static JsonNode AddQueuedEdit(
        JsonNode canonical,
        string questionId,
        string optionId)
    {
        var queued = canonical.DeepClone();
        queued["state"]!["bookmarks"]!.AsArray().Add(questionId);
        queued["state"]!["latestAnswers"]![questionId] = new JsonArray(optionId);
        queued["receipts"]!["bookmarks"]![questionId] = new JsonObject
        {
            ["isBookmarked"] = true,
        };
        queued["receipts"]!["latestAnswers"]!.AsObject().Remove(questionId);
        return queued;
    }

    private static JsonNode CreateEnvelope(string questionId, string optionId) =>
        new JsonObject
        {
            ["schemaVersion"] = 2,
            ["state"] = new JsonObject
            {
                ["activeAttempt"] = null,
                ["attempts"] = new JsonArray(),
                ["bookmarks"] = new JsonArray(questionId),
                ["latestAnswers"] = new JsonObject
                {
                    [questionId] = new JsonArray(optionId),
                },
            },
            ["receipts"] = new JsonObject
            {
                ["finishedAttempts"] = new JsonObject(),
                ["bookmarks"] = new JsonObject
                {
                    [questionId] = new JsonObject
                    {
                        ["isBookmarked"] = true,
                    },
                },
                ["latestAnswers"] = new JsonObject(),
            },
        };

    private static async Task WriteResourceLogsAsync(DistributedApplication app)
    {
        var logs = app.Services.GetRequiredService<ResourceLoggerService>();
        foreach (var resourceName in ResourceNames)
        {
            TestContext.Error.WriteLine($"--- {resourceName} ---");
            await foreach (var batch in logs.GetAllAsync(resourceName))
            {
                foreach (var line in batch)
                    TestContext.Error.WriteLine(line.Content);
            }
        }
    }

    private sealed record TestIdentity(
        string Subject,
        string Token,
        string SessionCookie);
}
