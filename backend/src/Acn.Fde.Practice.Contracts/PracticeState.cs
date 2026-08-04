namespace Acn.Fde.Practice.Contracts;

public enum AttemptMode
{
    Full,
    Quick,
    Domain,
}

public enum AttemptOutcome
{
    Submitted,
    Expired,
    Abandoned,
}

public enum DomainId
{
    Architecture,
    Tools,
    Memory,
    Evaluation,
    Orchestration,
    Guardrails,
}

public class Attempt
{
    [JsonRequired]
    public string Id { get; set; } = string.Empty;
    [JsonRequired]
    public AttemptMode Mode { get; set; }
    [JsonRequired]
    public string Label { get; set; } = string.Empty;
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public List<string> QuestionIds { get; set => field = value ?? []; } = [];
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public Dictionary<string, string[]> Answers { get; set => field = value ?? []; } = [];
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public List<string> Flagged { get; set => field = value ?? []; } = [];
    [JsonRequired]
    public int CurrentIndex { get; set; }
    [JsonRequired]
    public long StartedAt { get; set; }
    [JsonRequired]
    public int DurationMinutes { get; set; }
    public long? PausedAt { get; set; }
    public long? PausedDurationMs { get; set; }
    public List<DomainId>? Domains { get; set; }
}

public class FinishedAttempt
{
    [JsonRequired]
    public string Id { get; set; } = string.Empty;
    [JsonRequired]
    public AttemptMode Mode { get; set; }
    [JsonRequired]
    public string Label { get; set; } = string.Empty;
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public List<string> QuestionIds { get; set => field = value ?? []; } = [];
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public Dictionary<string, string[]> Answers { get; set => field = value ?? []; } = [];
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public List<string> Flagged { get; set => field = value ?? []; } = [];
    [JsonRequired]
    public long StartedAt { get; set; }
    [JsonRequired]
    public int DurationMinutes { get; set; }
    public List<DomainId>? Domains { get; set; }
    [JsonRequired]
    public long FinishedAt { get; set; }
    [JsonRequired]
    public int Score { get; set; }
    [JsonRequired]
    public AttemptOutcome Outcome { get; set; }
}

public class PracticeState
{
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public Attempt? ActiveAttempt { get; set; }
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public List<FinishedAttempt> Attempts { get; set => field = value ?? []; } = [];
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public List<string> Bookmarks { get; set => field = value ?? []; } = [];
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public Dictionary<string, string[]> LatestAnswers { get; set => field = value ?? []; } = [];
}

public class BookmarkReceipt
{
    [JsonRequired]
    public bool IsBookmarked { get; set; }
    public DateTimeOffset? ReceivedAt { get; set; }
}

public class PracticeStateReceipts
{
    public DateTimeOffset? ActiveAttemptReceivedAt { get; set; }
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public Dictionary<string, DateTimeOffset> FinishedAttempts { get; set => field = value ?? []; } = [];
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public Dictionary<string, BookmarkReceipt> Bookmarks { get; set => field = value ?? []; } = [];
    [JsonRequired]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public Dictionary<string, DateTimeOffset> LatestAnswers { get; set => field = value ?? []; } = [];
}

public class PracticeStateEnvelope
{
    [JsonRequired]
    public int SchemaVersion { get; set; }
    [JsonRequired]
    public PracticeState State { get; set => field = value ?? new(); } = new();
    [JsonRequired]
    public PracticeStateReceipts Receipts { get; set => field = value ?? new(); } = new();
}
