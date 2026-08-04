using Acn.Fde.Practice.Api.Identity;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json.Nodes;
using System.Net.Http.Headers;
using System.Globalization;
using Testcontainers.PostgreSql;

namespace Acn.Fde.Practice.Test.Api;

[NonParallelizable]
public sealed class PracticeStateApiTests
{
    private readonly PostgreSqlContainer _database = new PostgreSqlBuilder("postgres:18.4-alpine").Build();
    private PracticeApiFactory _factory = null!;

    [OneTimeSetUp]
    public async Task SetUpDatabaseAsync()
    {
        await _database.StartAsync();
        await ApplyMigrationsAsync(_database.GetConnectionString());
        _factory = new PracticeApiFactory(_database.GetConnectionString());
    }

    [OneTimeTearDown]
    public async Task TearDownDatabaseAsync()
    {
        await _factory.DisposeAsync();
        await _database.DisposeAsync();
    }

    [Test]
    public async Task User_can_save_and_load_a_complete_practice_state_envelope_Async()
    {
        using var client = CreateClient("subject-a", "1001");
        var requestJson = JsonNode.Parse(CompleteEnvelopeJson)!;
        var before = DateTimeOffset.UtcNow;

        using var post = await client.PostAsync(
            "/api/practice-state",
            new StringContent(CompleteEnvelopeJson, Encoding.UTF8, "application/json"));
        var after = DateTimeOffset.UtcNow;

        post.StatusCode.Should().Be(HttpStatusCode.OK);
        var saved = JsonNode.Parse(await post.Content.ReadAsStringAsync())!;
        JsonNode.DeepEquals(saved["state"], requestJson["state"]).Should().BeTrue();
        var receiptText = saved["receipts"]!["activeAttemptReceivedAt"]!.GetValue<string>();
        receiptText.Should().MatchRegex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$");
        var receipt = DateTimeOffset.Parse(receiptText);
        receipt.Should().BeOnOrAfter(before).And.BeOnOrBefore(after);
        saved["receipts"]!["finishedAttempts"]!["22222222-2222-4222-8222-222222222222"].Should().NotBeNull();
        saved["receipts"]!["bookmarks"]!["arch-003"]!["isBookmarked"]!.GetValue<bool>().Should().BeTrue();
        saved["receipts"]!["latestAnswers"]!["arch-001"].Should().NotBeNull();

        using var get = await client.GetAsync("/api/practice-state");

        get.StatusCode.Should().Be(HttpStatusCode.OK);
        JsonNode.DeepEquals(JsonNode.Parse(await get.Content.ReadAsStringAsync()), saved).Should().BeTrue();
    }

    [Test]
    public async Task Unknown_question_is_rejected_without_saving_Async()
    {
        using var client = CreateClient("subject-invalid-question", "1002");
        var invalid = JsonNode.Parse(CompleteEnvelopeJson)!;
        invalid["state"]!["activeAttempt"]!["questionIds"]![0] = "unknown-question";

        using var post = await client.PostAsync(
            "/api/practice-state",
            new StringContent(invalid.ToJsonString(), Encoding.UTF8, "application/json"));

        post.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = JsonNode.Parse(await post.Content.ReadAsStringAsync())!;
        problem["code"]!.GetValue<string>().Should().Be("invalid_practice_state");

        using var get = await client.GetAsync("/api/practice-state");
        var loaded = JsonNode.Parse(await get.Content.ReadAsStringAsync())!;
        loaded["state"]!["activeAttempt"].Should().BeNull();
    }

