using Acn.Fde.Practice.Application.PracticeState;
using Acn.Fde.Practice.Contracts;
using Microsoft.AspNetCore.Authorization;

namespace Acn.Fde.Practice.Api.Controllers;

[ApiController, Authorize, Route("/api/practice-state"), OpenApiTag("Practice state")]
public sealed class PracticeStateController(WebApi webApi, IPracticeStateService service) : ControllerBase
{
    private readonly WebApi _webApi = webApi.ThrowIfNull();
    private readonly IPracticeStateService _service = service.ThrowIfNull();

    [HttpGet]
    [ProducesResponseType(typeof(PracticeStateEnvelope), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public Task<IActionResult> GetAsync(CancellationToken cancellationToken = default)
        => _webApi.GetWithResultAsync<PracticeStateEnvelope>(
            Request,
            (_, ct) => _service.GetAsync(ct),
            cancellationToken: cancellationToken);

    [HttpPost]
    [Accepts<PracticeStateEnvelope>]
    [ProducesResponseType(typeof(PracticeStateEnvelope), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public Task<IActionResult> PostAsync(CancellationToken cancellationToken = default)
        => _webApi.PostWithResultAsync<PracticeStateEnvelope, PracticeStateEnvelope>(
            Request,
            (options, ct) => _service.SaveAsync(options.Value, ct),
            HttpStatusCode.OK,
            cancellationToken: cancellationToken);
}
