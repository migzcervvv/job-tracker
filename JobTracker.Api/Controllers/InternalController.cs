using JobTracker.Api.Data;
using JobTracker.Api.Dtos;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text.Json.Serialization;

[ApiController]
[Route("api/internal")]
public class InternalController(AppDbContext db, IConfiguration config, ISkillResolver skillResolver) : ControllerBase
{
    private bool IsAuthorized() =>
        Request.Headers.TryGetValue("X-Automation-Key", out var key) &&
        key == config["Automation:ApiKey"];

    // InternalController.cs — new action
    [HttpPut("resumes/{id}/extraction")]
    public async Task<IActionResult> SetResumeExtraction(Guid id, [FromBody] ResumeExtractionRequest req)
    {
        if (!IsAuthorized()) return Unauthorized();

        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume is null) return NotFound();

        resume.ExtractedText = req.ExtractedText;
        resume.ProposedSkillsJson = System.Text.Json.JsonSerializer.Serialize(req.SkillNames);
        resume.ExtractionStatus = (req.SkillNames?.Count ?? 0) == 0 && string.IsNullOrWhiteSpace(req.ExtractedText)
            ? "failed"
            : "succeeded";

        var profile = await db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == resume.UserId);
        if (profile is null)
        {
            profile = new UserProfile { UserId = resume.UserId };
            db.UserProfiles.Add(profile);
        }

        profile.ExperienceYears = req.ExperienceYears ?? 0;
        profile.Education = req.Education;
        profile.ResumeRawText = req.ExtractedText;

        if (!string.IsNullOrWhiteSpace(req.SeniorityLevel)
            && Enum.TryParse<SeniorityLevel>(req.SeniorityLevel, ignoreCase: true, out var parsedSeniority))
        {
            profile.SeniorityLevel = parsedSeniority;
        }

        if (req.ResumeEmbedding is { Count: > 0 })
        {
            profile.ResumeEmbedding = new Pgvector.Vector(req.ResumeEmbedding.ToArray());
        }

        await db.SaveChangesAsync();

        return Ok(new { resume.Id, skillCount = req.SkillNames?.Count ?? 0, extractedTextLength = req.ExtractedText?.Length ?? 0 });
    }

    [HttpPost("applications/{id:guid}/requirements")]
    public async Task<IActionResult> UpdateRequirements(Guid id, [FromBody] UpdateApplicationRequirementsRequest dto)
    {
        var application = await db.Applications.FindAsync(id);
        if (application is null) return NotFound();

        application.RequiredExperienceYears = dto.RequiredExperienceYears;
        application.SeniorityLevel = dto.SeniorityLevel.HasValue
            ? (SeniorityLevel)dto.SeniorityLevel.Value
            : null;
        application.EducationRequirement = dto.EducationRequirement;
        application.JobEmbedding = dto.JobEmbedding is { Length: 1536 }
            ? new Pgvector.Vector(dto.JobEmbedding)
            : null;

        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("applications/{id}/skills")]
