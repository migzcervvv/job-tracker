using JobTracker.Api.Data;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
[ApiController, Route("api/analytics"), Authorize]
public class AnalyticsController(AppDbContext db) : ControllerBase
{
    [HttpGet("pipeline-alerts")]
    public async Task<IActionResult> GetPipelineAlerts(int staleDays = 7, int noReplyDays = 60)
    {
        if (staleDays is < 1 or > 365 || noReplyDays is < 1 or > 365) return BadRequest("Thresholds must be between 1 and 365 days.");
        var now = DateTimeOffset.UtcNow;
        var apps = await db.Applications.Include(a => a.StageDetails).Where(a => a.Status >= ApplicationStatus.Applied && a.Status <= ApplicationStatus.Offered && (a.SnoozedUntil == null || a.SnoozedUntil <= now)).ToListAsync();
        var zone = await db.UserProfiles.Select(p => p.TimeZone).FirstOrDefaultAsync() ?? "UTC";
        return Ok(new
        {
            appliedThisWeek = await db.Applications.CountAsync(a => a.Status != ApplicationStatus.Saved && a.AppliedDate >= now.AddDays(-7)),
            stale = apps.Where(a => a.UpdatedAt < now.AddDays(-staleDays)).OrderBy(a => a.UpdatedAt).Select(a => new { a.Id, a.Title, a.Company, daysSinceActivity = (int)(now - a.UpdatedAt).TotalDays }),
            noReply = apps.Where(a => a.LastEmployerResponseAt == null && a.AppliedDate < now.AddDays(-noReplyDays)).OrderBy(a => a.AppliedDate).Select(a => new { a.Id, a.Title, a.Company, daysSinceApplied = (int)(now - a.AppliedDate).TotalDays }),
            followUps = apps.Where(a => a.FollowUpAt <= now).Select(a => new { a.Id, a.Title, a.Company, a.NextAction, a.FollowUpAt }),
            deadlines = apps.SelectMany(a => DeadlineService.Due(a, zone, now).Select(d => new { a.Id, a.Title, a.Company, d.Kind, d.DueAt, d.StageDetailId }))
        });
    }
    [HttpGet("funnel")]
    public async Task<IActionResult> Funnel()
    {
        var apps = await db.Applications.Include(a => a.TimelineEvents).ToListAsync();
        var now = DateTimeOffset.UtcNow;
        return Ok(new
        {
            total = apps.Count, responded = apps.Count(a => a.LastEmployerResponseAt != null),
            stages = apps.GroupBy(a => a.Status).Select(g => new { status = g.Key, count = g.Count(),
                averageDaysInCurrentStage = g.Average(a => (now - (a.TimelineEvents.Where(t => t.Type == "status_changed").Select(t => (DateTimeOffset?)t.CreatedAt).Max() ?? a.CreatedAt)).TotalDays) })
        });
    }
}
