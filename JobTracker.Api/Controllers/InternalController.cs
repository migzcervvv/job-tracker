using System.Data;
using System.Text.Json;
using JobTracker.Api.Data;
using JobTracker.Api.Dtos;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

[ApiController, Route("api/internal"), AllowAnonymous, ServiceFilter(typeof(AutomationKeyFilter))]
public class InternalController(AppDbContext db, ISkillResolver resolver) : ControllerBase
{
    [HttpPost("applications/{id:guid}/requirements")]
    public IActionResult LegacyRequirements(Guid id) => StatusCode(410, "Use the versioned skills callback with runId and requirementsEmbedding.");
    [HttpPut("applications/{id:guid}/skills")]
    public Task<IActionResult> Skills(Guid id, SkillCallback req) => Complete(req.RunId, "skill_extraction", id, null, async run =>
    {
        if (req.Skills == null || req.Skills.Count > 200 || req.Skills.Any(s => s == null || string.IsNullOrWhiteSpace(s.Name) || s.Name.Length > 100 || s.Importance is < 1 or > 3) || !InputValidation.Vector(req.RequirementsEmbedding)) return BadRequest("Invalid skills or 1536-dimensional embedding.");
        var app = await db.Applications.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == id && a.UserId == run.UserId);
        if (app == null) return NotFound();
        if (app.ExtractionRunId != run.Id) return Conflict("This run has been replaced.");
        var grouped = req.Skills.GroupBy(s => SkillResolver.Normalize(s.Name)).ToDictionary(g => g.Key, g => g.Max(s => s.Importance));
        var skills = await resolver.ResolveSkillsAsync(grouped.Keys.ToList());
        var existing = await db.ApplicationSkills.IgnoreQueryFilters().Where(s => s.ApplicationId == id).ToListAsync();
        var wanted = skills.Select(s => s.Id).ToHashSet();
        db.ApplicationSkills.RemoveRange(existing.Where(s => !wanted.Contains(s.SkillId)));
        foreach (var skill in skills)
        {
            var link = existing.FirstOrDefault(s => s.SkillId == skill.Id);
            if (link == null) { link = new ApplicationSkill { ApplicationId = id, SkillId = skill.Id }; db.ApplicationSkills.Add(link); }
            link.Importance = grouped[skill.Name];
        }
        app.RequirementsEmbedding = req.RequirementsEmbedding == null ? null : new Pgvector.Vector(req.RequirementsEmbedding);
        app.Version = Guid.NewGuid();
        return Ok(new { skillCount = skills.Count });
    });

    [HttpPut("applications/{id:guid}/interview-questions")]
    public Task<IActionResult> Questions(Guid id, QuestionsCallback req) => Complete(req.RunId, "interview_questions", id, null, async run =>
    {
        if (string.IsNullOrWhiteSpace(req.Questions) || req.Questions.Length > 50000 || run.StageDetailId != req.StageDetailId) return BadRequest("Invalid questions or round.");
        var stage = await db.StageDetails.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.Id == req.StageDetailId && s.ApplicationId == id && s.Stage == ApplicationStatus.InterviewScheduled);
        if (stage == null) return NotFound();
        if (stage.QuestionRunId != run.Id) return Conflict("This run has been replaced.");
        stage.GeneratedQuestions = req.Questions;
        stage.Version = Guid.NewGuid();
        db.TimelineEvents.Add(new TimelineEvent { Id = Guid.NewGuid(), ApplicationId = id, Type = "automation", Body = "Interview questions generated" });
        return Ok(new { stage.Id });
    });

    [HttpPut("resumes/{id:guid}/extraction")]
    public Task<IActionResult> ResumeExtraction(Guid id, ResumeCallback req) => Complete(req.RunId, "resume_extraction", null, id, async run =>
    {
        if (string.IsNullOrWhiteSpace(req.ExtractedText) || req.ExtractedText.Length > 200000 || req.Skills == null || req.Skills.Count > 200 ||
            req.Skills.Any(s => s == null || string.IsNullOrWhiteSpace(s.Name) || s.Name.Length > 100 || s.Evidence?.Length > 5000 || !double.IsFinite(s.Strength) || s.Strength < 0 || s.Strength > 1) ||
            !InputValidation.Vector(req.ResumeEmbedding)) return BadRequest("Invalid extraction or 1536-dimensional embedding.");
        var resume = await db.Resumes.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id && r.UserId == run.UserId);
        if (resume == null) return NotFound();
        if (resume.ExtractionRunId != run.Id) return Conflict("This run has been replaced.");
        resume.ExtractedText = req.ExtractedText;
        resume.Embedding = req.ResumeEmbedding == null ? null : new Pgvector.Vector(req.ResumeEmbedding);
        resume.ProposedSkillsJson = JsonSerializer.Serialize(req.Skills.GroupBy(s => SkillResolver.Normalize(s.Name))
            .Select(g => new SkillEvidenceDto { Name = g.Key, Evidence = g.OrderByDescending(s => s.Strength).First().Evidence, Strength = g.Max(s => s.Strength) }));
        resume.ExtractionStatus = "succeeded";
        resume.Version = Guid.NewGuid();
        // A callback never switches the active profile. Activation is a separate user action.
        return Ok(new { resume.Id });
    });

    [HttpPost("runs/{id:guid}/claim")]
    public async Task<IActionResult> ClaimRun(Guid id)
    {
        var run = await db.AutomationRuns.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id);
        if (run == null) return NotFound();
        if (AutomationRun.IsTerminal(run.Status) || run.Status == "running" || run.DeadlineAt <= DateTimeOffset.UtcNow) return Conflict("Run already claimed or no longer active.");
        run.Status = "running"; run.UpdatedAt = DateTimeOffset.UtcNow; run.Version = Guid.NewGuid();
        await db.SaveChangesAsync(); return Ok(AutomationService.View(run));
    }
    [HttpPost("runs/{id:guid}/state")]
    public async Task<IActionResult> State(Guid id, StateCallback req)
    {
        if (req.Status is not ("running" or "failed")) return BadRequest("Status must be running or failed.");
        var run = await db.AutomationRuns.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id);
        if (run == null) return NotFound();
        if (AutomationRun.IsTerminal(run.Status)) return Ok(AutomationService.View(run));
        run.Status = req.Status; run.ErrorCode = req.Status == "failed" ? "workflow_failed" : null;
        run.UpdatedAt = DateTimeOffset.UtcNow; run.Version = Guid.NewGuid();
        await db.SaveChangesAsync();
        return Ok(AutomationService.View(run));
    }

    private async Task<IActionResult> Complete(Guid id, string type, Guid? applicationId, Guid? resumeId, Func<AutomationRun, Task<IActionResult>> action)
    {
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync() : null;
        var run = await db.AutomationRuns.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id && r.Type == type && r.ApplicationId == applicationId && r.ResumeId == resumeId);
        if (run == null) return NotFound("Unknown run or resource.");
        if (run.Status == "succeeded") return Ok(AutomationService.View(run));
        if (AutomationRun.IsTerminal(run.Status) || run.DeadlineAt < DateTimeOffset.UtcNow) return Conflict("Run is no longer active.");
        var result = await action(run);
        if (result is not OkObjectResult) return result;
        run.Status = "succeeded"; run.ErrorCode = null; run.UpdatedAt = DateTimeOffset.UtcNow; run.Version = Guid.NewGuid();
        await db.SaveChangesAsync();
        if (transaction != null) await transaction.CommitAsync();
        return result;
    }

    [HttpGet("reminders/stale")]
    public async Task<IActionResult> Stale(int days = 7)
    {
        if (days is < 1 or > 365) return BadRequest("Days must be 1–365.");
        var now = DateTimeOffset.UtcNow; var cutoff = now.AddDays(-days);
        var apps = await db.Applications.IgnoreQueryFilters().Where(a => a.Status >= ApplicationStatus.Applied && a.Status <= ApplicationStatus.Offered && a.UpdatedAt < cutoff && (a.SnoozedUntil == null || a.SnoozedUntil <= now)).ToListAsync();
        var enabled = await db.UserProfiles.IgnoreQueryFilters().Where(p => p.RemindersEnabled).Select(p => p.UserId).ToListAsync();
        return Ok(await Recipients(apps.Where(a => enabled.Contains(a.UserId))));
    }
    [HttpGet("reminders/deadlines")]
    public async Task<IActionResult> Deadlines()
    {
        var enabled = await db.UserProfiles.IgnoreQueryFilters().Where(p => p.RemindersEnabled).Select(p => p.UserId).ToListAsync();
        var apps = await db.Applications.IgnoreQueryFilters().Include(a => a.StageDetails).Where(a => enabled.Contains(a.UserId) && a.Status >= ApplicationStatus.Applied && a.Status <= ApplicationStatus.Offered).ToListAsync();
        var zones = await db.UserProfiles.IgnoreQueryFilters().Where(p => enabled.Contains(p.UserId)).ToDictionaryAsync(p => p.UserId, p => p.TimeZone);
        var now = DateTimeOffset.UtcNow;
        return Ok(await Recipients(apps.Where(a => (a.SnoozedUntil == null || a.SnoozedUntil <= now) && DeadlineService.Due(a, zones.GetValueOrDefault(a.UserId, "UTC"), now).Count > 0), true));
    }
    [HttpGet("digest/weekly")]
    public async Task<IActionResult> Digest()
    {
        var profiles = await db.UserProfiles.IgnoreQueryFilters().Where(p => p.WeeklyDigestEnabled).ToListAsync();
        var ids = profiles.Select(p => p.UserId).ToList();
        var apps = await db.Applications.IgnoreQueryFilters().Include(a => a.TimelineEvents).Where(a => ids.Contains(a.UserId)).ToListAsync();
        var emails = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Email);
        var since = DateTimeOffset.UtcNow.AddDays(-7);
        return Ok(profiles.Select(p => new { p.UserId, email = emails.GetValueOrDefault(p.UserId), p.TimeZone,
            deliveryKey = $"weekly:{p.UserId}:{System.Globalization.ISOWeek.GetYear(since.UtcDateTime)}:{System.Globalization.ISOWeek.GetWeekOfYear(since.UtcDateTime)}",
            newThisWeek = apps.Count(a => a.UserId == p.UserId && a.Status != ApplicationStatus.Saved && a.AppliedDate >= since),
            activeTotal = apps.Count(a => a.UserId == p.UserId && a.Status >= ApplicationStatus.Applied && a.Status <= ApplicationStatus.Offered),
            statusChanges = apps.Where(a => a.UserId == p.UserId).Sum(a => a.TimelineEvents.Count(t => t.Type == "status_changed" && t.CreatedAt >= since)) }));
    }
    private async Task<object> Recipients(IEnumerable<Application> applications, bool deadlines = false)
    {
        var apps = applications.ToList(); var ids = apps.Select(a => a.UserId).Distinct().ToList();
        var emails = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Email);
        var zones = await db.UserProfiles.IgnoreQueryFilters().Where(p => ids.Contains(p.UserId)).ToDictionaryAsync(p => p.UserId, p => p.TimeZone);
        return apps.GroupBy(a => a.UserId).Select(g => new { userId = g.Key, email = emails.GetValueOrDefault(g.Key), timeZone = zones.GetValueOrDefault(g.Key, "UTC"),
            applications = g.Select(a => new { a.Id, a.Title, a.Company, a.NextAction, a.FollowUpAt,
                daysSinceActivity = (int)(DateTimeOffset.UtcNow - a.UpdatedAt).TotalDays,
                deliveryKey = $"{(deadlines ? "deadline" : "stale")}:{a.Id}:{DateTimeOffset.UtcNow:yyyy-MM-dd}",
                deadlines = deadlines ? DeadlineService.Due(a, zones.GetValueOrDefault(a.UserId, "UTC"), DateTimeOffset.UtcNow) : null }) });
    }
    public record SkillCallback(Guid RunId, List<SkillImportanceDto> Skills, float[]? RequirementsEmbedding);
    public record QuestionsCallback(Guid RunId, Guid StageDetailId, string Questions);
    public record ResumeCallback(Guid RunId, string ExtractedText, List<SkillEvidenceDto> Skills, float[]? ResumeEmbedding);
    public record StateCallback(string Status);
}
