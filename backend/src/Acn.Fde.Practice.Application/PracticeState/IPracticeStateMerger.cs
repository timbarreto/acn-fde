using Acn.Fde.Practice.Contracts;

namespace Acn.Fde.Practice.Application.PracticeState;

/// <summary>Converges two validated practice-state envelopes into canonical state.</summary>
public interface IPracticeStateMerger
{
    /// <param name="stored">The canonical stored envelope, or the canonical empty envelope.</param>
    /// <param name="incoming">A validated envelope received from one candidate device.</param>
    /// <param name="receivedAt">The canonical UTC, millisecond-precision server receipt.</param>
    /// <returns>A complete canonical envelope whose merge receipts are server-assigned.</returns>
    PracticeStateEnvelope Merge(
        PracticeStateEnvelope stored,
        PracticeStateEnvelope incoming,
        DateTimeOffset receivedAt);
}
