using CoreEx.Security;

namespace Acn.Fde.Practice.Application;

public sealed record class PracticeAuthenticationUser : AuthenticationUser
{
    public required string GitHubAccountId { get; init; }
}
