namespace Acn.Fde.Practice.Infrastructure.Persistence;

public sealed class PracticeStateEntity : IChangeLogEx
{
    public string UserId { get; set; } = string.Empty;
    public string GitHubAccountId { get; set; } = string.Empty;
    public JsonElement? StateJson { get; set; }
    public JsonElement? ReceiptsJson { get; set; }
    public string? CreatedBy { get; set; }
    public DateTimeOffset? CreatedOn { get; set; }
    public string? UpdatedBy { get; set; }
    public DateTimeOffset? UpdatedOn { get; set; }
}
