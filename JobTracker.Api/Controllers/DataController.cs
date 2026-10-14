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
[ApiController, Route("api/data"), Authorize]
public class DataController(AppDbContext db, ISkillResolver resolver) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet("export")]
    public async Task<IActionResult> Export()
    {
        var apps = await db.Applications.AsNoTracking().Include(a => a.StageDetails).Include(a => a.TimelineEvents).ToListAsync();
        var links = await db.ApplicationSkills.AsNoTracking().Include(s => s.Skill).ToListAsync();
        return Ok(new { schemaVersion = 1, exportedAt = DateTimeOffset.UtcNow,
            applications = apps.Select(a => new PortableApplication(
                new CreateApplicationRequest(a.Title, a.Company, a.JobUrl, a.RawDescription, a.Status, a.AppliedDate, RequestId: a.Id),
                links.Where(s => s.ApplicationId == a.Id).Select(s => new SkillImportanceDto { Name = s.Skill!.Name, Importance = Math.Clamp(s.Importance, 1, 3) }).ToList(),
                a.StageDetails.Select(s => new PortableStage(s.Stage, JsonSerializer.Deserialize<Dictionary<string, object?>>(s.FieldsJson) ?? [], s.GeneratedQuestions)).ToList(),
                a.TimelineEvents.Where(t => t.Type == "note").Select(t => t.Body).ToList(),
                a.NextAction, a.FollowUpAt, a.SnoozedUntil, a.LastEmployerResponseAt, a.ContactName, a.ContactEmail)) });
    }
    [HttpPost("import"), RequestSizeLimit(5_000_000)]
    public async Task<IActionResult> Import(ImportRequest req)
    {
        if (req.SchemaVersion != 1 || req.Applications == null || req.Applications.Count > 500) return BadRequest("Use schemaVersion 1 with at most 500 applications.");
        foreach (var row in req.Applications)
        {
            if (row == null || row.Application == null || ApplicationsController.Validate(row.Application) is string) return BadRequest("Invalid application in import.");
            if (row.Skills?.Count > 200 || row.Skills?.Any(s => s == null || string.IsNullOrWhiteSpace(s.Name) || s.Name.Length > 100 || s.Importance is < 1 or > 3) == true) return BadRequest("Invalid imported skills.");
            if (row.StageDetails?.Count > 100 || row.StageDetails?.Any(s => s == null || s.Fields == null || !Enum.IsDefined(s.Stage) || s.Stage == ApplicationStatus.Saved || InputValidation.StageFields(s.Stage, s.Fields) != null || s.GeneratedQuestions?.Length > 50000) == true) return BadRequest("Invalid imported stage details.");
            if (row.Notes?.Count > 500 || row.Notes?.Any(n => string.IsNullOrWhiteSpace(n) || n.Length > 10000) == true || row.NextAction?.Length > 2000 || row.ContactName?.Length > 200 || row.ContactEmail?.Length > 320 || (!string.IsNullOrEmpty(row.ContactEmail) && !new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(row.ContactEmail))) return BadRequest("Invalid imported notes or follow-up.");
        }
        await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync() : null;
        var imported = 0; var skipped = 0; var seen = new HashSet<Guid>();
        foreach (var row in req.Applications)
        {
            var input = row.Application; var id = input.RequestId ?? Guid.NewGuid();
            if (!seen.Add(id) || await db.Applications.AnyAsync(a => a.Id == id)) { skipped++; continue; }
            // Never reuse another tenant's primary key. Do not reveal that tenant's data.
            if (await db.Applications.IgnoreQueryFilters().AnyAsync(a => a.Id == id)) return BadRequest("An imported ID is unavailable.");
            var app = new Application { Id = id, UserId = UserId, Title = input.Title.Trim(), Company = input.Company?.Trim() ?? "", JobUrl = input.JobUrl, RawDescription = input.RawDescription, Status = input.Status, AppliedDate = input.AppliedDate ?? DateTimeOffset.UtcNow,
                NextAction = row.NextAction, FollowUpAt = row.FollowUpAt, SnoozedUntil = row.SnoozedUntil, LastEmployerResponseAt = row.LastEmployerResponseAt, ContactName = row.ContactName, ContactEmail = row.ContactEmail };
            db.Applications.Add(app);
            var desired = (row.Skills ?? []).GroupBy(s => SkillResolver.Normalize(s.Name)).ToDictionary(g => g.Key, g => g.Max(s => s.Importance));
            foreach (var skill in await resolver.ResolveSkillsAsync(desired.Keys.ToList())) db.ApplicationSkills.Add(new ApplicationSkill { ApplicationId = id, SkillId = skill.Id, Importance = desired[skill.Name] });
            foreach (var stage in row.StageDetails ?? []) db.StageDetails.Add(new StageDetail { Id = Guid.NewGuid(), ApplicationId = id, Stage = stage.Stage, FieldsJson = JsonSerializer.Serialize(stage.Fields), GeneratedQuestions = stage.GeneratedQuestions });
            foreach (var note in row.Notes ?? []) db.TimelineEvents.Add(new TimelineEvent { Id = Guid.NewGuid(), ApplicationId = id, Type = "note", Body = note });
            db.TimelineEvents.Add(new TimelineEvent { Id = Guid.NewGuid(), ApplicationId = id, Type = "imported", Body = "Imported from personal backup" });
            imported++;
        }
        await db.SaveChangesAsync(); if (tx != null) await tx.CommitAsync();
        return Ok(new { imported, skipped });
    }
    public record ImportRequest(int SchemaVersion, List<PortableApplication> Applications);
    public record PortableStage(ApplicationStatus Stage, Dictionary<string, object?> Fields, string? GeneratedQuestions = null);
    public record PortableApplication(CreateApplicationRequest Application, List<SkillImportanceDto>? Skills = null, List<PortableStage>? StageDetails = null, List<string>? Notes = null,
        string? NextAction = null, DateTimeOffset? FollowUpAt = null, DateTimeOffset? SnoozedUntil = null, DateTimeOffset? LastEmployerResponseAt = null, string? ContactName = null, string? ContactEmail = null);
}
