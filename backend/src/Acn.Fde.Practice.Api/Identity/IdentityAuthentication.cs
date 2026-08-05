using Acn.Fde.Practice.Application;
using CoreEx.AspNetCore;
using CoreEx.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Acn.Fde.Practice.Api.Identity;

public static class IdentityAuthentication
{
    public const string GitHubAccountIdClaim = "github_account_id";

    public static IServiceCollection AddIdentityAuthentication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var settings = IdentityTokenSettings.FromConfiguration(configuration);
        var documentRetriever = new HttpDocumentRetriever
        {
            RequireHttps = settings.RequireHttps,
        };
        var configurationManager =
            new ConfigurationManager<OpenIdConnectConfiguration>(
                settings.JwksUri.AbsoluteUri,
                new BetterAuthJwksConfigurationRetriever(settings.Issuer),
                documentRetriever);

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;
                options.SaveToken = false;
                options.ConfigurationManager = configurationManager;
                options.RefreshOnIssuerKeyNotFound = true;
                options.TokenValidationParameters =
                    CreateTokenValidationParameters(settings);
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = context =>
                    {
                        var subject = context.Principal?
                            .FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
                        var recoveryId = context.Principal?
                            .FindFirst(GitHubAccountIdClaim)?.Value;

                        if (string.IsNullOrWhiteSpace(subject)
                            || string.IsNullOrWhiteSpace(recoveryId))
                        {
                            context.Fail("The identity token is incomplete.");
                        }

                        return Task.CompletedTask;
                    },
                };
            });

        services.AddAuthorization();
        return services;
    }

    public static TokenValidationParameters CreateTokenValidationParameters(
        IdentityTokenSettings settings) => new()
        {
            ValidIssuer = settings.Issuer,
            ValidateIssuer = true,
            ValidAudience = settings.Audience,
            ValidateAudience = true,
            RequireSignedTokens = true,
            ValidateIssuerSigningKey = true,
            RequireExpirationTime = true,
            ValidateLifetime = true,
            ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256],
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = JwtRegisteredClaimNames.Sub,
        };

    public static async Task ConfigureExecutionContextAsync(
        HttpContext httpContext,
        CoreEx.ExecutionContext executionContext)
    {
        await ExecutionContextMiddleware
            .DefaultConfigure(httpContext, executionContext)
            .ConfigureAwait(false);

        if (httpContext.User.Identity?.IsAuthenticated != true)
            return;

        var subject = httpContext.User
            .FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var githubAccountId = httpContext.User
            .FindFirst(GitHubAccountIdClaim)?.Value;

        if (string.IsNullOrWhiteSpace(subject) || string.IsNullOrWhiteSpace(githubAccountId))
            return;

        executionContext.User = new PracticeAuthenticationUser
        {
            Type = AuthenticationType.AccountUser,
            Id = subject,
            UserName = subject,
            GitHubAccountId = githubAccountId,
        };
    }
}
