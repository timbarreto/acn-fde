using Acn.Fde.Practice.Application.PracticeState;
using Acn.Fde.Practice.Contracts;

namespace Acn.Fde.Practice.Test.Api;

public sealed class PracticeStateMergerTests
{
    [Test]
    public void Latest_answers_converge_independently_by_receipt()
    {
        var firstReceipt = Receipt(1);
        var secondReceipt = Receipt(2);
        var thirdReceipt = Receipt(3);
        var stored = Envelope(
            latestAnswers: new Dictionary<string, string[]>
            {
                ["arch-001"] = ["a"],
                ["arch-002"] = ["b"],
            },
            latestAnswerReceipts: new Dictionary<string, DateTimeOffset>
            {
                ["arch-001"] = firstReceipt,
                ["arch-002"] = thirdReceipt,
            });
        var incoming = Envelope(
            latestAnswers: new Dictionary<string, string[]>
            {
                ["arch-001"] = ["b"],
                ["arch-002"] = ["a"],
            },
            latestAnswerReceipts: new Dictionary<string, DateTimeOffset>
            {
                ["arch-001"] = secondReceipt,
                ["arch-002"] = secondReceipt,
            });

        var merged = new PracticeStateMerger().Merge(stored, incoming, Receipt(4));

        merged.State.LatestAnswers["arch-001"].Should().Equal("b");
        merged.Receipts.LatestAnswers["arch-001"].Should().Be(secondReceipt);
        merged.State.LatestAnswers["arch-002"].Should().Equal("b");
        merged.Receipts.LatestAnswers["arch-002"].Should().Be(thirdReceipt);
    }

    [Test]
    public void Bookmark_tombstones_converge_by_receipt()
    {
        var firstReceipt = Receipt(1);
        var secondReceipt = Receipt(2);
        var thirdReceipt = Receipt(3);
        var stored = Envelope(
            bookmarks: ["arch-001"],
            bookmarkReceipts: new Dictionary<string, BookmarkReceipt>
            {
                ["arch-001"] = Bookmark(true, firstReceipt),
                ["arch-002"] = Bookmark(false, secondReceipt),
            });
        var incoming = Envelope(
            bookmarks: ["arch-002"],
            bookmarkReceipts: new Dictionary<string, BookmarkReceipt>
            {
                ["arch-001"] = Bookmark(false, thirdReceipt),
                ["arch-002"] = Bookmark(true, firstReceipt),
            });

        var merged = new PracticeStateMerger().Merge(stored, incoming, Receipt(4));

        merged.State.Bookmarks.Should().BeEmpty();
        merged.Receipts.Bookmarks["arch-001"].IsBookmarked.Should().BeFalse();
        merged.Receipts.Bookmarks["arch-001"].ReceivedAt.Should().Be(thirdReceipt);
        merged.Receipts.Bookmarks["arch-002"].IsBookmarked.Should().BeFalse();
        merged.Receipts.Bookmarks["arch-002"].ReceivedAt.Should().Be(secondReceipt);
    }

    [Test]
    public void Finished_attempts_union_and_retain_the_newest_thirty_by_bounded_retention_time()
    {
        var storedAttempts = Enumerable.Range(1, 30)
            .Select(index => FinishedAttempt(index, finishedMinute: index))
            .ToList();
        var stored = Envelope(
            attempts: storedAttempts,
            finishedAttemptReceipts: storedAttempts.ToDictionary(
                attempt => attempt.Id,
                attempt => DateTimeOffset.FromUnixTimeMilliseconds(attempt.FinishedAt)));
        var recent = FinishedAttempt(31, finishedMinute: 31);
        var futureClock = FinishedAttempt(32, finishedMinute: 10_000);
        var incoming = Envelope(
            attempts: [recent, futureClock],
            finishedAttemptReceipts: new Dictionary<string, DateTimeOffset>
            {
                [recent.Id] = Receipt(31),
                [futureClock.Id] = Receipt(0),
            });

        var merged = new PracticeStateMerger().Merge(stored, incoming, Receipt(32));

        merged.State.Attempts.Should().HaveCount(30);
        merged.State.Attempts.Select(attempt => attempt.Id).Should().Contain(recent.Id);
        merged.State.Attempts.Select(attempt => attempt.Id).Should().NotContain(futureClock.Id);
        merged.State.Attempts.Select(attempt => attempt.Id).Should().NotContain(storedAttempts[0].Id);
        merged.Receipts.FinishedAttempts.Keys.Should().BeEquivalentTo(
            merged.State.Attempts.Select(attempt => attempt.Id));
    }

