using Acn.Fde.Practice.Contracts;
using System.Text.Json;

namespace Acn.Fde.Practice.Application.PracticeState;

[ScopedService<IPracticeStateMerger>]
public sealed class PracticeStateMerger : IPracticeStateMerger
{
    public PracticeStateEnvelope Merge(
        PracticeStateEnvelope stored,
        PracticeStateEnvelope incoming,
        DateTimeOffset receivedAt)
    {
        stored.ThrowIfNull();
        incoming.ThrowIfNull();

        var (latestAnswers, latestAnswerReceipts) = MergeLatestAnswers(stored, incoming, receivedAt);
        var bookmarkReceipts = MergeBookmarks(stored, incoming, receivedAt);
        var attempts = MergeAttempts(stored, incoming, receivedAt);
        return new PracticeStateEnvelope
        {
            SchemaVersion = 2,
            State = new Contracts.PracticeState
            {
                LatestAnswers = latestAnswers,
                Bookmarks = bookmarkReceipts
                    .Where(pair => pair.Value.IsBookmarked)
                    .Select(pair => pair.Key)
                    .Order(StringComparer.Ordinal)
                    .ToList(),
                ActiveAttempt = attempts.ActiveAttempt,
                Attempts = attempts.FinishedAttempts.Select(version => version.Attempt).ToList(),
            },
            Receipts = new PracticeStateReceipts
            {
                LatestAnswers = latestAnswerReceipts,
                Bookmarks = bookmarkReceipts,
                ActiveAttemptReceivedAt = attempts.ActiveAttemptReceivedAt,
                FinishedAttempts = attempts.FinishedAttempts.ToDictionary(
                    version => version.Attempt.Id,
                    version => version.FirstReceivedAt,
                    StringComparer.Ordinal),
            },
        };
    }

    private static AttemptMergeResult MergeAttempts(
        PracticeStateEnvelope stored,
        PracticeStateEnvelope incoming,
        DateTimeOffset receivedAt)
    {
        var attempts = new Dictionary<string, FinishedAttemptVersion>(StringComparer.Ordinal);
        foreach (var attempt in stored.State.Attempts)
        {
            var receipt = stored.Receipts.FinishedAttempts.GetValueOrDefault(attempt.Id, receivedAt);
            attempts[attempt.Id] = new FinishedAttemptVersion(attempt, receipt);
        }

        foreach (var attempt in incoming.State.Attempts)
        {
            var receipt = incoming.Receipts.FinishedAttempts.GetValueOrDefault(attempt.Id, receivedAt);
            if (!attempts.TryGetValue(attempt.Id, out var existing))
            {
                attempts[attempt.Id] = new FinishedAttemptVersion(attempt, receipt);
                continue;
            }

            if (receipt < existing.FirstReceivedAt)
                attempts[attempt.Id] = existing with { FirstReceivedAt = receipt };
        }

        var storedActive = ActiveVersion(stored, receivedAt);
        var incomingActive = ActiveVersion(incoming, receivedAt);
        if (storedActive is not null && attempts.ContainsKey(storedActive.Attempt.Id))
            storedActive = null;
        if (incomingActive is not null && attempts.ContainsKey(incomingActive.Attempt.Id))
            incomingActive = null;
        var active = Newest(storedActive, incomingActive);
        var loser = ReferenceEquals(active, storedActive) ? incomingActive : storedActive;

        if (loser is not null
            && active?.Attempt.Id != loser.Attempt.Id
            && !attempts.ContainsKey(loser.Attempt.Id))
        {
            attempts[loser.Attempt.Id] = new FinishedAttemptVersion(
                FinishAsAbandoned(loser),
                receivedAt);
        }

        if (active is not null && attempts.ContainsKey(active.Attempt.Id))
            active = null;

        var retained = attempts.Values
            .OrderByDescending(version => Math.Min(
                version.Attempt.FinishedAt,
                version.FirstReceivedAt.ToUnixTimeMilliseconds()))
            .ThenBy(version => version.Attempt.Id, StringComparer.Ordinal)
            .Take(30)
            .ToList();

        return new AttemptMergeResult(active?.Attempt, active?.ReceivedAt, retained);
    }

