using System.Security.Claims;
using System.Text.Json;
using JobTracker.Api.Data;
using JobTracker.Api.Dtos;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Api.Controllers;
[ApiController, Route("api/applications"), Authorize]
public class ApplicationsController(AppDbContext db, IFitScorer fitScorer, AutomationService automation) : ControllerBase
{
    private CancellationToken RequestAborted => HttpContext.RequestAborted;
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet]
    public async Task<IActionResult> List(int page = 1, int pageSize = 100, string? search = null, ApplicationStatus? status = null)
    {
        var query = db.Applications.AsNoTracking().Include(a => a.StageDetails).AsQueryable();
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim().ToLower(); query = query.Where(a => a.Title.ToLower().Contains(term) || a.Company.ToLower().Contains(term)); }
        if (status.HasValue) query = query.Where(a => a.Status == status);
        var apps = await query.OrderByDescending(a => a.AppliedDate).ThenBy(a => a.Id).Skip((Math.Max(page, 1) - 1) * Math.Clamp(pageSize, 1, 200)).Take(Math.Clamp(pageSize, 1, 200)).ToListAsync(RequestAborted);
        if (apps.Count == 0) return Ok(Array.Empty<object>());
        var scores = await fitScorer.ScoreAsync(UserId, apps.Select(a => a.Id).ToList(), RequestAborted);
        var zone = await db.UserProfiles.Where(p => p.UserId == UserId).Select(p => p.TimeZone).FirstOrDefaultAsync(RequestAborted) ?? "UTC";
        return Ok(apps.Select(a => View(a, scores.GetValueOrDefault(a.Id), zone)));
    }
    [HttpPost]
    public async Task<IActionResult> Create(CreateApplicationRequest req)
    {
        if (Validate(req) is string error) return BadRequest(error);
        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, RequestAborted) : null;
        if (req.ResumeId != null && !await db.Resumes.AnyAsync(r => r.Id == req.ResumeId, RequestAborted)) return BadRequest("Resume not found.");
        if (req.RequestId is Guid requestId)
        {
            var prior = await db.Applications.FirstOrDefaultAsync(a => a.Id == requestId, RequestAborted);
            if (prior != null) return Ok(new { application = View(prior), wasDuplicate = true, automationTriggered = prior.ExtractionRunId != null, runId = prior.ExtractionRunId });
            if (await db.Applications.IgnoreQueryFilters().AnyAsync(a => a.Id == requestId, RequestAborted)) return BadRequest("This request ID is unavailable.");
        }
        if (!req.AllowDuplicate && !string.IsNullOrWhiteSpace(req.Company) && !string.IsNullOrWhiteSpace(req.RawDescription))
        {
            var company = ApplicationDuplicates.Normalize(req.Company);
            var title = ApplicationDuplicates.Normalize(req.Title);
            var headings = await db.Applications.AsNoTracking().Select(a => new { a.Id, a.Company, a.Title }).ToListAsync(RequestAborted);
            var ids = headings.Where(a => ApplicationDuplicates.Normalize(a.Company) == company && ApplicationDuplicates.Normalize(a.Title) == title).Select(a => a.Id).ToList();
            if (ids.Count > 0)
            {
                var candidates = await db.Applications.AsNoTracking().Where(a => ids.Contains(a.Id)).Select(a => new { a.Id, a.Company, a.Title, a.RawDescription, a.Status, a.AppliedDate }).ToListAsync(RequestAborted);
                var matches = candidates.Select(a => new { a.Id, a.Company, a.Title, a.Status, a.AppliedDate,
                    descriptionSimilarity = ApplicationDuplicates.DescriptionSimilarity(req.RawDescription, a.RawDescription) })
                    .Where(a => a.descriptionSimilarity >= ApplicationDuplicates.Threshold).OrderByDescending(a => a.descriptionSimilarity).Take(10).ToList();
                if (matches.Count > 0) return Conflict(new { code = "application_duplicate", threshold = ApplicationDuplicates.Threshold,
                    error = "A similar application already exists. Review the matches before saving another.", matches });
            }
        }
        var app = new Application { Id = req.RequestId ?? Guid.NewGuid(), UserId = UserId, Title = req.Title.Trim(), Company = req.Company?.Trim() ?? "", JobUrl = req.JobUrl, RawDescription = req.RawDescription, Status = req.Status, AppliedDate = req.AppliedDate ?? DateTimeOffset.UtcNow, ResumeId = req.ResumeId };
        db.Applications.Add(app);
        Event(app, "created", "Application created");
        var run = automation.Configured("skill_extraction") && !string.IsNullOrWhiteSpace(app.RawDescription) ? automation.Queue(UserId, "skill_extraction", app) : null;
        await db.SaveChangesAsync(RequestAborted);
        if (transaction != null) await transaction.CommitAsync(RequestAborted);
        return Ok(new { application = View(app), wasDuplicate = false, automationTriggered = run != null, runId = run?.Id });
    }
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, EditApplicationRequest req)
    {
        if (Validate(req.Application) is string error) return BadRequest(error);
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id, RequestAborted);
        if (app == null) return NotFound();
        if (req.Version != app.Version) return Conflict("This application changed. Reload before saving.");
        var input = req.Application;
        if (input.ResumeId != null && !await db.Resumes.AnyAsync(r => r.Id == input.ResumeId, RequestAborted)) return BadRequest("Resume not found.");
        var descriptionChanged = app.RawDescription != input.RawDescription;
        var previousStatus = app.Status;
        app.Title = input.Title.Trim(); app.Company = input.Company?.Trim() ?? ""; app.JobUrl = input.JobUrl;
        app.RawDescription = input.RawDescription; app.AppliedDate = input.AppliedDate ?? app.AppliedDate; app.Status = input.Status;
        app.ResumeId = input.ResumeId;
        if (previousStatus != input.Status) Event(app, "status_changed", $"{previousStatus} → {input.Status}");
        if (descriptionChanged)
        {
            app.RequirementsEmbedding = null;
            db.ApplicationSkills.RemoveRange(await db.ApplicationSkills.Where(s => s.ApplicationId == id).ToListAsync(RequestAborted));
            app.ExtractionRunId = null;
            if (automation.Configured("skill_extraction") && !string.IsNullOrWhiteSpace(app.RawDescription)) automation.Queue(UserId, "skill_extraction", app);
        }
        Event(app, "edited", "Application details updated");
        await db.SaveChangesAsync(RequestAborted);
        return await GetDetail(id);
    }
    [HttpPatch("{id:guid}/follow-up")]
    public async Task<IActionResult> FollowUp(Guid id, FollowUpRequest req)
    {
        if (req.NextAction?.Length > 2000 || req.ContactName?.Length > 200 || (req.ContactEmail?.Length > 0 && !new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(req.ContactEmail))) return BadRequest("Invalid follow-up or contact details.");
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id, RequestAborted);
        if (app == null) return NotFound();
        if (req.Version != app.Version) return Conflict("This application changed. Reload before saving.");
        app.NextAction = req.NextAction; app.FollowUpAt = req.FollowUpAt; app.SnoozedUntil = req.SnoozedUntil;
        app.ContactName = req.ContactName; app.ContactEmail = req.ContactEmail;
        if (req.ResponseReceived) app.LastEmployerResponseAt = DateTimeOffset.UtcNow;
        Event(app, req.ResponseReceived ? "response_received" : "follow_up", req.ResponseReceived ? "Employer response recorded" : "Follow-up updated");
        await db.SaveChangesAsync(RequestAborted);
        return await GetDetail(id);
    }
    [HttpPost("{id:guid}/notes")]
    public async Task<IActionResult> AddNote(Guid id, NoteRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Body) || req.Body.Length > 10000) return BadRequest("A note of up to 10,000 characters is required.");
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id, RequestAborted);
        if (app == null) return NotFound();
        Event(app, "note", req.Body.Trim()); await db.SaveChangesAsync(RequestAborted);
        return await GetDetail(id);
    }
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id, RequestAborted);
        if (app == null) return NotFound();
        db.AutomationRuns.RemoveRange(await db.AutomationRuns.Where(r => r.ApplicationId == id).ToListAsync(RequestAborted));
        db.AutomationLogEntries.RemoveRange(await db.AutomationLogEntries.Where(r => r.ApplicationId == id).ToListAsync(RequestAborted));
        db.Applications.Remove(app); await db.SaveChangesAsync(RequestAborted); return NoContent();
    }
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, UpdateStatusRequest req)
    {
        if (!Enum.IsDefined(req.Status)) return BadRequest("Unknown status.");
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id, RequestAborted);
        if (app == null) return NotFound();
        if (req.Version != app.Version) return Conflict("This application changed. Reload before saving.");
        if (app.Status != req.Status)
        {
            var old = app.Status;
            if (old == ApplicationStatus.Saved && req.Status == ApplicationStatus.Applied) app.AppliedDate = DateTimeOffset.UtcNow;
            app.Status = req.Status; Event(app, "status_changed", $"{old} → {req.Status}"); await db.SaveChangesAsync(RequestAborted);
        }
        return await GetDetail(id);
    }
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetDetail(Guid id)
    {
        var app = await db.Applications.AsNoTracking().AsSplitQuery().Include(a => a.TimelineEvents).Include(a => a.StageDetails).FirstOrDefaultAsync(a => a.Id == id, RequestAborted);
        if (app == null) return NotFound();
        var score = (await fitScorer.ScoreAsync(UserId, new() { id }, RequestAborted)).GetValueOrDefault(id);
        var zone = await db.UserProfiles.Where(p => p.UserId == UserId).Select(p => p.TimeZone).FirstOrDefaultAsync(RequestAborted) ?? "UTC";
        return Ok(View(app, score, zone));
    }
    public static object View(Application a, FitBreakdown? fit = null, string timeZone = "UTC") => new
    {
        a.Id, a.Title, a.Company, a.JobUrl, a.RawDescription, a.Status, a.AppliedDate, a.UpdatedAt, a.Version,
        a.ResumeId, a.NextAction, a.FollowUpAt, a.SnoozedUntil, a.LastEmployerResponseAt, a.ContactName, a.ContactEmail,
        fitPercentage = fit?.Overall, fit, extractionRunId = a.ExtractionRunId,
        nextDeadlineAt = a.Status >= ApplicationStatus.Applied && a.Status <= ApplicationStatus.Offered ? DeadlineService.All(a, timeZone).Select(d => (DateTimeOffset?)d.DueAt).Min() : null,
        timeline = a.TimelineEvents.OrderByDescending(t => t.CreatedAt).Select(t => new { t.Id, t.Type, t.Body, t.CreatedAt }),
        stageDetails = a.StageDetails.OrderBy(s => s.CreatedAt).Select(StageView)
    };
    public static object StageView(StageDetail s) => new { s.Id, s.Stage, s.FieldsJson, s.CreatedAt, s.Version, s.GeneratedQuestions, s.QuestionRunId };
    [HttpPut("{id:guid}/stage-details")]
    public async Task<IActionResult> UpsertStageDetail(Guid id, UpsertStageDetailRequest req)
    {
        if (!Enum.IsDefined(req.Stage) || req.Stage == ApplicationStatus.Saved) return BadRequest("Invalid stage.");
        if (InputValidation.StageFields(req.Stage, req.Fields) is string error) return BadRequest(error);
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id, RequestAborted);
        if (app == null) return NotFound();
        var target = req.StageDetailId.HasValue ? await db.StageDetails.FirstOrDefaultAsync(s => s.Id == req.StageDetailId && s.ApplicationId == id, RequestAborted) :
            req.Stage == ApplicationStatus.InterviewScheduled ? null : await db.StageDetails.FirstOrDefaultAsync(s => s.ApplicationId == id && s.Stage == req.Stage, RequestAborted);
        if (req.StageDetailId.HasValue && target == null) return NotFound();
        if (target != null && (target.Stage != req.Stage || req.Version != target.Version)) return Conflict("Stage details changed. Reload before saving.");
        if (target == null) { target = new StageDetail { Id = Guid.NewGuid(), ApplicationId = id, Stage = req.Stage }; db.StageDetails.Add(target); }
        target.FieldsJson = JsonSerializer.Serialize(req.Fields); target.Version = Guid.NewGuid();
        Event(app, "stage_updated", $"{req.Stage} details updated"); await db.SaveChangesAsync(RequestAborted);
        return Ok(StageView(target));
    }
    [HttpGet("{id:guid}/automation-status")]
    public async Task<IActionResult> GetAutomationStatus(Guid id, string type = "skill_extraction", Guid? runId = null)
    {
        if (!await db.Applications.AnyAsync(a => a.Id == id, RequestAborted)) return NotFound();
        var query = db.AutomationRuns.Where(r => r.ApplicationId == id && r.Type == type);
        var run = runId.HasValue ? await query.FirstOrDefaultAsync(r => r.Id == runId, RequestAborted) : await query.OrderByDescending(r => r.CreatedAt).FirstOrDefaultAsync(RequestAborted);
        if (runId.HasValue && run == null) return NotFound();
        return Ok(AutomationService.View(run));
    }
    [HttpPost("{id:guid}/retry-skill-extraction")]
    public async Task<IActionResult> RetrySkillExtraction(Guid id)
    {
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id, RequestAborted);
        if (app == null) return NotFound();
        if (!automation.Configured("skill_extraction")) return BadRequest("Skill extraction is not configured.");
        if (string.IsNullOrWhiteSpace(app.RawDescription)) return BadRequest("Add a job description before extraction.");
        var run = automation.Queue(UserId, "skill_extraction", app); app.Version = Guid.NewGuid();
        await db.SaveChangesAsync(RequestAborted); return Accepted(AutomationService.View(run));
    }
    [HttpPost("{id:guid}/interview-questions")]
    public async Task<IActionResult> GenerateInterviewQuestions(Guid id, GenerateQuestionsRequest req)
    {
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id, RequestAborted);
        var stage = await db.StageDetails.FirstOrDefaultAsync(s => s.Id == req.StageDetailId && s.ApplicationId == id && s.Stage == ApplicationStatus.InterviewScheduled, RequestAborted);
        if (app == null || stage == null) return NotFound("Save this interview round before generating questions.");
        if (!automation.Configured("interview_questions")) return BadRequest("Interview question generation is not configured.");
        var run = automation.Queue(UserId, "interview_questions", app, stage: stage); stage.Version = Guid.NewGuid();
        await db.SaveChangesAsync(RequestAborted); return Accepted(AutomationService.View(run));
    }
    private void Event(Application app, string type, string body)
    {
        app.UpdatedAt = DateTimeOffset.UtcNow; app.Version = Guid.NewGuid();
        db.TimelineEvents.Add(new TimelineEvent { Id = Guid.NewGuid(), ApplicationId = app.Id, Type = type, Body = body });
    }
    public static string? Validate(CreateApplicationRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Length > 200 || req.Company?.Length > 200 || req.RawDescription == null || req.RawDescription.Length > 100000) return "Invalid title, company, or description.";
        if (!InputValidation.WebUrl(req.JobUrl) || !Enum.IsDefined(req.Status)) return "Invalid posting URL or status.";
        if (req.AppliedDate > DateTimeOffset.UtcNow.AddDays(1)) return "Applied date cannot be in the future.";
        return null;
    }
    public record GenerateQuestionsRequest(Guid StageDetailId);
    public record EditApplicationRequest(Guid Version, CreateApplicationRequest Application);
    public record FollowUpRequest(Guid Version, string? NextAction, DateTimeOffset? FollowUpAt, DateTimeOffset? SnoozedUntil, bool ResponseReceived, string? ContactName, string? ContactEmail);
    public record NoteRequest(string Body);
}
public record CreateApplicationRequest(string Title, string? Company, string? JobUrl, string RawDescription,
    ApplicationStatus Status = ApplicationStatus.Applied, DateTimeOffset? AppliedDate = null, Guid? ResumeId = null, Guid? RequestId = null, bool AllowDuplicate = false);