    [Test]
    public async Task Unsupported_schema_version_has_a_stable_problem_code_Async()
    {
        using var client = CreateClient("subject-invalid-version", "1003");
        var invalid = JsonNode.Parse(CompleteEnvelopeJson)!;
        invalid["schemaVersion"] = 1;

        using var response = await client.PostAsync(
            "/api/practice-state",
            new StringContent(invalid.ToJsonString(), Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        problem["code"]!.GetValue<string>().Should().Be("unsupported_schema_version");
    }

    [Test]
    public async Task Unsupported_media_type_is_rejected_before_parsing_Async()
    {
        using var client = CreateClient("subject-invalid-media", "1004");

        using var response = await client.PostAsync(
            "/api/practice-state",
            new StringContent(CompleteEnvelopeJson, Encoding.UTF8, "text/plain"));

        response.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
        var problem = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        problem["code"]!.GetValue<string>().Should().Be("unsupported_media_type");
    }

    [Test]
    public async Task Oversized_body_without_content_length_is_rejected_Async()
    {
        using var client = CreateClient("subject-oversized", "1005");
        var oversized = JsonNode.Parse(CompleteEnvelopeJson)!;
        oversized["state"]!["activeAttempt"]!["label"] = new string('x', 513 * 1024);
        using var content = new UnknownLengthJsonContent(Encoding.UTF8.GetBytes(oversized.ToJsonString()));

        using var response = await client.PostAsync("/api/practice-state", content);

        response.StatusCode.Should().Be(HttpStatusCode.RequestEntityTooLarge);
        var problem = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        problem["code"]!.GetValue<string>().Should().Be("practice_state_too_large");
    }

    [Test]
    public async Task Malformed_json_has_a_stable_problem_code_Async()
    {
        using var client = CreateClient("subject-malformed", "1006");

        using var response = await client.PostAsync(
            "/api/practice-state",
            new StringContent("{\"schemaVersion\":2,", Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        problem["code"]!.GetValue<string>().Should().Be("malformed_json");
    }

    [Test]
    public async Task Unknown_json_property_is_rejected_as_invalid_practice_state_Async()
    {
        using var client = CreateClient("subject-unknown-property", "1007");
        var invalid = JsonNode.Parse(CompleteEnvelopeJson)!;
        invalid["unexpected"] = "not allowed";

        using var response = await client.PostAsync(
            "/api/practice-state",
            new StringContent(invalid.ToJsonString(), Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        problem["code"]!.GetValue<string>().Should().Be("invalid_practice_state");
    }

    [Test]
    public async Task Missing_required_property_is_rejected_as_invalid_practice_state_Async()
    {
        using var client = CreateClient("subject-missing-property", "1008");
        var invalid = JsonNode.Parse(CompleteEnvelopeJson)!;
        invalid.AsObject().Remove("state");

        using var response = await client.PostAsync(
            "/api/practice-state",
            new StringContent(invalid.ToJsonString(), Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        problem["code"]!.GetValue<string>().Should().Be("invalid_practice_state");
    }

    [Test]
    public async Task Collection_bounds_are_enforced_Async()
    {
        using var client = CreateClient("subject-too-many-attempts", "1008");
        var invalid = JsonNode.Parse(CompleteEnvelopeJson)!;
        var template = invalid["state"]!["attempts"]![0]!;
        var attempts = new JsonArray();
        for (var index = 0; index < 31; index++)
        {
            var attempt = template.DeepClone();
            attempt["id"] = $"22222222-2222-4222-8222-{index:000000000000}";
            attempts.Add(attempt);
        }
        invalid["state"]!["attempts"] = attempts;

        using var response = await client.PostAsync(
            "/api/practice-state",
            new StringContent(invalid.ToJsonString(), Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        problem["code"]!.GetValue<string>().Should().Be("invalid_practice_state");
    }

    [Test]
    public async Task Identical_resend_returns_the_same_canonical_envelope_Async()
    {
        using var client = CreateClient("subject-idempotent", "1009");
        using var firstResponse = await client.PostAsync(
            "/api/practice-state",
            new StringContent(CompleteEnvelopeJson, Encoding.UTF8, "application/json"));
        var first = JsonNode.Parse(await firstResponse.Content.ReadAsStringAsync())!;

        using var secondResponse = await client.PostAsync(
            "/api/practice-state",
            new StringContent(CompleteEnvelopeJson, Encoding.UTF8, "application/json"));
        var second = JsonNode.Parse(await secondResponse.Content.ReadAsStringAsync())!;

        firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        JsonNode.DeepEquals(second, first).Should().BeTrue();
    }

    [Test]
    public async Task Practice_state_is_isolated_by_token_subject_Async()
    {
        using var firstUser = CreateClient("subject-isolated-a", "1010");
        using var secondUser = CreateClient("subject-isolated-b", "1011");
        using var save = await firstUser.PostAsync(
            "/api/practice-state",
            new StringContent(CompleteEnvelopeJson, Encoding.UTF8, "application/json"));

        using var loadOther = await secondUser.GetAsync("/api/practice-state");
        var otherState = JsonNode.Parse(await loadOther.Content.ReadAsStringAsync())!;

        save.StatusCode.Should().Be(HttpStatusCode.OK);
        loadOther.StatusCode.Should().Be(HttpStatusCode.OK);
        otherState["state"]!["activeAttempt"].Should().BeNull();
        otherState["state"]!["attempts"]!.AsArray().Should().BeEmpty();
    }

    [Test]
    public async Task Practice_state_endpoints_require_authentication_Async()
    {
        using var client = _factory.CreateClient();
        using var get = await client.GetAsync("/api/practice-state");
        using var post = await client.PostAsync(
            "/api/practice-state",
            new StringContent(CompleteEnvelopeJson, Encoding.UTF8, "application/json"));

        get.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        post.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [TestCase("unknown-option")]
    [TestCase("duplicate-question")]
    [TestCase("invalid-current-index")]
    [TestCase("invalid-attempt-id")]
    [TestCase("control-character")]
    [TestCase("invalid-activity-time")]
    [TestCase("orphan-receipt")]
    [TestCase("future-receipt")]
    public async Task Incoherent_practice_state_is_rejected_Async(string variation)
    {
        using var client = CreateClient($"subject-incoherent-{variation}", "1012");
        var invalid = JsonNode.Parse(CompleteEnvelopeJson)!;
        ApplyInvalidVariation(invalid, variation);

        using var response = await client.PostAsync(
            "/api/practice-state",
            new StringContent(invalid.ToJsonString(), Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        problem["code"]!.GetValue<string>().Should().Be("invalid_practice_state");
    }

    [Test]
    public async Task Generated_service_documentation_describes_the_practice_state_contract_Async()
    {
        using var client = _factory.CreateClient();

        using var response = await client.GetAsync("/swagger/v1/swagger.json");
        var document = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        document["paths"]!["/api/practice-state"]!["get"].Should().NotBeNull();
        document["paths"]!["/api/practice-state"]!["post"].Should().NotBeNull();
        var envelope = document["components"]!["schemas"]!["PracticeStateEnvelope"]!;
        envelope["properties"]!["schemaVersion"].Should().NotBeNull();
        envelope["properties"]!["state"].Should().NotBeNull();
        envelope["properties"]!["receipts"].Should().NotBeNull();
        SchemaProperties(document, "PracticeState").Should().BeEquivalentTo(
            "activeAttempt", "attempts", "bookmarks", "latestAnswers");
        SchemaProperties(document, "Attempt").Should().BeEquivalentTo(
            "id", "mode", "label", "questionIds", "answers", "flagged", "currentIndex",
            "startedAt", "durationMinutes", "pausedAt", "pausedDurationMs", "domains");
        SchemaProperties(document, "FinishedAttempt").Should().BeEquivalentTo(
            "id", "mode", "label", "questionIds", "answers", "flagged", "startedAt",
            "durationMinutes", "domains", "finishedAt", "score", "outcome");
        SchemaProperties(document, "PracticeStateReceipts").Should().BeEquivalentTo(
            "activeAttemptReceivedAt", "finishedAttempts", "bookmarks", "latestAnswers");
        SchemaProperties(document, "BookmarkReceipt").Should().BeEquivalentTo(
            "isBookmarked", "receivedAt");
    }

    private static IEnumerable<string> SchemaProperties(JsonNode document, string schemaName)
        => document["components"]!["schemas"]![schemaName]!["properties"]!.AsObject().Select(property => property.Key);

    private HttpClient CreateClient(string subject, string githubAccountId)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthenticationHandler.SubjectHeader, subject);
        client.DefaultRequestHeaders.Add(TestAuthenticationHandler.GitHubAccountHeader, githubAccountId);
        return client;
    }

    private static void ApplyInvalidVariation(JsonNode envelope, string variation)
    {
        var activeAttempt = envelope["state"]!["activeAttempt"]!;
        switch (variation)
        {
            case "unknown-option":
                activeAttempt["answers"]!["arch-001"] = new JsonArray("z");
                break;
            case "duplicate-question":
                activeAttempt["questionIds"]!.AsArray().Add("arch-001");
                break;
            case "invalid-current-index":
                activeAttempt["currentIndex"] = 2;
                break;
            case "invalid-attempt-id":
                activeAttempt["id"] = "not-a-canonical-uuid";
                break;
            case "control-character":
                activeAttempt["label"] = "bad\nlabel";
                break;
            case "invalid-activity-time":
                activeAttempt["startedAt"] = -1;
                break;
            case "orphan-receipt":
                envelope["receipts"]!["finishedAttempts"]!["33333333-3333-4333-8333-333333333333"] =
                    CanonicalReceipt(DateTimeOffset.UtcNow);
                break;
            case "future-receipt":
                envelope["receipts"]!["activeAttemptReceivedAt"] =
                    CanonicalReceipt(DateTimeOffset.UtcNow.AddMinutes(6));
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(variation), variation, null);
        }
    }

    private static string CanonicalReceipt(DateTimeOffset value)
        => value.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    private static async Task ApplyMigrationsAsync(string connectionString)
    {
        var root = FindRepositoryRoot();
        var migrations = Directory.GetFiles(
            Path.Combine(root, "backend", "tools", "Acn.Fde.Practice.Database", "Migrations"),
            "*.pgsql").Order();

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();
        foreach (var migration in migrations)
        {
            await using var command = new NpgsqlCommand(await File.ReadAllTextAsync(migration), connection);
            await command.ExecuteNonQueryAsync();
        }
    }

    private static string FindRepositoryRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null && !File.Exists(Path.Combine(current.FullName, "package.json")))
            current = current.Parent;

        return current?.FullName ?? throw new InvalidOperationException("The repository root could not be found.");
    }

    private const string CompleteEnvelopeJson = """
        {
          "schemaVersion": 2,
          "state": {
            "activeAttempt": {
              "id": "11111111-1111-4111-8111-111111111111",
              "mode": "full",
              "label": "Full practice",
              "questionIds": ["arch-001", "arch-002"],
              "answers": { "arch-001": ["a"] },
              "flagged": ["arch-002"],
              "currentIndex": 1,
              "startedAt": 1767225600000,
              "durationMinutes": 120,
              "pausedAt": 1767225660000,
              "pausedDurationMs": 60000,
              "domains": ["architecture"]
            },
            "attempts": [{
              "id": "22222222-2222-4222-8222-222222222222",
              "mode": "quick",
              "label": "Quick practice",
              "questionIds": ["arch-003"],
              "answers": { "arch-003": ["a", "b"] },
              "flagged": [],
              "startedAt": 1767139200000,
              "durationMinutes": 30,
              "finishedAt": 1767141000000,
              "score": 100,
              "outcome": "submitted"
            }],
            "bookmarks": ["arch-003"],
            "latestAnswers": { "arch-001": ["a"], "arch-003": ["a", "b"] }
          },
          "receipts": {
            "finishedAttempts": {},
            "bookmarks": { "arch-003": { "isBookmarked": true } },
            "latestAnswers": {}
          }
        }
        """;

    private sealed class PracticeApiFactory(string connectionString)
        : WebApplicationFactory<Acn.Fde.Practice.Api.Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("ConnectionStrings:Postgres", connectionString);
            builder.ConfigureTestServices(services =>
            {
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = TestAuthenticationHandler.AuthenticationSchemeName;
                    options.DefaultChallengeScheme = TestAuthenticationHandler.AuthenticationSchemeName;
                }).AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>(
                    TestAuthenticationHandler.AuthenticationSchemeName,
                    _ => { });
            });
        }
    }

    private sealed class TestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string AuthenticationSchemeName = "PracticeTest";
        public const string SubjectHeader = "X-Test-Subject";
        public const string GitHubAccountHeader = "X-Test-GitHub-Account";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var subject = Request.Headers[SubjectHeader].SingleOrDefault();
            var githubAccountId = Request.Headers[GitHubAccountHeader].SingleOrDefault();
            if (string.IsNullOrWhiteSpace(subject) || string.IsNullOrWhiteSpace(githubAccountId))
                return Task.FromResult(AuthenticateResult.NoResult());

            var identity = new ClaimsIdentity([
                new Claim("sub", subject),
                new Claim(IdentityAuthentication.GitHubAccountIdClaim, githubAccountId),
            ], AuthenticationSchemeName);
            return Task.FromResult(AuthenticateResult.Success(
                new AuthenticationTicket(new ClaimsPrincipal(identity), AuthenticationSchemeName)));
        }
    }

    private sealed class UnknownLengthJsonContent : HttpContent
    {
        private readonly byte[] _body;

        public UnknownLengthJsonContent(byte[] body)
        {
            _body = body;
            Headers.ContentType = new MediaTypeHeaderValue("application/json")
            {
                CharSet = "utf-8",
            };
        }

        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context)
            => stream.WriteAsync(_body).AsTask();

        protected override bool TryComputeLength(out long length)
        {
            length = 0;
            return false;
        }

        protected override Task<Stream> CreateContentReadStreamAsync()
            => Task.FromResult<Stream>(new MemoryStream(_body, writable: false));
    }
}
