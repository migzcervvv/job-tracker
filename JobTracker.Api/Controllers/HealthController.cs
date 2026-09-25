using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JobTracker.Api.Controllers;

// Anonymous on purpose — the frontend needs to hit this before login and
// while a cold-started API is still waking up. Do not add [Authorize] here.
[ApiController]
[Route("api/health")]
[AllowAnonymous]
public class HealthController(IN8nHealthChecker n8nHealth) : ControllerBase
{
    [HttpGet("n8n")]
    public async Task<IActionResult> GetN8nHealth()
    {
        var status = await n8nHealth.CheckAsync();
        return Ok(new { status });
    }
}