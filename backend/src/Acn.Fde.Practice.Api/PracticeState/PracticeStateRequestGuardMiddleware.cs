using Acn.Fde.Practice.Contracts;
using Microsoft.Net.Http.Headers;

namespace Acn.Fde.Practice.Api.PracticeState;

public sealed class PracticeStateRequestGuardMiddleware(
    RequestDelegate next,
    JsonSerializerOptions jsonSerializerOptions)
{
    public const int MaximumBodyBytes = 512 * 1024;
    private readonly RequestDelegate _next = next.ThrowIfNull();
    private readonly JsonSerializerOptions _jsonSerializerOptions = jsonSerializerOptions.ThrowIfNull();

    public async Task InvokeAsync(HttpContext context)
    {
        if (!HttpMethods.IsPost(context.Request.Method)
            || !context.Request.Path.Equals("/api/practice-state", StringComparison.Ordinal))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        if (!HasSupportedMediaType(context.Request))
        {
            await WriteProblemAsync(
                context,
                StatusCodes.Status415UnsupportedMediaType,
                "Unsupported media type",
                "unsupported_media_type").ConfigureAwait(false);
            return;
        }

        if (context.Request.ContentLength > MaximumBodyBytes)
        {
            await WriteTooLargeAsync(context).ConfigureAwait(false);
            return;
        }

        await using var body = new MemoryStream(capacity: MaximumBodyBytes + 1);
        var chunk = new byte[16 * 1024];
        while (true)
        {
            var read = await context.Request.Body.ReadAsync(chunk, context.RequestAborted).ConfigureAwait(false);
            if (read == 0)
                break;

            await body.WriteAsync(chunk.AsMemory(0, read), context.RequestAborted).ConfigureAwait(false);
            if (body.Length > MaximumBodyBytes)
            {
                await WriteTooLargeAsync(context).ConfigureAwait(false);
                return;
            }
        }

        body.Position = 0;
        try
        {
            using var document = await JsonDocument.ParseAsync(
                body,
                new JsonDocumentOptions
                {
                    AllowTrailingCommas = false,
                    CommentHandling = JsonCommentHandling.Disallow,
                    MaxDepth = 16,
                },
                context.RequestAborted).ConfigureAwait(false);

            if (HasDuplicateProperty(document.RootElement))
            {
                await WriteInvalidAsync(context).ConfigureAwait(false);
                return;
            }

            _ = document.RootElement.Deserialize<PracticeStateEnvelope>(_jsonSerializerOptions);
        }
        catch (JsonException)
        {
            body.Position = 0;
            try
            {
                using var _ = await JsonDocument.ParseAsync(body, cancellationToken: context.RequestAborted)
                    .ConfigureAwait(false);
                await WriteInvalidAsync(context).ConfigureAwait(false);
            }
            catch (JsonException)
            {
                await WriteProblemAsync(
                    context,
                    StatusCodes.Status400BadRequest,
                    "Malformed JSON",
                    "malformed_json").ConfigureAwait(false);
            }

            return;
        }

        body.Position = 0;
        context.Request.Body = body;
        context.Request.ContentLength = body.Length;
        await _next(context).ConfigureAwait(false);
    }

    private Task WriteTooLargeAsync(HttpContext context) => WriteProblemAsync(
        context,
        StatusCodes.Status413PayloadTooLarge,
        "Practice state is too large",
        "practice_state_too_large");

    private Task WriteInvalidAsync(HttpContext context) => WriteProblemAsync(
        context,
        StatusCodes.Status400BadRequest,
        "Invalid practice state",
        "invalid_practice_state");

    private static bool HasDuplicateProperty(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var property in element.EnumerateObject())
            {
                if (!names.Add(property.Name) || HasDuplicateProperty(property.Value))
                    return true;
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                if (HasDuplicateProperty(item))
                    return true;
            }
        }

        return false;
    }

    private static bool HasSupportedMediaType(HttpRequest request)
    {
        if (request.Headers.ContentEncoding.Count > 0)
            return false;

        if (!MediaTypeHeaderValue.TryParse(request.ContentType, out var contentType)
            || !contentType.MediaType.Equals("application/json", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return contentType.Charset.Value is null
            || contentType.Charset.Equals("utf-8", StringComparison.OrdinalIgnoreCase);
    }

    private async Task WriteProblemAsync(
        HttpContext context,
        int status,
        string title,
        string code)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/problem+json";
        await context.Response.WriteAsJsonAsync(
            new ProblemDetails
            {
                Status = status,
                Title = title,
                Extensions =
                {
                    ["code"] = code,
                    ["traceId"] = context.TraceIdentifier,
                },
            },
            _jsonSerializerOptions,
            contentType: "application/problem+json",
            cancellationToken: context.RequestAborted).ConfigureAwait(false);
    }
}
