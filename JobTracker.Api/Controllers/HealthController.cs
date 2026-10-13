using JobTracker.Api.Data;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace JobTracker.Api.Controllers;
[ApiController, Route("api/health"), AllowAnonymous]
public class HealthController(IN8nHealthChecker n8nHealth, AppDbContext db) : ControllerBase
{
    [HttpGet("live")] public IActionResult Live() => Ok(new { status = "healthy" });
    [HttpGet("ready")]
    public async Task<IActionResult> Ready()
    {
        try
        {
            if (!await db.Database.CanConnectAsync() || db.Database.IsRelational() && (await db.Database.GetPendingMigrationsAsync()).Any()) return StatusCode(503, new { status = "unreachable" });
            return Ok(new { status = "healthy" });
        }
        catch { return StatusCode(503, new { status = "unreachable" }); }
    }
    [HttpGet("n8n")] public async Task<IActionResult> N8n() => Ok(new { status = await n8nHealth.CheckAsync() });
}
