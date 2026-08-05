using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using AwesomeAssertions;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace Acn.Fde.Practice.IntegrationTests;

[NonParallelizable]
public sealed class SignedInFullStackTests
{
    private static readonly TimeSpan DefaultTimeout = TimeSpan.FromMinutes(2);
    private static readonly string[] ResourceNames =
        ["postgres-server", "migrations", "identity-migrations", "coreex", "app"];

    [Test]
    public async Task Two_users_can_save_load_reset_and_delete_isolated_data_Async()
    {
        var testRoot = Path.Combine(
            Path.GetTempPath(),
            "acn-fde-full-stack",
            Guid.NewGuid().ToString("N"));
        var workerState = Path.Combine(testRoot, "worker-state");
        var postgresData = Path.Combine(testRoot, "postgres-data");
        Directory.CreateDirectory(testRoot);
        DistributedApplication? app = null;

        try
        {
            var appHost = await DistributedApplicationTestingBuilder.CreateAsync<Projects.Acn_Fde_Practice_AppHost>(
                [
                    "--environment=Integration",
                    $"--Integration:WorkerStatePath={workerState}",
                    $"--Integration:PostgresDataPath={postgresData}",
                ]);
            app = await appHost.BuildAsync().WaitAsync(DefaultTimeout);
            await app.StartAsync().WaitAsync(DefaultTimeout);
            await app.ResourceNotifications
                .WaitForResourceHealthyAsync("app")
                .WaitAsync(DefaultTimeout);

            using var client = app.CreateHttpClient("app");
            using var home = await client.GetAsync("/");
            using var live = await client.GetAsync("/health/live");
            using var startup = await client.GetAsync("/health/startup");
            using var ready = await client.GetAsync("/health/ready");
            using var anonymous = await client.GetAsync("/api/practice-state");

            home.StatusCode.Should().Be(HttpStatusCode.OK);
            live.StatusCode.Should().Be(HttpStatusCode.OK);
            startup.StatusCode.Should().Be(HttpStatusCode.OK);
            ready.StatusCode.Should().Be(HttpStatusCode.OK);
            anonymous.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

            var firstIdentity = await IssueIdentityAsync(client, "First candidate");
            var secondIdentity = await IssueIdentityAsync(client, "Second candidate");
            firstIdentity.Subject.Should().NotBe(secondIdentity.Subject);

            var firstEnvelope = CreateEnvelope("arch-001", "a");
            var secondEnvelope = CreateEnvelope("arch-002", "b");

            var firstSaved = await SaveAsync(client, firstIdentity.Token, firstEnvelope);
            var beforeSecondSave = await LoadAsync(client, secondIdentity.Token);
            beforeSecondSave["state"]!["bookmarks"]!.AsArray().Should().BeEmpty();

            var secondSaved = await SaveAsync(client, secondIdentity.Token, secondEnvelope);
            var firstLoaded = await LoadAsync(client, firstIdentity.Token);
            var secondLoaded = await LoadAsync(client, secondIdentity.Token);

            JsonNode.DeepEquals(firstSaved, firstLoaded).Should().BeTrue();
            JsonNode.DeepEquals(secondSaved, secondLoaded).Should().BeTrue();
            JsonNode.DeepEquals(firstLoaded["state"], firstEnvelope["state"]).Should().BeTrue();
            JsonNode.DeepEquals(secondLoaded["state"], secondEnvelope["state"]).Should().BeTrue();

            await DeletePracticeStateAsync(client, firstIdentity.Token);
            var firstAfterReset = await LoadAsync(client, firstIdentity.Token);
            var secondAfterFirstReset = await LoadAsync(client, secondIdentity.Token);
            firstAfterReset["state"]!["bookmarks"]!.AsArray().Should().BeEmpty();
            firstAfterReset["state"]!["latestAnswers"]!.AsObject().Should().BeEmpty();
            JsonNode.DeepEquals(secondAfterFirstReset, secondSaved).Should().BeTrue();

            await DeletePracticeStateAsync(client, secondIdentity.Token);
            var secondBeforeIdentityDeletion = await LoadAsync(client, secondIdentity.Token);
            secondBeforeIdentityDeletion["state"]!["bookmarks"]!.AsArray().Should().BeEmpty();
            await DeleteIdentityAsync(client, secondIdentity.SessionCookie);
            var deletedSession = await GetSessionAsync(client, secondIdentity.SessionCookie);
            deletedSession.Should().Be("null");
        }
        catch
        {
            if (app is not null)
                await WriteResourceLogsAsync(app);

            throw;
        }
        finally
        {
            try
            {
                if (app is not null)
                    await app.DisposeAsync();
            }
            finally
            {
                await ContainerStorageCleanup.RemoveAsync(postgresData);
                if (Directory.Exists(testRoot))
                    Directory.Delete(testRoot, recursive: true);
            }
        }
    }

    private static async Task<TestIdentity> IssueIdentityAsync(HttpClient client, string name)
    {
        using var response = await client.PostAsJsonAsync(
            "/api/test-auth/identity",
            new { name });
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<TestIdentity>())!;
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
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<JsonNode>())!;
    }

    private static async Task<JsonNode> LoadAsync(HttpClient client, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/practice-state");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<JsonNode>())!;
    }

    private static async Task DeletePracticeStateAsync(HttpClient client, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Delete, "/api/practice-state");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    private static async Task DeleteIdentityAsync(HttpClient client, string sessionCookie)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/delete-user")
        {
            Content = JsonContent.Create(new { }),
        };
        request.Headers.Add("Cookie", sessionCookie);
        request.Headers.Add("Origin", client.BaseAddress!.GetLeftPart(UriPartial.Authority));
        using var response = await client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    private static async Task<string> GetSessionAsync(HttpClient client, string sessionCookie)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/get-session");
        request.Headers.Add("Cookie", sessionCookie);
        using var response = await client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return await response.Content.ReadAsStringAsync();
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

    private sealed record TestIdentity(string Subject, string Token, string SessionCookie);
}
