using System.Security.Claims;
using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Api.Controllers;

[ApiController]
[Route("api/applications")]
[Authorize]
public class ApplicationsController(AppDbContext db) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.Applications.ToListAsync());   // query filter scopes this automatically

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateApplicationRequest req)
    {
        var app = new Application
        {
            Id = Guid.NewGuid(),
            UserId = CurrentUserId,
            Company = req.Company ?? "",
            Title = req.Title,
            JobUrl = req.JobUrl,
            RawDescription = req.RawDescription,
            AppliedDate = DateTimeOffset.UtcNow,
        };
        db.Applications.Add(app);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(List), new { id = app.Id }, app);
    }
}

public record CreateApplicationRequest(string Title, string? Company, string? JobUrl, string RawDescription);