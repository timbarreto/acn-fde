using Acn.Fde.Practice.Api.Identity;
using Microsoft.AspNetCore.Http;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;

namespace Acn.Fde.Practice.Test.Api;

public sealed class IdentityAuthenticationTests
{
    [TestCase(TokenVariation.Valid, true)]
    [TestCase(TokenVariation.Expired, false)]
    [TestCase(TokenVariation.WrongIssuer, false)]
    [TestCase(TokenVariation.WrongAudience, false)]
    [TestCase(TokenVariation.WrongSignature, false)]
    public async Task Token_validation_enforces_the_identity_contract_Async(
        TokenVariation variation,
        bool expectedValid)
    {
        using var trustedAlgorithm = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        using var untrustedAlgorithm = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var trustedKey = new ECDsaSecurityKey(trustedAlgorithm) { KeyId = "trusted" };
        var signingKey = variation == TokenVariation.WrongSignature
            ? new ECDsaSecurityKey(untrustedAlgorithm) { KeyId = "untrusted" }
            : trustedKey;
        var settings = IdentityTokenSettings.LocalDevelopment;
        var now = DateTime.UtcNow;
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = variation == TokenVariation.WrongIssuer
                ? "https://unexpected.example"
                : settings.Issuer,
            Audience = variation == TokenVariation.WrongAudience
                ? "unexpected-audience"
                : settings.Audience,
            Subject = new ClaimsIdentity([
                new Claim(JwtRegisteredClaimNames.Sub, "opaque-subject"),
                new Claim(IdentityAuthentication.GitHubAccountIdClaim, "123456"),
            ]),
            IssuedAt = now.AddMinutes(-1),
            NotBefore = now.AddMinutes(-1),
            Expires = variation == TokenVariation.Expired
                ? now.AddMinutes(-1)
                : now.AddMinutes(10),
            SigningCredentials = new SigningCredentials(
                signingKey,
                SecurityAlgorithms.EcdsaSha256),
        };
        var handler = new JsonWebTokenHandler();
        var token = handler.CreateToken(descriptor);
        var parameters = IdentityAuthentication.CreateTokenValidationParameters(settings);
        parameters.IssuerSigningKey = trustedKey;

        var result = await handler.ValidateTokenAsync(token, parameters);

        result.IsValid.Should().Be(expectedValid);
    }

    [Test]
    public async Task Execution_context_uses_only_the_opaque_subject_Async()
    {
        var httpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([
                new Claim(JwtRegisteredClaimNames.Sub, "opaque-subject"),
                new Claim(IdentityAuthentication.GitHubAccountIdClaim, "123456"),
            ], "Bearer")),
        };
        var executionContext = new CoreEx.ExecutionContext();

        await IdentityAuthentication.ConfigureExecutionContextAsync(
            httpContext,
            executionContext);

        executionContext.User.Id.Should().Be("opaque-subject");
        executionContext.User.UserName.Should().Be("opaque-subject");
        executionContext.User.Id.Should().NotBe("123456");
    }

    [Test]
    public async Task Jwks_retriever_reads_the_Better_Auth_document_Async()
    {
        using var algorithm = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var key = new ECDsaSecurityKey(algorithm) { KeyId = "current" };
        var publicJwk = JsonWebKeyConverter.ConvertFromECDsaSecurityKey(key);
        publicJwk.D = null;
        var document = JsonSerializer.Serialize(new
        {
            keys = new[]
            {
                new
                {
                    kty = publicJwk.Kty,
                    crv = publicJwk.Crv,
                    x = publicJwk.X,
                    y = publicJwk.Y,
                    kid = publicJwk.Kid,
                    alg = SecurityAlgorithms.EcdsaSha256,
                    use = "sig",
                },
            },
        });
        var retriever = new BetterAuthJwksConfigurationRetriever(
            IdentityTokenSettings.LocalDevelopment.Issuer);

        var configuration = await retriever.GetConfigurationAsync(
            IdentityTokenSettings.LocalDevelopment.JwksUri.AbsoluteUri,
            new StaticDocumentRetriever(document),
            CancellationToken.None);

        configuration.Issuer.Should().Be(
            IdentityTokenSettings.LocalDevelopment.Issuer);
        configuration.SigningKeys.Should().ContainSingle();
        configuration.SigningKeys.Single().KeyId.Should().Be("current");
    }

    public enum TokenVariation
    {
        Valid,
        Expired,
        WrongIssuer,
        WrongAudience,
        WrongSignature,
    }

    private sealed class StaticDocumentRetriever(string document)
        : IDocumentRetriever
    {
        public Task<string> GetDocumentAsync(
            string address,
            CancellationToken cancel) => Task.FromResult(document);
    }
}
