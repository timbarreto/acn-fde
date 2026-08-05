namespace Acn.Fde.Practice.Api.Identity;

public sealed class IdentityTokenSettings
{
    public const string SectionName = "IdentityToken";

    public required string Issuer { get; init; }

    public required string Audience { get; init; }

    public required Uri JwksUri { get; init; }

    public required bool RequireHttps { get; init; }

    public static IdentityTokenSettings LocalDevelopment { get; } = new()
    {
        Issuer = "http://localhost:5173",
        Audience = "acn-fde-practice-api",
        JwksUri = new("http://localhost:5173/api/auth/jwks"),
        RequireHttps = false,
    };

    public static IdentityTokenSettings FromConfiguration(
        IConfiguration configuration)
    {
        var section = configuration.GetRequiredSection(SectionName);
        var issuer = section[nameof(Issuer)];
        var audience = section[nameof(Audience)];
        var jwksUri = section[nameof(JwksUri)];
        var requireHttpsValue = section[nameof(RequireHttps)];
        var parsedRequireHttps = false;

        if (string.IsNullOrWhiteSpace(issuer)
            || string.IsNullOrWhiteSpace(audience)
            || !Uri.TryCreate(jwksUri, UriKind.Absolute, out var parsedJwksUri)
            || (!string.IsNullOrWhiteSpace(requireHttpsValue)
                && !bool.TryParse(requireHttpsValue, out parsedRequireHttps)))
        {
            throw new InvalidOperationException(
                $"The {SectionName} configuration is incomplete.");
        }

        return new IdentityTokenSettings
        {
            Issuer = issuer,
            Audience = audience,
            JwksUri = parsedJwksUri,
            RequireHttps = string.IsNullOrWhiteSpace(requireHttpsValue)
                ? !parsedJwksUri.IsLoopback
                : parsedRequireHttps,
        };
    }
}
