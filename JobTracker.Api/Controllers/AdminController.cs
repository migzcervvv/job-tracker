// Controllers/AdminController.cs
using System.Security.Claims;
using JobTracker.Api.Data;
using JobTracker.Api.Dtos;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "admin")]
public class AdminController(
    AppDbContext db, UserManager<IdentityUser<Guid>> users, IConfiguration config,
    IAppStartTime startTime, IHttpClientFactory httpFactory) : ControllerBase
{
    private readonly UserManager<IdentityUser<Guid>> _users = users;

    // ---------- Users ----------

    [HttpGet("users")]
    public async Task<IActionResult> ListUsers()
    {
        var users = await _users.Users.ToListAsync();
        var result = new List<object>();
        foreach (var u in users)
        {
            var roles = await _users.GetRolesAsync(u);
            var appCount = await db.Applications.IgnoreQueryFilters().CountAsync(a => a.UserId == u.Id);
            result.Add(new { u.Id, u.Email, Role = roles.FirstOrDefault() ?? "user", ApplicationCount = appCount });
        }
        return Ok(result);
    }

    [HttpPut("users/{id}/role")]
    public async Task<IActionResult> SetUserRole(Guid id, [FromBody] SetRoleRequest req)
    {
        var user = await _users.FindByIdAsync(id.ToString());
        if (user is null) return NotFound();

        var currentRoles = await _users.GetRolesAsync(user);
        await _users.RemoveFromRolesAsync(user, currentRoles);
        await _users.AddToRoleAsync(user, req.Role);

        return Ok();
    }

    [HttpDelete("users/{id}")]
    public async Task<IActionResult> DeleteUser(Guid id)
    {
        var user = await _users.FindByIdAsync(id.ToString());
        if (user is null) return NotFound();

        // Applications.UserId has no DB-level FK to AspNetUsers (it's a plain
        // Guid column), so deleting the Identity user would NOT cascade —
        // remove their data explicitly first, in the right order.
        var apps = await db.Applications.IgnoreQueryFilters().Where(a => a.UserId == id).ToListAsync();
        db.Applications.RemoveRange(apps);
        await db.SaveChangesAsync();

        await _users.DeleteAsync(user);
        return NoContent();
    }

    // ---------- Health ----------

    [HttpGet("health")]
    public async Task<IActionResult> GetHealth()
    {
        var uptime = DateTimeOffset.UtcNow - startTime.StartedAt;

        bool dbHealthy;
        try { dbHealthy = await db.Database.CanConnectAsync(); }
        catch { dbHealthy = false; }

        string n8nStatus;
        var n8nBaseUrl = config["N8n:BaseUrl"];
        if (string.IsNullOrEmpty(n8nBaseUrl))
        {
            n8nStatus = $"not_configured";
        }
        else
        {
            try
            {
                //Changed to health instead of healthz
                var client = httpFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(5);
                var res = await client.GetAsync($"{n8nBaseUrl.TrimEnd('/')}/health");
                n8nStatus = res.IsSuccessStatusCode ? "healthy" : "unreachable";
            }
            catch { n8nStatus = "unreachable"; }
        }

        return Ok(new
        {
            api = "healthy",
            uptimeSeconds = (long)uptime.TotalSeconds,
            database = dbHealthy ? "healthy" : "unreachable",
            n8n = n8nStatus,
        });
    }

    // ---------- Automation log ----------

    [HttpGet("automation-log")]
    public async Task<IActionResult> GetAutomationLog([FromQuery] int take = 50)
    {
        var entries = await db.AutomationLogEntries
            .OrderByDescending(e => e.CreatedAt)
            .Take(take)
            .ToListAsync();
        return Ok(entries);
    }

    // ---------- Skills ----------

    [HttpGet("skills")]
    public async Task<IActionResult> ListSkills([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var skills = await db.Skills.ToListAsync();
        var appCounts = await db.ApplicationSkills.GroupBy(x => x.SkillId).Select(g => new { g.Key, Count = g.Count() }).ToListAsync();
        var userCounts = await db.UserSkills.GroupBy(x => x.SkillId).Select(g => new { g.Key, Count = g.Count() }).ToListAsync();

        var all = skills.Select(s => new
        {
            s.Id,
            s.Name,
            applicationUsage = appCounts.FirstOrDefault(c => c.Key == s.Id)?.Count ?? 0,
            userUsage = userCounts.FirstOrDefault(c => c.Key == s.Id)?.Count ?? 0,
        });

        if (!string.IsNullOrWhiteSpace(search))
            all = all.Where(s => s.Name.Contains(search, StringComparison.OrdinalIgnoreCase));

        var ordered = all
            .OrderBy(s => s.Name)
            .ToList();
        var totalCount = ordered.Count;
        var pageItems = ordered.Skip((page - 1) * pageSize).Take(pageSize).ToList();

        return Ok(new { items = pageItems, totalCount, page, pageSize });
    }

    [HttpPost("skills/merge")]
    public async Task<IActionResult> MergeSkills([FromBody] MergeSkillsRequest req)
    {
        if (req.SourceSkillId == req.TargetSkillId)
            return BadRequest("Cannot merge a skill into itself.");

        var source = await db.Skills.FindAsync(req.SourceSkillId);
        var target = await db.Skills.FindAsync(req.TargetSkillId);
        if (source is null || target is null) return NotFound();

        // Composite-key entities are safer to Remove+Add than to mutate in
        // place — EF Core's change tracker doesn't handle partial-PK
        // mutation cleanly, and this also naturally avoids duplicate-PK
        // violations when an application/user already has both skills tagged.
        var appLinks = await db.ApplicationSkills.Where(x => x.SkillId == req.SourceSkillId).ToListAsync();
        foreach (var link in appLinks)
        {
            var alreadyLinked = await db.ApplicationSkills
                .AnyAsync(x => x.ApplicationId == link.ApplicationId && x.SkillId == req.TargetSkillId);
            db.ApplicationSkills.Remove(link);
            if (!alreadyLinked)
                db.ApplicationSkills.Add(new ApplicationSkill { ApplicationId = link.ApplicationId, SkillId = req.TargetSkillId });
        }

        var userLinks = await db.UserSkills.Where(x => x.SkillId == req.SourceSkillId).ToListAsync();
        foreach (var link in userLinks)
        {
            var alreadyLinked = await db.UserSkills
                .AnyAsync(x => x.UserId == link.UserId && x.SkillId == req.TargetSkillId);
            db.UserSkills.Remove(link);
            if (!alreadyLinked)
                db.UserSkills.Add(new UserSkill { UserId = link.UserId, SkillId = req.TargetSkillId });
        }

        db.Skills.Remove(source);
        await db.SaveChangesAsync();

        return Ok(new { mergedInto = target.Name });
    }
    [HttpPost("users")]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest req)
    {
        var user = new IdentityUser<Guid> { UserName = req.Email, Email = req.Email };
        var result = await _users.CreateAsync(user, req.Password);
        if (!result.Succeeded) return BadRequest(result.Errors.Select(e => e.Description));

        var role = string.IsNullOrWhiteSpace(req.Role) ? "user" : req.Role;
        await _users.AddToRoleAsync(user, role);

        return Ok(new { user.Id, user.Email, role });
    }

    public record CreateUserRequest(string Email, string Password, string? Role);
}

public record SetRoleRequest(string Role);
public record MergeSkillsRequest(Guid SourceSkillId, Guid TargetSkillId);