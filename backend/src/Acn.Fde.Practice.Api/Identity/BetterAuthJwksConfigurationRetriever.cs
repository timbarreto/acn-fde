using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Acn.Fde.Practice.Api.Identity;

public sealed class BetterAuthJwksConfigurationRetriever(string issuer)
    : IConfigurationRetriever<OpenIdConnectConfiguration>
{
    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(
        string address,
        IDocumentRetriever retriever,
        CancellationToken cancel)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(address);
        ArgumentNullException.ThrowIfNull(retriever);

        var document = await retriever
            .GetDocumentAsync(address, cancel)
            .ConfigureAwait(false);
        var keySet = new JsonWebKeySet(document);
        var configuration = new OpenIdConnectConfiguration
        {
            Issuer = issuer,
            JsonWebKeySet = keySet,
        };

        foreach (var key in keySet.GetSigningKeys())
            configuration.SigningKeys.Add(key);

        return configuration;
    }
}
