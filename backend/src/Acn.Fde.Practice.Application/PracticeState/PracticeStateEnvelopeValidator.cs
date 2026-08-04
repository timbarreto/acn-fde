using Acn.Fde.Practice.Contracts;

namespace Acn.Fde.Practice.Application.PracticeState;

internal static class PracticeStateEnvelopeValidator
{
    private const long MaximumJavaScriptTime = 8_640_000_000_000_000;
    private const long MaximumSafeInteger = 9_007_199_254_740_991;

    public static Result Validate(PracticeStateEnvelope envelope, DateTimeOffset serverNow)
    {
        if (envelope.SchemaVersion != 2)
        {
            return Result.ValidationError(
                "The practice state schema version is unsupported.",
                exception => exception.WithErrorCode("unsupported_schema_version"));
        }

        var state = envelope.State;
        var receipts = envelope.Receipts;
        var manifest = QuestionRecognitionManifest.Current;
        if (state.Attempts.Count > 30
            || state.Bookmarks.Count > 128
            || state.LatestAnswers.Count > 128
            || receipts.FinishedAttempts.Count > 30
            || receipts.Bookmarks.Count > 128
            || receipts.LatestAnswers.Count > 128)
        {
            return Invalid();
        }

        if (state.ActiveAttempt is not null && !ActiveAttemptIsValid(state.ActiveAttempt, manifest))
            return Invalid();

        if (state.Attempts.Any(attempt => attempt is null || !FinishedAttemptIsValid(attempt, manifest)))
            return Invalid();

        var finishedAttemptIds = state.Attempts.Select(attempt => attempt.Id).ToArray();
        if (finishedAttemptIds.Distinct(StringComparer.Ordinal).Count() != finishedAttemptIds.Length
            || state.ActiveAttempt is not null && finishedAttemptIds.Contains(state.ActiveAttempt.Id, StringComparer.Ordinal))
        {
            return Invalid();
        }

        if (!AnswersAreRecognized(state.LatestAnswers, manifest)
            || !Unique(state.Bookmarks)
            || state.Bookmarks.Any(bookmark => !ValidQuestionId(bookmark, manifest))
            || receipts.Bookmarks.Any(pair => !ValidQuestionId(pair.Key, manifest) || pair.Value is null)
            || receipts.Bookmarks.Any(pair => state.Bookmarks.Contains(pair.Key, StringComparer.Ordinal) != pair.Value.IsBookmarked)
            || receipts.LatestAnswers.Keys.Any(questionId => !state.LatestAnswers.ContainsKey(questionId))
            || receipts.FinishedAttempts.Keys.Any(attemptId => !finishedAttemptIds.Contains(attemptId, StringComparer.Ordinal))
            || receipts.ActiveAttemptReceivedAt is not null && state.ActiveAttempt is null)
        {
            return Invalid();
        }

        var maximumReceipt = serverNow.ToUniversalTime().AddMinutes(5);
        if (!ValidReceipt(receipts.ActiveAttemptReceivedAt, maximumReceipt)
            || receipts.FinishedAttempts.Values.Any(receipt => !ValidReceipt(receipt, maximumReceipt))
            || receipts.LatestAnswers.Values.Any(receipt => !ValidReceipt(receipt, maximumReceipt))
            || receipts.Bookmarks.Values.Any(receipt => !ValidReceipt(receipt.ReceivedAt, maximumReceipt)))
        {
            return Invalid();
        }

        return Result.Success;
    }

    private static bool ActiveAttemptIsValid(Attempt attempt, QuestionRecognitionManifest manifest)
        => AttemptIsValid(
            attempt.Id,
            attempt.Label,
            attempt.QuestionIds,
            attempt.Answers,
            attempt.Flagged,
            attempt.StartedAt,
            attempt.DurationMinutes,
            attempt.Domains,
            manifest)
            && attempt.CurrentIndex >= 0
            && attempt.CurrentIndex < attempt.QuestionIds.Count
            && ValidJavaScriptTime(attempt.PausedAt)
            && (attempt.PausedAt is null || attempt.PausedAt >= attempt.StartedAt)
            && attempt.PausedDurationMs is null or >= 0 and <= MaximumSafeInteger;

    private static bool FinishedAttemptIsValid(FinishedAttempt attempt, QuestionRecognitionManifest manifest)
        => AttemptIsValid(
            attempt.Id,
            attempt.Label,
            attempt.QuestionIds,
            attempt.Answers,
            attempt.Flagged,
            attempt.StartedAt,
            attempt.DurationMinutes,
            attempt.Domains,
            manifest)
            && ValidJavaScriptTime(attempt.FinishedAt)
            && attempt.FinishedAt >= attempt.StartedAt
            && attempt.Score is >= 0 and <= 100;

    private static bool AttemptIsValid(
        string id,
        string label,
        IEnumerable<string> questionIds,
        IReadOnlyDictionary<string, string[]> answers,
        IEnumerable<string> flagged,
        long startedAt,
        int durationMinutes,
        IReadOnlyCollection<DomainId>? domains,
        QuestionRecognitionManifest manifest)
    {
        var questionList = questionIds.ToArray();
        var flagList = flagged.ToArray();
        var questions = questionList.ToHashSet(StringComparer.Ordinal);
        return Guid.TryParseExact(id, "D", out var parsedId)
            && parsedId.ToString("D") == id
            && label.Length <= 128
            && !label.Any(char.IsControl)
            && questionList.Length is > 0 and <= 128
            && questions.Count == questionList.Length
            && answers.Count <= 128
            && flagList.Length <= 128
            && Unique(flagList)
            && questionList.All(questionId => ValidQuestionId(questionId, manifest))
            && answers.Keys.All(questions.Contains)
            && flagList.All(questions.Contains)
            && AnswersAreRecognized(answers, manifest)
            && ValidJavaScriptTime(startedAt)
            && durationMinutes is >= 1 and <= 1_440
            && (domains is null || domains.Count <= 6 && domains.Distinct().Count() == domains.Count);
    }

    private static bool AnswersAreRecognized(
        IReadOnlyDictionary<string, string[]> answers,
        QuestionRecognitionManifest manifest)
        => answers.All(answer => ValidQuestionId(answer.Key, manifest)
            && manifest.IsValidAnswer(answer.Key, answer.Value));

    private static bool ValidQuestionId(string questionId, QuestionRecognitionManifest manifest)
        => !string.IsNullOrEmpty(questionId)
            && questionId.Length <= 64
            && manifest.ContainsQuestion(questionId);

    private static bool ValidJavaScriptTime(long value) => value is >= 0 and <= MaximumJavaScriptTime;

    private static bool ValidJavaScriptTime(long? value) => value is null || ValidJavaScriptTime(value.Value);

    private static bool ValidReceipt(DateTimeOffset? receipt, DateTimeOffset maximum)
        => receipt is null
            || receipt.Value.Offset == TimeSpan.Zero
                && receipt.Value.Ticks % TimeSpan.TicksPerMillisecond == 0
                && receipt.Value <= maximum;

    private static bool Unique(IEnumerable<string> values)
    {
        var array = values.ToArray();
        return array.Distinct(StringComparer.Ordinal).Count() == array.Length;
    }

    private static Result Invalid() => Result.ValidationError(
        "The practice state is invalid.",
        exception => exception.WithErrorCode("invalid_practice_state"));
}
