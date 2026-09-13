using JobTracker.Api.Data;
using JobTracker.Api.Dtos;
using JobTracker.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net.Http;
using System.Security.Claims;
using System.Text.Json;

namespace JobTracker.Api.Controllers;

[ApiController]
[Route("api/applications")]
[Authorize]
public class ApplicationsController(AppDbContext db, 
    IHttpClientFactory httpClientFactory, 
    IConfiguration config, 
    IServiceScopeFactory scopeFactory) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.Applications.ToListAsync());   // query filter scopes this automatically

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateApplicationRequest req)
    {
        // Soft dedup: a near-identical submission within 60s reads as an
        // accidental resubmit (e.g. a false-error retry), not a second
        // real application. Return the existing row instead of creating one.
        var recentCutoff = DateTimeOffset.UtcNow.AddSeconds(-60);
        var duplicate = await db.Applications.FirstOrDefaultAsync(a =>
            a.Title.ToLower() == req.Title.ToLower() &&
            (a.Company ?? "").ToLower() == (req.Company ?? "").ToLower() &&
            a.CreatedAt >= recentCutoff);

        if (duplicate is not null)
            return Ok(new { application = ToResponse(duplicate), wasDuplicate = true, automationTriggered = false });

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

        db.TimelineEvents.Add(new TimelineEvent
        {
            Id = Guid.NewGuid(),
            ApplicationId = app.Id,
            Type = "created",
            Body = "Application created",
        });

        await db.SaveChangesAsync();

        var webhookUrl = config["N8n:SkillExtractionWebhookUrl"];
        var automationTriggered = !string.IsNullOrEmpty(webhookUrl);

        if (automationTriggered)
        {
            // Detached from the request entirely — this task keeps running
            // after the HTTP response has already gone out. Its own DbContext
            // scope is required because the request's `db` gets disposed
            // the moment this action method returns.
            var applicationId = app.Id;
            var rawDescription = app.RawDescription;
            _ = Task.Run(async () =>
            {
                using var scope = scopeFactory.CreateScope();
                var scopedDb = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                scopedDb.AutomationLogEntries.Add(new AutomationLogEntry
                {
                    Id = Guid.NewGuid(),
                    Type = "skill_extraction",
                    ApplicationId = applicationId,
                    Status = "triggered",
                });
                await scopedDb.SaveChangesAsync();

                try
                {
                    var client = httpClientFactory.CreateClient("n8n");
                    client.Timeout = TimeSpan.FromSeconds(10);
                    var res = await client.PostAsJsonAsync(webhookUrl,
                        new { applicationId, rawDescription });

                    scopedDb.AutomationLogEntries.Add(new AutomationLogEntry
                    {
                        Id = Guid.NewGuid(),
                        Type = "skill_extraction",
                        ApplicationId = applicationId,
                        Status = res.IsSuccessStatusCode ? "succeeded" : "failed",
                        Message = res.IsSuccessStatusCode ? null : $"n8n responded HTTP {(int)res.StatusCode}",
                    });
                    await scopedDb.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    scopedDb.AutomationLogEntries.Add(new AutomationLogEntry
                    {
                        Id = Guid.NewGuid(),
                        Type = "skill_extraction",
                        ApplicationId = applicationId,
                        Status = "failed",
                        Message = ex.Message,
                    });
                    await scopedDb.SaveChangesAsync();
                }
            });
        }

        return Ok(new { application = ToResponse(app), wasDuplicate = false, automationTriggered });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id);
        if (app is null) return NotFound();

        db.Applications.Remove(app); // cascades StageDetails, TimelineEvents, ApplicationSkills
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPatch("{id}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusRequest req)
    {
        if (!Enum.IsDefined(typeof(ApplicationStatus), req.Status))
            return BadRequest("Unknown status value.");

        // The query filter already scopes this to the current user —
        // a row belonging to someone else simply won't be found, giving a 404
        // rather than leaking whether it exists (per §7.3 of the build guide).
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id);
        if (app is null) return NotFound();

        var oldStatus = app.Status;
        if (oldStatus == req.Status)
            return Ok(ToResponse(app)); // no-op, nothing to log

        app.Status = req.Status;
        app.UpdatedAt = DateTimeOffset.UtcNow;

        db.TimelineEvents.Add(new TimelineEvent
        {
            Id = Guid.NewGuid(),
            ApplicationId = app.Id,
            Type = "status_changed",
            Body = $"{oldStatus} → {req.Status}",
        });

        await db.SaveChangesAsync();
        return Ok(ToResponse(app));
    }

    private static ApplicationResponse ToResponse(Application a) => new(
        a.Id, a.Title, a.Company, a.JobUrl, a.RawDescription, a.Status, a.AppliedDate, a.UpdatedAt
    );

    [HttpGet("{id}")]
    public async Task<IActionResult> GetDetail(Guid id)
    {
        var app = await db.Applications
            .Include(a => a.TimelineEvents)
            .Include(a => a.StageDetails)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (app is null) return NotFound();

        var response = new ApplicationDetailResponse(
            app.Id, app.Title, app.Company, app.JobUrl, app.RawDescription,
            app.Status, app.AppliedDate, app.UpdatedAt,
            app.TimelineEvents.OrderByDescending(t => t.CreatedAt)
                .Select(t => new TimelineEventResponse(t.Id, t.Type, t.Body, t.CreatedAt)).ToList(),
            app.StageDetails.OrderByDescending(s => s.CreatedAt)
                .Select(s => new StageDetailResponse(s.Id, s.Stage, s.FieldsJson, s.CreatedAt)).ToList()
        );

        return Ok(response);
    }

    [HttpPut("{id}/stage-details")]
    public async Task<IActionResult> UpsertStageDetail(Guid id, [FromBody] UpsertStageDetailRequest req)
    {
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id);
        if (app is null) return NotFound();

        var fieldsJson = JsonSerializer.Serialize(req.Fields);

        // Every stage gets one record you overwrite — except InterviewScheduled,
        // which appends a new row per round (per §5.1 of the build guide).
        StageDetail? target = req.Stage == ApplicationStatus.InterviewScheduled
            ? null
            : await db.StageDetails.FirstOrDefaultAsync(s => s.ApplicationId == id && s.Stage == req.Stage);

        if (target is null)
        {
            target = new StageDetail { Id = Guid.NewGuid(), ApplicationId = id, Stage = req.Stage };
            db.StageDetails.Add(target);
        }

        target.FieldsJson = fieldsJson;
        await db.SaveChangesAsync();

        return Ok(new StageDetailResponse(target.Id, target.Stage, target.FieldsJson, target.CreatedAt));
    }
    // ApplicationsController.cs — new action
    [HttpGet("{id}/automation-status")]
    public async Task<IActionResult> GetAutomationStatus(Guid id)
    {
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id);
        if (app is null) return NotFound();

        var latest = await db.AutomationLogEntries
            .Where(e => e.ApplicationId == id && e.Type == "skill_extraction")
            .OrderByDescending(e => e.CreatedAt)
            .FirstOrDefaultAsync();

        if (latest is null) return Ok(new { status = (string?)null });
        return Ok(new { status = latest.Status, message = latest.Message, createdAt = latest.CreatedAt });
    }
}

public record CreateApplicationRequest(string Title, string? Company, string? JobUrl, string RawDescription);