    [Test]
    public void Newer_active_attempt_wins_and_the_loser_is_scored_and_finished_as_abandoned()
    {
        var losingAttempt = ActiveAttempt(41, "arch-001", "b");
        var winningAttempt = ActiveAttempt(42, "arch-002", "a");
        var stored = Envelope(activeAttempt: losingAttempt, activeAttemptReceipt: Receipt(1));
        var incoming = Envelope(activeAttempt: winningAttempt, activeAttemptReceipt: Receipt(2));

        var merged = new PracticeStateMerger().Merge(stored, incoming, Receipt(3));

        merged.State.ActiveAttempt.Should().BeSameAs(winningAttempt);
        merged.Receipts.ActiveAttemptReceivedAt.Should().Be(Receipt(2));
        merged.State.Attempts.Should().ContainSingle();
        merged.State.Attempts[0].Should().BeEquivalentTo(new
        {
            losingAttempt.Id,
            losingAttempt.Mode,
            losingAttempt.Label,
            losingAttempt.QuestionIds,
            losingAttempt.Answers,
            losingAttempt.Flagged,
            losingAttempt.StartedAt,
            losingAttempt.DurationMinutes,
            losingAttempt.Domains,
            FinishedAt = Receipt(1).ToUnixTimeMilliseconds(),
            Score = 100,
            Outcome = AttemptOutcome.Abandoned,
        });
        merged.Receipts.FinishedAttempts[losingAttempt.Id].Should().Be(Receipt(3));
    }

    [Test]
    public void Repeating_the_same_exchange_is_a_no_op()
    {
        var finished = FinishedAttempt(51, finishedMinute: 1);
        var rawIncoming = Envelope(
            latestAnswers: new Dictionary<string, string[]> { ["arch-001"] = ["b"] },
            bookmarks: ["arch-002"],
            attempts: [finished],
            activeAttempt: ActiveAttempt(52, "arch-003", "a"));
        var merger = new PracticeStateMerger();
        var first = merger.Merge(Envelope(), rawIncoming, Receipt(2));

        var second = merger.Merge(first, rawIncoming, Receipt(3));

        second.Should().BeEquivalentTo(first);
    }

    [Test]
    public void Stale_finished_copy_is_cleared_before_it_can_displace_an_active_attempt()
    {
        var finished = FinishedAttempt(61, finishedMinute: 1);
        var legitimateActive = ActiveAttempt(62, "arch-001", "b");
        var staleActive = ActiveAttempt(61, "arch-001", "a");
        var stored = Envelope(
            attempts: [finished],
            finishedAttemptReceipts: new Dictionary<string, DateTimeOffset>
            {
                [finished.Id] = Receipt(1),
            },
            activeAttempt: legitimateActive,
            activeAttemptReceipt: Receipt(2));
        var incoming = Envelope(activeAttempt: staleActive, activeAttemptReceipt: Receipt(3));

        var merged = new PracticeStateMerger().Merge(stored, incoming, Receipt(4));

        merged.State.ActiveAttempt.Should().BeSameAs(legitimateActive);
        merged.State.Attempts.Should().ContainSingle().Which.Id.Should().Be(finished.Id);
    }

    [Test]
    public void Unstamped_active_attempt_revision_wins_when_server_receipt_milliseconds_tie()
    {
        var storedActive = ActiveAttempt(71, "arch-001", "a");
        var revisedActive = ActiveAttempt(71, "arch-001", "b");
        var stored = Envelope(activeAttempt: storedActive, activeAttemptReceipt: Receipt(1));
        var incoming = Envelope(activeAttempt: revisedActive);

        var merged = new PracticeStateMerger().Merge(stored, incoming, Receipt(1));

        merged.State.ActiveAttempt.Should().BeSameAs(revisedActive);
        merged.Receipts.ActiveAttemptReceivedAt.Should().Be(Receipt(1).AddMilliseconds(1));
    }

    [Test]
    public void Unstamped_new_active_attempt_wins_when_server_receipt_milliseconds_tie()
    {
        var storedActive = ActiveAttempt(73, "arch-001", "a");
        var newActive = ActiveAttempt(72, "arch-002", "b");
        var stored = Envelope(activeAttempt: storedActive, activeAttemptReceipt: Receipt(1));
        var incoming = Envelope(activeAttempt: newActive);

        var merged = new PracticeStateMerger().Merge(stored, incoming, Receipt(1));

        merged.State.ActiveAttempt.Should().BeSameAs(newActive);
        merged.State.Attempts.Should().ContainSingle().Which.Id.Should().Be(storedActive.Id);
    }

    [Test]
    public void Same_millisecond_local_answer_cannot_be_reverted_by_replaying_the_older_canonical_version()
    {
        var oldCanonical = Envelope(
            latestAnswers: new Dictionary<string, string[]> { ["arch-001"] = ["b"] },
            latestAnswerReceipts: new Dictionary<string, DateTimeOffset>
            {
                ["arch-001"] = Receipt(1),
            });
        var localRevision = Envelope(
            latestAnswers: new Dictionary<string, string[]> { ["arch-001"] = ["a"] });
        var merger = new PracticeStateMerger();
        var acceptedRevision = merger.Merge(oldCanonical, localRevision, Receipt(1));

        var replayed = merger.Merge(acceptedRevision, oldCanonical, Receipt(2));

        acceptedRevision.Receipts.LatestAnswers["arch-001"].Should().BeAfter(Receipt(1));
        replayed.State.LatestAnswers["arch-001"].Should().Equal("a");
        replayed.Should().BeEquivalentTo(acceptedRevision);
    }