    private static ActiveAttemptVersion? ActiveVersion(
        PracticeStateEnvelope envelope,
        DateTimeOffset receivedAt)
        => envelope.State.ActiveAttempt is null
            ? null
            : new ActiveAttemptVersion(
                envelope.State.ActiveAttempt,
                envelope.Receipts.ActiveAttemptReceivedAt ?? receivedAt,
                envelope.Receipts.ActiveAttemptReceivedAt is null);

    private static ActiveAttemptVersion? Newest(
        ActiveAttemptVersion? stored,
        ActiveAttemptVersion? incoming)
    {
        if (stored is null)
            return incoming;
        if (incoming is null)
            return stored;
        if (stored.Attempt.Id == incoming.Attempt.Id)
        {
            if (incoming.IsUnstamped)
            {
                return AttemptsAreEqual(stored.Attempt, incoming.Attempt)
                    ? stored
                    : incoming with { ReceivedAt = NextReceipt(incoming.ReceivedAt, stored.ReceivedAt) };
            }
            return incoming.ReceivedAt > stored.ReceivedAt ? incoming : stored;
        }
        if (incoming.IsUnstamped)
            return incoming with { ReceivedAt = NextReceipt(incoming.ReceivedAt, stored.ReceivedAt) };
        if (incoming.ReceivedAt != stored.ReceivedAt)
            return incoming.ReceivedAt > stored.ReceivedAt ? incoming : stored;
        return StringComparer.Ordinal.Compare(incoming.Attempt.Id, stored.Attempt.Id) > 0 ? incoming : stored;
    }

    private static bool AttemptsAreEqual(Attempt left, Attempt right)
        => JsonSerializer.Serialize(left, JsonDefaults.SerializerOptions)
            == JsonSerializer.Serialize(right, JsonDefaults.SerializerOptions);

    private static FinishedAttempt FinishAsAbandoned(ActiveAttemptVersion version)
        => new()
        {
            Id = version.Attempt.Id,
            Mode = version.Attempt.Mode,
            Label = version.Attempt.Label,
            QuestionIds = [.. version.Attempt.QuestionIds],
            Answers = version.Attempt.Answers.ToDictionary(
                pair => pair.Key,
                pair => pair.Value.ToArray(),
                StringComparer.Ordinal),
            Flagged = [.. version.Attempt.Flagged],
            StartedAt = version.Attempt.StartedAt,
            DurationMinutes = version.Attempt.DurationMinutes,
            Domains = version.Attempt.Domains is null ? null : [.. version.Attempt.Domains],
            FinishedAt = Math.Max(version.Attempt.StartedAt, version.ReceivedAt.ToUnixTimeMilliseconds()),
            Score = QuestionRecognitionManifest.Current.CalculateScore(version.Attempt),
            Outcome = AttemptOutcome.Abandoned,
        };

    private static Dictionary<string, BookmarkReceipt> MergeBookmarks(
        PracticeStateEnvelope stored,
        PracticeStateEnvelope incoming,
        DateTimeOffset receivedAt)
    {
        var receipts = stored.Receipts.Bookmarks.ToDictionary(
            pair => pair.Key,
            pair => Copy(pair.Value),
            StringComparer.Ordinal);

        foreach (var (questionId, incomingBookmark) in incoming.Receipts.Bookmarks)
        {
            if (incomingBookmark.ReceivedAt is null
                && receipts.TryGetValue(questionId, out var acceptedBookmark)
                && incomingBookmark.IsBookmarked == acceptedBookmark.IsBookmarked)
            {
                continue;
            }

            if (!receipts.TryGetValue(questionId, out var storedBookmark)
                || incomingBookmark.ReceivedAt is null
                || storedBookmark.ReceivedAt is null
                || incomingBookmark.ReceivedAt > storedBookmark.ReceivedAt
                || incomingBookmark.ReceivedAt == storedBookmark.ReceivedAt
                    && !incomingBookmark.IsBookmarked && storedBookmark.IsBookmarked)
            {
                receipts[questionId] = new BookmarkReceipt
                {
                    IsBookmarked = incomingBookmark.IsBookmarked,
                    ReceivedAt = incomingBookmark.ReceivedAt
                        ?? NextReceipt(receivedAt, storedBookmark?.ReceivedAt),
                };
            }
        }

        foreach (var questionId in incoming.State.Bookmarks)
        {
            if (!incoming.Receipts.Bookmarks.ContainsKey(questionId)
                && (!receipts.TryGetValue(questionId, out var acceptedBookmark)
                    || !acceptedBookmark.IsBookmarked))
            {
                receipts[questionId] = new BookmarkReceipt
                {
                    IsBookmarked = true,
                    ReceivedAt = NextReceipt(receivedAt, acceptedBookmark?.ReceivedAt),
                };
            }
        }

        return receipts;
    }

