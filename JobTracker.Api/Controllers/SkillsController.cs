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
        var names = await db.UserSkills
            .Where(us => us.UserId == CurrentUserId)
            .Select(us => us.Skill!.Name)
            .ToListAsync();
        return Ok(names);
    }

    [HttpPut("me/skills")]
    public async Task<IActionResult> SetMySkills([FromBody] SetSkillsRequest req)
    {
        var skills = await ResolveSkillsAsync(req.SkillNames);

        var existingLinks = await db.UserSkills.Where(us => us.UserId == CurrentUserId).ToListAsync();
        db.UserSkills.RemoveRange(existingLinks);
        foreach (var skill in skills)
            db.UserSkills.Add(new UserSkill { UserId = CurrentUserId, SkillId = skill.Id });

        await db.SaveChangesAsync();
        return Ok(skills.Select(s => s.Name));
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
            return new SkillGapItem(
                skillNames.GetValueOrDefault(g.SkillId, "unknown"),
                (int)Math.Round(100.0 * g.Count / allApps.Count),
                mySkillIds.Contains(g.SkillId),
                (int)Math.Round(recentFreq - olderFreq)
            );
        }).ToList();

        return Ok(new SkillsGapResponse(items));
    }
}