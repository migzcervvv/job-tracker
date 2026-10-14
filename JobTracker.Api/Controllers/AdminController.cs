using System.Data;
using System.Security.Claims;
using JobTracker.Api.Data;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Api.Controllers;
[ApiController, Route("api/admin"), Authorize(Roles = "admin")]
public class AdminController(AppDbContext db, IdentityStoreContext identity, UserManager<IdentityUser<Guid>> users, IAppStartTime startTime, IN8nHealthChecker n8nHealth) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet("users")]
    public async Task<IActionResult> ListUsers()
    {
        var records = await users.Users.OrderBy(u => u.Email).Take(500).ToListAsync();
        var counts = await db.Applications.IgnoreQueryFilters().GroupBy(a => a.UserId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(g => g.Key, g => g.Count);
        var result = new List<object>();
        foreach (var user in records) result.Add(new { user.Id, user.Email, role = (await users.GetRolesAsync(user)).FirstOrDefault() ?? "user", applicationCount = counts.GetValueOrDefault(user.Id) });
        return Ok(result);
    }
    [HttpPut("users/{id:guid}/role")]
    public async Task<IActionResult> SetUserRole(Guid id, SetRoleRequest req)
    {
        if (req.Role is not ("user" or "admin")) return BadRequest("Role must be user or admin.");
        if (id == UserId) return BadRequest("You cannot change your own role.");
        await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable) : null;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user == null) return NotFound();
        var current = await db.UserRoles.Where(r => r.UserId == id).ToListAsync();
        var roles = await db.Roles.ToListAsync();
        if (current.Any(r => roles.Any(role => role.Id == r.RoleId && role.Name == "test"))) return BadRequest("Demo accounts cannot be promoted.");
        var adminRole = roles.Single(r => r.Name == "admin");
        if (req.Role != "admin" && current.Any(r => r.RoleId == adminRole.Id) && await db.UserRoles.CountAsync(r => r.RoleId == adminRole.Id) <= 1) return Conflict("The last administrator cannot be demoted.");
        var desired = roles.Single(r => r.Name == req.Role);
        db.UserRoles.RemoveRange(current.Where(r => r.RoleId != desired.Id));
        if (!current.Any(r => r.RoleId == desired.Id)) db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = id, RoleId = desired.Id });
        user.SecurityStamp = Guid.NewGuid().ToString(); user.ConcurrencyStamp = Guid.NewGuid().ToString();
        await db.SaveChangesAsync(); if (tx != null) await tx.CommitAsync(); return Ok();
    }
    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id)
    {
        if (id == UserId) return BadRequest("You cannot delete your own account.");
        await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable) : null;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user == null) return NotFound();
        var adminRole = await db.Roles.FirstOrDefaultAsync(r => r.Name == "admin");
        if (adminRole != null && await db.UserRoles.AnyAsync(r => r.UserId == id && r.RoleId == adminRole.Id) && await db.UserRoles.CountAsync(r => r.RoleId == adminRole.Id) <= 1) return Conflict("The last administrator cannot be deleted.");
        var apps = await db.Applications.IgnoreQueryFilters().Include(a => a.TimelineEvents).Include(a => a.StageDetails).Where(a => a.UserId == id).ToListAsync();
        var appIds = apps.Select(a => a.Id).ToList();
        var resumes = await db.Resumes.IgnoreQueryFilters().Where(r => r.UserId == id).ToListAsync();
        foreach (var resume in resumes) db.StorageDeletions.Add(new StorageDeletion { StoragePath = resume.StoragePath });
        db.Resumes.RemoveRange(resumes);
        db.UserProfiles.RemoveRange(await db.UserProfiles.IgnoreQueryFilters().Where(p => p.UserId == id).ToListAsync());
        db.UserSkills.RemoveRange(await db.UserSkills.IgnoreQueryFilters().Where(s => s.UserId == id).ToListAsync());
        db.ApplicationSkills.RemoveRange(await db.ApplicationSkills.IgnoreQueryFilters().Where(s => appIds.Contains(s.ApplicationId)).ToListAsync());
        db.AutomationRuns.RemoveRange(await db.AutomationRuns.IgnoreQueryFilters().Where(r => r.UserId == id).ToListAsync());
        db.NotificationReceipts.RemoveRange(await db.NotificationReceipts.IgnoreQueryFilters().Where(r => r.UserId == id).ToListAsync());
        db.AutomationLogEntries.RemoveRange(await db.AutomationLogEntries.Where(r => r.ApplicationId != null && appIds.Contains(r.ApplicationId.Value)).ToListAsync());
        db.Applications.RemoveRange(apps); db.Users.Remove(user);
        await db.SaveChangesAsync(); if (tx != null) await tx.CommitAsync();
        return Accepted(new { status = "account_deleted", storageCleanup = "queued" });
    }
    [HttpPost("users")]
    public async Task<IActionResult> CreateUser(CreateUserRequest req)
    {
        if (req.Role is not ("user" or "admin")) return BadRequest("Role must be user or admin.");
        await using var tx = identity.Database.IsRelational() ? await identity.Database.BeginTransactionAsync() : null;
        var user = new IdentityUser<Guid> { Email = req.Email, UserName = req.Email };
        var result = await users.CreateAsync(user, req.Password);
        if (!result.Succeeded) return BadRequest(result.Errors.Select(e => e.Description));
        result = await users.AddToRoleAsync(user, req.Role);
        if (!result.Succeeded) {
            if (tx == null && !(await users.DeleteAsync(user)).Succeeded) throw new InvalidOperationException("User creation rollback failed.");
            return BadRequest(result.Errors.Select(e => e.Description));
        }
        if (tx != null) await tx.CommitAsync();
        return Ok(new { user.Id, user.Email, req.Role });
    }
    [HttpGet("health")]
    public async Task<IActionResult> Health() => Ok(new { api = "healthy", uptimeSeconds = (long)(DateTimeOffset.UtcNow - startTime.StartedAt).TotalSeconds, database = await db.Database.CanConnectAsync() ? "healthy" : "unreachable", n8n = await n8nHealth.CheckAsync() });
    [HttpGet("automation-log")]
    public async Task<IActionResult> Log(int take = 50, string? status = null)
    {
        var query = db.AutomationRuns.IgnoreQueryFilters().AsNoTracking();
        if (status != null) query = query.Where(r => r.Status == status);
        return Ok(await query.OrderByDescending(r => r.CreatedAt).Take(Math.Clamp(take, 1, 200)).Select(r => new { r.Id, r.Type, r.Status, r.ApplicationId, r.ResumeId, r.StageDetailId, r.CreatedAt, r.UpdatedAt, r.Attempts, message = r.ErrorCode }).ToListAsync());
    }
    [HttpPost("automation/{id:guid}/retry")]
    public async Task<IActionResult> Retry(Guid id)
    {
        // Re-dispatch only a still-current resource with a new run ID; old deliveries remain invalid.
        var old = await db.AutomationRuns.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id);
        if (old == null) return NotFound();
        if (!AutomationRun.IsTerminal(old.Status)) return Conflict("Run is still active.");
        var app = old.ApplicationId == null ? null : await db.Applications.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == old.ApplicationId);
        var resume = old.ResumeId == null ? null : await db.Resumes.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == old.ResumeId);
        var stage = old.StageDetailId == null ? null : await db.StageDetails.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.Id == old.StageDetailId);
        if (app == null && resume == null || old.Type == "interview_questions" && stage == null) return NotFound();
        var currentId = old.Type == "skill_extraction" ? app?.ExtractionRunId : old.Type == "resume_extraction" ? resume?.ExtractionRunId : stage?.QuestionRunId;
        if (currentId != old.Id) return Conflict("A newer run already exists.");
        var run = new AutomationRun { UserId = old.UserId, Type = old.Type, ApplicationId = old.ApplicationId, ResumeId = old.ResumeId, StageDetailId = old.StageDetailId };
        db.AutomationRuns.Add(run);
        if (run.Type == "skill_extraction") { app!.ExtractionRunId = run.Id; app.Version = Guid.NewGuid(); }
        if (resume != null) { resume.ExtractionRunId = run.Id; resume.ExtractionStatus = "queued"; resume.Version = Guid.NewGuid(); }
        if (stage != null) { stage.QuestionRunId = run.Id; stage.Version = Guid.NewGuid(); }
        await db.SaveChangesAsync(); return Accepted(AutomationService.View(run));
    }
    [HttpGet("skills")]
    public async Task<IActionResult> ListSkills(string? search, int page = 1, int pageSize = 20)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Skills.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim().ToLower(); query = query.Where(s => s.Name.Contains(term)); }
        var totalCount = await query.CountAsync();
        var items = await query.OrderBy(s => s.Name).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(s => new { s.Id, s.Name, applicationUsage = db.ApplicationSkills.IgnoreQueryFilters().Count(l => l.SkillId == s.Id),
                requiredUsage = db.ApplicationSkills.IgnoreQueryFilters().Count(l => l.SkillId == s.Id && l.Importance == 3),
                userUsage = db.UserSkills.IgnoreQueryFilters().Count(l => l.SkillId == s.Id) }).ToListAsync();
        return Ok(new { items, totalCount, page, pageSize });
    }
    [HttpGet("skills/{id:guid}")]
    public async Task<IActionResult> SkillDetails(Guid id)
    {
        var skill = await db.Skills.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id);
        if (skill == null) return NotFound();
        var links = await db.ApplicationSkills.IgnoreQueryFilters().AsNoTracking().Where(l => l.SkillId == id)
            .Select(l => new { l.ApplicationId, l.Importance }).ToListAsync();
        var ids = links.Select(l => l.ApplicationId).ToList();
        var roles = await db.Applications.IgnoreQueryFilters().AsNoTracking().Where(a => ids.Contains(a.Id))
            .GroupBy(a => a.Title).Select(g => new { title = g.Key, count = g.Count() }).OrderByDescending(r => r.count).ThenBy(r => r.title).Take(8).ToListAsync();
        var related = await db.ApplicationSkills.IgnoreQueryFilters().AsNoTracking().Where(l => ids.Contains(l.ApplicationId) && l.SkillId != id)
            .GroupBy(l => new { l.SkillId, l.Skill!.Name }).Select(g => new { id = g.Key.SkillId, name = g.Key.Name, count = g.Count() })
            .OrderByDescending(r => r.count).ThenBy(r => r.name).Take(8).ToListAsync();
        var postings = await db.Applications.IgnoreQueryFilters().AsNoTracking().Where(a => ids.Contains(a.Id))
            .OrderByDescending(a => a.AppliedDate).Select(a => new { a.Title, a.RawDescription }).Take(30).ToListAsync();
        var examples = postings.Select(a => new { a.Title, text = SkillExcerpt(a.RawDescription, skill.Name) })
            .Where(a => a.text != null).Take(3).ToList();
        var names = await db.Skills.AsNoTracking().Where(s => s.Id != id).Select(s => new { s.Id, s.Name }).ToListAsync();
        var normalized = ApplicationDuplicates.Normalize(skill.Name).Replace(" ", "");
        var aliases = names.Where(s => {
            var candidate = ApplicationDuplicates.Normalize(s.Name).Replace(" ", "");
            return candidate == normalized || normalized.Length >= 3 && candidate.Length >= 3 &&
                (candidate.StartsWith(normalized, StringComparison.Ordinal) || normalized.StartsWith(candidate, StringComparison.Ordinal));
        }).OrderBy(s => s.Name.Length).ThenBy(s => s.Name).Take(8).ToList();
        return Ok(new { skill.Id, skill.Name, applicationUsage = links.Count,
            userUsage = await db.UserSkills.IgnoreQueryFilters().CountAsync(l => l.SkillId == id),
            requiredCount = links.Count(l => l.Importance == 3), preferredCount = links.Count(l => l.Importance == 2),
            niceToHaveCount = links.Count(l => l.Importance == 1), roles, examples, relatedSkills = related, suggestedAliases = aliases });
    }
    private static string? SkillExcerpt(string description, string name)
    {
        var text = System.Text.RegularExpressions.Regex.Replace(description ?? "", @"<[^>]*>", " ");
        text = System.Text.RegularExpressions.Regex.Replace(text, @"\s+", " ").Trim();
        var index = text.IndexOf(name, StringComparison.OrdinalIgnoreCase);
        if (index < 0) return null;
        var start = Math.Max(0, index - 90); var length = Math.Min(260, text.Length - start);
        return (start > 0 ? "…" : "") + text.Substring(start, length) + (start + length < text.Length ? "…" : "");
    }
    [HttpPost("skills/merge")]
    public async Task<IActionResult> MergeSkills(MergeSkillsRequest req)
    {
        if (req.SourceSkillId == req.TargetSkillId) return BadRequest("Choose different skills.");
        await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync() : null;
        var source = await db.Skills.FindAsync(req.SourceSkillId); var target = await db.Skills.FindAsync(req.TargetSkillId);
        if (source == null || target == null) return NotFound();
        var appLinks = await db.ApplicationSkills.IgnoreQueryFilters().Where(l => l.SkillId == source.Id || l.SkillId == target.Id).ToListAsync();
        var affected = appLinks.Where(l => l.SkillId == source.Id).Select(l => l.ApplicationId).ToList();
        foreach (var application in await db.Applications.IgnoreQueryFilters().Where(a => affected.Contains(a.Id)).ToListAsync()) application.Version = Guid.NewGuid();
        foreach (var link in appLinks.Where(l => l.SkillId == source.Id))
        {
            var replacement = appLinks.FirstOrDefault(l => l.ApplicationId == link.ApplicationId && l.SkillId == target.Id);
            if (replacement == null) { replacement = new ApplicationSkill { ApplicationId = link.ApplicationId, SkillId = target.Id }; db.ApplicationSkills.Add(replacement); }
            replacement.Importance = Math.Max(replacement.Importance, link.Importance); db.ApplicationSkills.Remove(link);
        }
        var userLinks = await db.UserSkills.IgnoreQueryFilters().Where(l => l.SkillId == source.Id || l.SkillId == target.Id).ToListAsync();
        foreach (var link in userLinks.Where(l => l.SkillId == source.Id))
        {
            var replacement = userLinks.FirstOrDefault(l => l.UserId == link.UserId && l.SkillId == target.Id);
            if (replacement == null) { replacement = new UserSkill { UserId = link.UserId, SkillId = target.Id }; db.UserSkills.Add(replacement); }
            replacement.Level = (SkillLevel)Math.Max((int)replacement.Level, (int)link.Level);
            if (link.EvidenceStrength >= replacement.EvidenceStrength) { replacement.EvidenceText = link.EvidenceText; replacement.EvidenceStrength = link.EvidenceStrength; }
            db.UserSkills.Remove(link);
        }
        db.Skills.Remove(source); await db.SaveChangesAsync(); if (tx != null) await tx.CommitAsync();
        return Ok(new { mergedInto = target.Name });
    }
    public record CreateUserRequest(string Email, string Password, string Role = "user");
}
public record SetRoleRequest(string Role);
public record MergeSkillsRequest(Guid SourceSkillId, Guid TargetSkillId);
