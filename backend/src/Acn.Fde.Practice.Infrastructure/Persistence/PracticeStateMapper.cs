using Acn.Fde.Practice.Application.PracticeState;
using Acn.Fde.Practice.Contracts;

namespace Acn.Fde.Practice.Infrastructure.Persistence;

public static class PracticeStateMapper
{
    public static StoredPracticeState Map(PracticeStateEntity entity)
    {
        try
        {
            return new StoredPracticeState
            {
                Subject = entity.UserId,
                GitHubAccountId = entity.GitHubAccountId,
                Envelope = new PracticeStateEnvelope
                {
                    SchemaVersion = 2,
                    State = entity.StateJson?.Deserialize<Contracts.PracticeState>(JsonDefaults.SerializerOptions)
                        ?? throw new InvalidDataException("Stored practice state is missing."),
                    Receipts = entity.ReceiptsJson?.Deserialize<PracticeStateReceipts>(JsonDefaults.SerializerOptions)
                        ?? throw new InvalidDataException("Stored practice receipts are missing."),
                },
            };
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException("Stored practice state is malformed.", exception);
        }
    }

    public static void MapInto(StoredPracticeState source, PracticeStateEntity destination)
    {
        destination.UserId = source.Subject;
        destination.GitHubAccountId = source.GitHubAccountId;
        destination.StateJson = JsonSerializer.SerializeToElement(
            source.Envelope.State,
            JsonDefaults.SerializerOptions);
        destination.ReceiptsJson = JsonSerializer.SerializeToElement(
            source.Envelope.Receipts,
            JsonDefaults.SerializerOptions);
    }
}
