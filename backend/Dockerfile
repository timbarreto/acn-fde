# syntax=docker/dockerfile:1

FROM --platform=linux/amd64 mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY backend/Directory.Build.props backend/Directory.Packages.props backend/
COPY backend/src/Acn.Fde.Practice.Contracts/Acn.Fde.Practice.Contracts.csproj backend/src/Acn.Fde.Practice.Contracts/
COPY backend/src/Acn.Fde.Practice.Application/Acn.Fde.Practice.Application.csproj backend/src/Acn.Fde.Practice.Application/
COPY backend/src/Acn.Fde.Practice.Infrastructure/Acn.Fde.Practice.Infrastructure.csproj backend/src/Acn.Fde.Practice.Infrastructure/
COPY backend/src/Acn.Fde.Practice.Api/Acn.Fde.Practice.Api.csproj backend/src/Acn.Fde.Practice.Api/
COPY contracts/question-recognition-manifest.json contracts/question-recognition-manifest.json

RUN dotnet restore backend/src/Acn.Fde.Practice.Api/Acn.Fde.Practice.Api.csproj \
    --runtime linux-x64

COPY backend/src/Acn.Fde.Practice.Contracts/ backend/src/Acn.Fde.Practice.Contracts/
COPY backend/src/Acn.Fde.Practice.Application/ backend/src/Acn.Fde.Practice.Application/
COPY backend/src/Acn.Fde.Practice.Infrastructure/ backend/src/Acn.Fde.Practice.Infrastructure/
COPY backend/src/Acn.Fde.Practice.Api/ backend/src/Acn.Fde.Practice.Api/

RUN dotnet publish backend/src/Acn.Fde.Practice.Api/Acn.Fde.Practice.Api.csproj \
    --configuration Release \
    --runtime linux-x64 \
    --self-contained false \
    --no-restore \
    --output /app/publish \
    /p:UseAppHost=false \
    /p:PublishReadyToRun=false

FROM --platform=linux/amd64 mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_HTTP_PORTS=8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    OTEL_SDK_DISABLED=true \
    DOTNET_EnableDiagnostics=0

EXPOSE 8080

COPY --from=build --chown=1654:1654 /app/publish .

USER $APP_UID
ENTRYPOINT ["dotnet", "Acn.Fde.Practice.Api.dll"]
