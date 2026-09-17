using System.Security.Claims;
using JobTracker.Api.Data;
using JobTracker.Api.Dtos;
using JobTracker.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class SkillsController(AppDbContext db) : ControllerBase
{
    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // Shared by both "my skills" and "this job's required skills" — same
    // normalize-and-upsert logic either way, so the Skills table stays
    // a single deduplicated source instead of drifting into two shapes.
    private async Task<List<Skill>> ResolveSkillsAsync(List<string> names)
    {
        var normalized = names
            .Select(n => n.Trim().ToLowerInvariant())
            .Where(n => n.Length > 0)
            .Distinct()
            .ToList();

        var existing = await db.Skills.Where(s => normalized.Contains(s.Name)).ToListAsync();
        var existingNames = existing.Select(s => s.Name).ToHashSet();

        var toCreate = normalized
            .Where(n => !existingNames.Contains(n))
            .Select(n => new Skill { Id = Guid.NewGuid(), Name = n })
            .ToList();

        if (toCreate.Count > 0)
        {
            db.Skills.AddRange(toCreate);
            await db.SaveChangesAsync();
        }

        return existing.Concat(toCreate).ToList();
    }

    [HttpGet("me/skills")]
    public async Task<IActionResult> GetMySkills()
    {
        var skills = await db.UserSkills
            .Where(us => us.UserId == CurrentUserId)
            .OrderBy(us => us.Skill!.Name)
            .Select(us => new UserSkillDto(us.Skill!.Name, (int)us.Level))
            .ToListAsync();

        return Ok(skills);
    }

    // Replaces the full skill-name set. Levels are preserved for names that
    // survive the replace; anything brand new starts Unrated. This is what
    // keeps a level from silently resetting to 0 every time a skill is
    // added or removed through the flat-name endpoint (resume confirm flow
    // included).
    [HttpPut("me/skills")]
    public async Task<IActionResult> SetMySkills([FromBody] SetSkillsRequest req)
    {
        var skills = await ResolveSkillsAsync(req.SkillNames);

        var existingLinks = await db.UserSkills.Where(us => us.UserId == CurrentUserId).ToListAsync();
        var levelBySkillId = existingLinks.ToDictionary(l => l.SkillId, l => l.Level);

        db.UserSkills.RemoveRange(existingLinks);
        foreach (var skill in skills)
        {
            db.UserSkills.Add(new UserSkill
            {
                UserId = CurrentUserId,
                SkillId = skill.Id,
                Level = levelBySkillId.TryGetValue(skill.Id, out var lvl) ? lvl : SkillLevel.Unrated,
            });
        }

        await db.SaveChangesAsync();

        return Ok(skills
            .OrderBy(s => s.Name)
            .Select(s => new UserSkillDto(s.Name, (int)(levelBySkillId.TryGetValue(s.Id, out var lvl2) ? lvl2 : SkillLevel.Unrated))));
    }

    // Sets proficiency on one already-claimed skill. Separate from
    // SetMySkills so the level control on the Skills page can save
    // instantly per-row without resubmitting the whole skill list.
    [HttpPut("me/skills/level")]
    public async Task<IActionResult> SetSkillLevel([FromBody] SetSkillLevelRequest req)
    {
        if (!Enum.IsDefined(typeof(SkillLevel), req.Level))
            return BadRequest("Unknown skill level.");

        var normalized = req.Name.Trim().ToLowerInvariant();
        var link = await db.UserSkills
            .FirstOrDefaultAsync(us => us.UserId == CurrentUserId && us.Skill!.Name == normalized);

        if (link is null) return NotFound();

        link.Level = (SkillLevel)req.Level;
        await db.SaveChangesAsync();

        return Ok(new UserSkillDto(normalized, req.Level));
    }

    [HttpPut("applications/{id}/skills")]
    public async Task<IActionResult> SetApplicationSkills(Guid id, [FromBody] SetSkillsRequest req)
    {
        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id);
        if (app is null) return NotFound();

        var skills = await ResolveSkillsAsync(req.SkillNames);

        var existingLinks = await db.ApplicationSkills.Where(x => x.ApplicationId == id).ToListAsync();
        db.ApplicationSkills.RemoveRange(existingLinks);
        foreach (var skill in skills)
            db.ApplicationSkills.Add(new ApplicationSkill { ApplicationId = id, SkillId = skill.Id });

        await db.SaveChangesAsync();
        return Ok(skills.Select(s => s.Name));
    }

    [HttpGet("applications/{id}/skills")]
    public async Task<IActionResult> GetApplicationSkills(Guid id)
    {
        var names = await db.ApplicationSkills
            .Where(x => x.ApplicationId == id)
            .Select(x => x.Skill!.Name)
            .ToListAsync();
        return Ok(names);
    }

    [HttpGet("analytics/skills-gap")]
    public async Task<IActionResult> GetSkillsGap()
    {
        var userId = CurrentUserId;
        var allApps = await db.Applications.Select(a => new { a.Id, a.AppliedDate }).ToListAsync();
        if (allApps.Count == 0) return Ok(new SkillsGapResponse(new()));

        var sortedByDate = allApps.OrderBy(a => a.AppliedDate).ToList();
        var midpoint = sortedByDate.Count / 2;
        var olderIds = sortedByDate.Take(midpoint).Select(a => a.Id).ToHashSet();
        var recentIds = sortedByDate.Skip(midpoint).Select(a => a.Id).ToHashSet();
        var recentTotal = Math.Max(recentIds.Count, 1);
        var olderTotal = Math.Max(olderIds.Count, 1);

        var mySkillIds = await db.UserSkills.Where(us => us.UserId == userId).Select(us => us.SkillId).ToListAsync();
        var allLinks = await db.ApplicationSkills.ToListAsync();

        var gap = allLinks
            .GroupBy(x => x.SkillId)
            .Select(g => new
            {
                SkillId = g.Key,
                Count = g.Count(),
                RecentCount = g.Count(x => recentIds.Contains(x.ApplicationId)),
                OlderCount = g.Count(x => olderIds.Contains(x.ApplicationId)),
            })
            .OrderByDescending(g => g.Count)
            .Take(15)
            .ToList();

        var skillIds = gap.Select(g => g.SkillId).ToList();
        var skillNames = await db.Skills.Where(s => skillIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.Name);

        var items = gap.Select(g =>
        {
            var recentFreq = 100.0 * g.RecentCount / recentTotal;
            var olderFreq = 100.0 * g.OlderCount / olderTotal;

            // Filtered by THIS skill's id (g.SkillId) — not a global average
            // over every skill-link that happens to exist.
            var linksForSkill = allLinks.Where(l => l.SkillId == g.SkillId).ToList();
            var avgImportance = linksForSkill.Count > 0
                ? linksForSkill.Average(l => Math.Max(l.Importance, 1))
                : 2.0;

            return new SkillGapItem(
                skillNames.GetValueOrDefault(g.SkillId, "unknown"),
                (int)Math.Round(100.0 * g.Count / allApps.Count),
                mySkillIds.Contains(g.SkillId),
                (int)Math.Round(recentFreq - olderFreq),
                avgImportance
            );
        }).ToList();

        return Ok(new SkillsGapResponse(items));
    }
}