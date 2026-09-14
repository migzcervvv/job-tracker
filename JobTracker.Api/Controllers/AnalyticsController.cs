// New: Controllers/AnalyticsController.cs, or add to SkillsController if you'd
// rather keep analytics endpoints together — either works, pick one and stay consistent
using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/analytics")]
[Authorize]
public class AnalyticsController(AppDbContext db) : ControllerBase
{
    [HttpGet("pipeline-alerts")]
    public async Task<IActionResult> GetPipelineAlerts(
        [FromQuery] int staleDays = 7,
        [FromQuery] int noReplyDays = 60)
    {
        var now = DateTimeOffset.UtcNow;
        var weekStart = now.AddDays(-7);
        var staleCutoff = now.AddDays(-staleDays);
        var noReplyCutoff = now.AddDays(-noReplyDays);

        var terminalStatuses = new[]
        {
            ApplicationStatus.Rejected, ApplicationStatus.OfferAccepted,
            ApplicationStatus.OfferDeclined, ApplicationStatus.Withdrawn, ApplicationStatus.Archived,
        };

        var apps = await db.Applications
            .Include(a => a.TimelineEvents)
            .Where(a => !terminalStatuses.Contains(a.Status))
            .ToListAsync();

        var appliedThisWeek = await db.Applications.CountAsync(a => a.AppliedDate >= weekStart);

        var stale = apps
            .Select(a => new
            {
                a.Id,
                a.Title,
                a.Company,
                LastActivity = a.TimelineEvents.Any() ? a.TimelineEvents.Max(t => t.CreatedAt) : a.CreatedAt,
            })
            .Where(a => a.LastActivity < staleCutoff)
            .OrderBy(a => a.LastActivity)
            .Select(a => new { a.Id, a.Title, a.Company, daysSinceActivity = (int)(now - a.LastActivity).TotalDays })
            .ToList();

        var noReply = apps
            .Where(a => a.TimelineEvents.Count <= 1 && a.AppliedDate < noReplyCutoff) // only the "created" event ever logged
            .OrderBy(a => a.AppliedDate)
            .Select(a => new { a.Id, a.Title, a.Company, daysSinceApplied = (int)(now - a.AppliedDate).TotalDays })
            .ToList();

        return Ok(new
        {
            appliedThisWeek,
            stale,
            noReply,
        });
    }
}