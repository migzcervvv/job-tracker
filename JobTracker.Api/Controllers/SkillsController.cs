using System.Security.Claims;
using JobTracker.Api.Data;
using JobTracker.Api.Dtos;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Api.Controllers;
[ApiController, Route("api"), Authorize]
public class SkillsController(AppDbContext db, ISkillResolver resolver) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private static bool ValidNames(List<string>? names) => names != null && names.Count <= 200 && names.All(n => !string.IsNullOrWhiteSpace(n) && n.Length <= 100);
    [HttpGet("me/skills")]
    public async Task<IActionResult> MySkills() => Ok(await db.UserSkills.OrderBy(s => s.Skill!.Name).Select(s => new { s.Skill!.Name, level = (int)s.Level, s.EvidenceText, s.EvidenceStrength }).ToListAsync());
    [HttpPost("me/skills")]
    public async Task<IActionResult> Add(SetSkillsRequest req)
    {
        if (!ValidNames(req.SkillNames)) return BadRequest("Invalid skill names.");
        var skills = await resolver.ResolveSkillsAsync(req.SkillNames);
        var existing = await db.UserSkills.Select(s => s.SkillId).ToListAsync();
        foreach (var skill in skills.Where(s => !existing.Contains(s.Id))) db.UserSkills.Add(new UserSkill { UserId = UserId, SkillId = skill.Id });
        await db.SaveChangesAsync(); return await MySkills();
    }
    [HttpDelete("me/skills/{name}")]
    public async Task<IActionResult> Remove(string name)
    {
        var normalized = SkillResolver.Normalize(name);
        var link = await db.UserSkills.FirstOrDefaultAsync(s => s.Skill!.Name == normalized);
        if (link != null) { db.UserSkills.Remove(link); await db.SaveChangesAsync(); }
        return NoContent();
    }
    [HttpPut("me/skills")]
    public IActionResult LegacyReplace() => StatusCode(410, "Use per-skill POST/DELETE operations to avoid overwriting concurrent changes.");
    [HttpPut("me/skills/level")]
    public async Task<IActionResult> Level(SetSkillLevelRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || !Enum.IsDefined(typeof(SkillLevel), req.Level)) return BadRequest("Invalid skill or level.");
        var name = SkillResolver.Normalize(req.Name);
        var link = await db.UserSkills.FirstOrDefaultAsync(s => s.Skill!.Name == name);
        if (link == null) return NotFound();
        link.Level = (SkillLevel)req.Level; await db.SaveChangesAsync(); return Ok(new UserSkillDto(name, req.Level));
    }
    [HttpGet("applications/{id:guid}/skills")]
    public async Task<IActionResult> Required(Guid id)
    {
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id);
        if (app == null) return NotFound();
        return Ok(new { version = app.Version, skills = await db.ApplicationSkills.Where(s => s.ApplicationId == id).OrderBy(s => s.Skill!.Name).Select(s => new { s.Skill!.Name, importance = Math.Clamp(s.Importance, 1, 3) }).ToListAsync() });
    }
    [HttpPut("applications/{id:guid}/skills")]
    public async Task<IActionResult> SetRequired(Guid id, RequiredSkillsRequest req)
    {
        if (req.Skills == null || req.Skills.Count > 200 || req.Skills.Any(s => string.IsNullOrWhiteSpace(s.Name) || s.Name.Length > 100 || s.Importance is < 1 or > 3)) return BadRequest("Invalid skills or importance.");
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id);
        if (app == null) return NotFound();
        if (app.Version != req.Version) return Conflict("Requirements changed. Reload before saving.");
        var desired = req.Skills.GroupBy(s => SkillResolver.Normalize(s.Name)).ToDictionary(g => g.Key, g => g.Max(s => s.Importance));
        var skills = await resolver.ResolveSkillsAsync(desired.Keys.ToList());
        var current = await db.ApplicationSkills.Where(s => s.ApplicationId == id).ToListAsync();
        db.ApplicationSkills.RemoveRange(current.Where(s => !skills.Any(w => w.Id == s.SkillId)));
        foreach (var skill in skills)
        {
            var link = current.FirstOrDefault(s => s.SkillId == skill.Id);
            if (link == null) { link = new ApplicationSkill { ApplicationId = id, SkillId = skill.Id }; db.ApplicationSkills.Add(link); }
            link.Importance = desired[skill.Name];
        }
        app.RequirementsEmbedding = null; app.ExtractionRunId = null; app.UpdatedAt = DateTimeOffset.UtcNow; app.Version = Guid.NewGuid();
        await db.SaveChangesAsync(); return await Required(id);
    }
    [HttpGet("analytics/skills-gap")]
    public async Task<IActionResult> Gap()
    {
        var apps = await db.Applications.OrderBy(a => a.AppliedDate).Select(a => a.Id).ToListAsync();
        var links = await db.ApplicationSkills.Include(s => s.Skill).ToListAsync();
        var extractedIds = links.Select(s => s.ApplicationId).Distinct().ToHashSet();
        var ordered = apps.Where(extractedIds.Contains).ToList();
        var older = ordered.Take(ordered.Count / 2).ToHashSet(); var recent = ordered.Skip(ordered.Count / 2).ToHashSet();
        var have = (await db.UserSkills.Select(s => s.SkillId).ToListAsync()).ToHashSet();
        var trendsAvailable = older.Count >= 10 && recent.Count >= 10;
        var items = links.GroupBy(s => s.SkillId).Select(g => new SkillGapItem(g.First().Skill!.Name,
            (int)Math.Round(100.0 * g.Count() / Math.Max(extractedIds.Count, 1)), have.Contains(g.Key),
            trendsAvailable ? (int)Math.Round(100.0 * g.Count(s => recent.Contains(s.ApplicationId)) / recent.Count - 100.0 * g.Count(s => older.Contains(s.ApplicationId)) / older.Count) : 0,
            g.Average(s => Math.Clamp(s.Importance, 1, 3)))).ToList();
        return Ok(new { skills = items, trendsAvailable, extractedApplications = extractedIds.Count, totalApplications = apps.Count });
    }
    public record RequiredSkillsRequest(Guid Version, List<SkillImportanceDto> Skills);
}