    [Test]
    public void Active_collision_is_resolved_before_the_sixty_one_attempt_union_is_capped()
    {
        var storedAttempts = Enumerable.Range(1, 30)
            .Select(index => FinishedAttempt(index, finishedMinute: index))
            .ToList();
        var incomingAttempts = Enumerable.Range(31, 30)
            .Select(index => FinishedAttempt(index, finishedMinute: index))
            .ToList();
        var losingActive = ActiveAttempt(100, "arch-001", "b");
        var winningActive = ActiveAttempt(101, "arch-002", "b");
        var stored = Envelope(
            attempts: storedAttempts,
            finishedAttemptReceipts: storedAttempts.ToDictionary(
                attempt => attempt.Id,
                attempt => DateTimeOffset.FromUnixTimeMilliseconds(attempt.FinishedAt)),
            activeAttempt: losingActive,
            activeAttemptReceipt: Receipt(100));
        var incoming = Envelope(
            attempts: incomingAttempts,
            finishedAttemptReceipts: incomingAttempts.ToDictionary(
                attempt => attempt.Id,
                attempt => DateTimeOffset.FromUnixTimeMilliseconds(attempt.FinishedAt)),
            activeAttempt: winningActive,
            activeAttemptReceipt: Receipt(101));

        var merged = new PracticeStateMerger().Merge(stored, incoming, Receipt(102));

        merged.State.ActiveAttempt.Should().BeSameAs(winningActive);
        merged.State.Attempts.Should().HaveCount(30);
        merged.State.Attempts.Should().ContainSingle(attempt =>
            attempt.Id == losingActive.Id && attempt.Outcome == AttemptOutcome.Abandoned);
        merged.Receipts.FinishedAttempts.Should().HaveCount(30);
    }

    private static PracticeStateEnvelope Envelope(
        Dictionary<string, string[]>? latestAnswers = null,
        Dictionary<string, DateTimeOffset>? latestAnswerReceipts = null,
        List<string>? bookmarks = null,
        Dictionary<string, BookmarkReceipt>? bookmarkReceipts = null,
        List<FinishedAttempt>? attempts = null,
        Dictionary<string, DateTimeOffset>? finishedAttemptReceipts = null,
        Attempt? activeAttempt = null,
        DateTimeOffset? activeAttemptReceipt = null)
        => new()
        {
            SchemaVersion = 2,
            State = new Contracts.PracticeState
            {
                LatestAnswers = latestAnswers ?? [],
                Bookmarks = bookmarks ?? [],
                Attempts = attempts ?? [],
                ActiveAttempt = activeAttempt,
            },
            Receipts = new PracticeStateReceipts
            {
                LatestAnswers = latestAnswerReceipts ?? [],
                Bookmarks = bookmarkReceipts ?? [],
                FinishedAttempts = finishedAttemptReceipts ?? [],
                ActiveAttemptReceivedAt = activeAttemptReceipt,
            },
        };

    private static BookmarkReceipt Bookmark(bool isBookmarked, DateTimeOffset receivedAt)
        => new() { IsBookmarked = isBookmarked, ReceivedAt = receivedAt };

    private static FinishedAttempt FinishedAttempt(int id, int finishedMinute)
        => new()
        {
            Id = $"00000000-0000-4000-8000-{id:000000000000}",
            Mode = AttemptMode.Quick,
            Label = $"Attempt {id}",
            QuestionIds = ["arch-001"],
            Answers = new Dictionary<string, string[]> { ["arch-001"] = ["a"] },
            StartedAt = Receipt(finishedMinute).AddMinutes(-1).ToUnixTimeMilliseconds(),
            DurationMinutes = 1,
            FinishedAt = Receipt(finishedMinute).ToUnixTimeMilliseconds(),
            Score = 0,
            Outcome = AttemptOutcome.Submitted,
        };

    private static Attempt ActiveAttempt(int id, string questionId, string answer)
        => new()
        {
            Id = $"00000000-0000-4000-8000-{id:000000000000}",
            Mode = AttemptMode.Quick,
            Label = $"Attempt {id}",
            QuestionIds = [questionId],
            Answers = new Dictionary<string, string[]> { [questionId] = [answer] },
            Flagged = [questionId],
            CurrentIndex = 0,
            StartedAt = Receipt(0).ToUnixTimeMilliseconds(),
            DurationMinutes = 10,
            Domains = [DomainId.Architecture],
        };

    private static DateTimeOffset Receipt(int minute)
        => new DateTimeOffset(2026, 8, 4, 12, 0, 0, TimeSpan.Zero).AddMinutes(minute);
}