public async Task<IActionResult> SetApplicationSkillsFromAutomation(Guid id, [FromBody] UpdateApplicationSkillsRequest req)
{
    if (!IsAuthorized()) return Unauthorized();

    var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id);
    if (app is null) return NotFound();

    var names = req.Skills.Select(s => s.Name).ToList();
    var resolved = await skillResolver.ResolveSkillsAsync(names);
    var idByName = resolved.ToDictionary(s => s.Name, s => s.Id);

    var existingLinks = await db.ApplicationSkills.Where(x => x.ApplicationId == id).ToListAsync();
    db.ApplicationSkills.RemoveRange(existingLinks);

    foreach (var dto in req.Skills)
    {
        var normalized = dto.Name.Trim().ToLowerInvariant();
        if (!idByName.TryGetValue(normalized, out var skillId)) continue;
        db.ApplicationSkills.Add(new ApplicationSkill
        {
            ApplicationId = id, SkillId = skillId, Importance = dto.Importance,
        });
    }

    if (req.RequirementsEmbedding is { Length: 1536 })
        app.RequirementsEmbedding = new Pgvector.Vector(req.RequirementsEmbedding);

    await db.SaveChangesAsync();
    return Ok(new { skillCount = req.Skills.Count, embedded = app.RequirementsEmbedding != null });
}

    // InternalController.cs
    [HttpPut("applications/{id}/interview-questions")]
    public async Task<IActionResult> SetInterviewQuestions(Guid id, [FromBody] InterviewQuestionsRequest req)
    {
        if (!IsAuthorized()) return Unauthorized();

        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id);
        if (app is null) return NotFound();

        var detail = await db.StageDetails
            .Where(s => s.ApplicationId == id && s.Stage == ApplicationStatus.InterviewScheduled)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync();

        Dictionary<string, object?> fields;
        if (detail is null)
        {
            detail = new StageDetail
            {
                Id = Guid.NewGuid(),
                ApplicationId = id,
                Stage = ApplicationStatus.InterviewScheduled,
            };
            db.StageDetails.Add(detail);
            fields = new Dictionary<string, object?> { ["round"] = req.Round };
        }
        else
        {
            fields = JsonSerializer.Deserialize<Dictionary<string, object?>>(detail.FieldsJson)
                     ?? new Dictionary<string, object?>();
        }

        // Append rather than overwrite — the user may have typed their own notes.
        var existing = fields.TryGetValue("prepNotes", out var pn) ? pn?.ToString() ?? "" : "";
        fields["prepNotes"] = string.IsNullOrWhiteSpace(existing)
            ? req.Questions
            : $"{existing}\n\n--- Suggested questions ---\n{req.Questions}";

        detail.FieldsJson = JsonSerializer.Serialize(fields);

        db.TimelineEvents.Add(new TimelineEvent
        {
            Id = Guid.NewGuid(),
            ApplicationId = id,
            Type = "note",
            Body = $"Interview questions generated for round {req.Round}",
        });

        await db.SaveChangesAsync();
        return Ok(new { questionsLength = req.Questions.Length });
    }

    [HttpGet("reminders/stale")]
    public async Task<IActionResult> GetStaleApplications([FromQuery] int days = 7)
    {
        if (!IsAuthorized()) return Unauthorized();

        var cutoff = DateTimeOffset.UtcNow.AddDays(-days);
        var terminal = new[]
        {
        ApplicationStatus.Rejected, ApplicationStatus.OfferAccepted,
        ApplicationStatus.OfferDeclined, ApplicationStatus.Withdrawn, ApplicationStatus.Archived,
    };

        // IgnoreQueryFilters: no JWT on this request, so the ambient tenant filter
        // is inert anyway — being explicit documents that this is deliberately
        // cross-user, and it's why the response groups by user.
        var apps = await db.Applications
            .IgnoreQueryFilters()
            .Include(a => a.TimelineEvents)
            .Where(a => !terminal.Contains(a.Status))
            .ToListAsync();

        var stale = apps
            .Select(a => new
            {
                a.Id,
                a.UserId,
                a.Title,
                a.Company,
                LastActivity = a.TimelineEvents.Any() ? a.TimelineEvents.Max(t => t.CreatedAt) : a.CreatedAt,
            })
            .Where(a => a.LastActivity < cutoff)
            .ToList();

        var userIds = stale.Select(s => s.UserId).Distinct().ToList();
        var emails = await db.Users.Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Email);

        return Ok(stale.GroupBy(s => s.UserId).Select(g => new
        {
            userId = g.Key,
            email = emails.GetValueOrDefault(g.Key),
            applications = g.Select(a => new
            {
                a.Id,
                a.Title,
                a.Company,
                daysSinceActivity = (int)(DateTimeOffset.UtcNow - a.LastActivity).TotalDays,
            }).OrderByDescending(a => a.daysSinceActivity),
        }));
    }

    [HttpGet("digest/weekly")]
    public async Task<IActionResult> GetWeeklyDigest()
    {
        if (!IsAuthorized()) return Unauthorized();

        var weekAgo = DateTimeOffset.UtcNow.AddDays(-7);
        var apps = await db.Applications.IgnoreQueryFilters().Include(a => a.TimelineEvents).ToListAsync();
        var userIds = apps.Select(a => a.UserId).Distinct().ToList();
        var emails = await db.Users.Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Email);

        return Ok(apps.GroupBy(a => a.UserId).Select(g => new
        {
            userId = g.Key,
            email = emails.GetValueOrDefault(g.Key),
            newThisWeek = g.Count(a => a.AppliedDate >= weekAgo),
            statusChanges = g.Sum(a => a.TimelineEvents.Count(t => t.Type == "status_changed" && t.CreatedAt >= weekAgo)),
            interviewsScheduled = g.Count(a => a.Status == ApplicationStatus.InterviewScheduled),
            offers = g.Count(a => a.Status == ApplicationStatus.Offered),
            activeTotal = g.Count(a => a.Status < ApplicationStatus.Rejected),
        }));
    }
    public record InterviewQuestionsRequest(int Round, string Questions);
    public record UpdateApplicationSkillsRequest(List<SkillImportanceDto> Skills, float[]? RequirementsEmbedding);
    public record ResumeExtractionRequest(
        string ExtractedText,
        [property: JsonPropertyName("skills")] List<string> SkillNames,
        int? ExperienceYears,
        string? SeniorityLevel,
        string? Education,
        List<float>? ResumeEmbedding
    );
}