    private static BookmarkReceipt Copy(BookmarkReceipt source)
        => new() { IsBookmarked = source.IsBookmarked, ReceivedAt = source.ReceivedAt };

    private static (Dictionary<string, string[]> Answers, Dictionary<string, DateTimeOffset> Receipts)
        MergeLatestAnswers(
            PracticeStateEnvelope stored,
            PracticeStateEnvelope incoming,
            DateTimeOffset receivedAt)
    {
        var answers = new Dictionary<string, string[]>(stored.State.LatestAnswers, StringComparer.Ordinal);
        var receipts = new Dictionary<string, DateTimeOffset>(stored.Receipts.LatestAnswers, StringComparer.Ordinal);

        foreach (var (questionId, incomingAnswer) in incoming.State.LatestAnswers)
        {
            var hasIncomingReceipt = incoming.Receipts.LatestAnswers.TryGetValue(questionId, out var incomingReceipt);
            if (!hasIncomingReceipt
                && answers.TryGetValue(questionId, out var acceptedAnswer)
                && AnswersEqual(incomingAnswer, acceptedAnswer))
            {
                continue;
            }

            var hasStoredReceipt = receipts.TryGetValue(questionId, out var storedReceipt);
            if (!answers.TryGetValue(questionId, out var storedAnswer)
                || !hasStoredReceipt
                || !hasIncomingReceipt
                || incomingReceipt > storedReceipt
                || incomingReceipt == storedReceipt && CompareAnswers(incomingAnswer, storedAnswer) > 0)
            {
                answers[questionId] = [.. incomingAnswer];
                receipts[questionId] = hasIncomingReceipt
                    ? incomingReceipt
                    : NextReceipt(receivedAt, hasStoredReceipt ? storedReceipt : null);
            }
        }

        return (answers, receipts);
    }

    private static bool AnswersEqual(IReadOnlyCollection<string> left, IReadOnlyCollection<string> right)
        => left.Count == right.Count
            && left.Order(StringComparer.Ordinal).SequenceEqual(right.Order(StringComparer.Ordinal));

    private static DateTimeOffset NextReceipt(DateTimeOffset receivedAt, DateTimeOffset? previousReceipt)
        => previousReceipt is not null && receivedAt <= previousReceipt
            ? previousReceipt.Value.AddMilliseconds(1)
            : receivedAt;

    private static int CompareAnswers(IReadOnlyList<string> left, IReadOnlyList<string> right)
    {
        for (var index = 0; index < Math.Min(left.Count, right.Count); index++)
        {
            var comparison = StringComparer.Ordinal.Compare(left[index], right[index]);
            if (comparison != 0)
                return comparison;
        }

        return left.Count.CompareTo(right.Count);
    }

    private sealed record FinishedAttemptVersion(
        FinishedAttempt Attempt,
        DateTimeOffset FirstReceivedAt);

    private sealed record ActiveAttemptVersion(
        Attempt Attempt,
        DateTimeOffset ReceivedAt,
        bool IsUnstamped);

    private sealed record AttemptMergeResult(
        Attempt? ActiveAttempt,
        DateTimeOffset? ActiveAttemptReceivedAt,
        List<FinishedAttemptVersion> FinishedAttempts);
}
