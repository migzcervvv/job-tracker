using JobTracker.Api.Data;
using JobTracker.Api.Dtos;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/internal")]
public class InternalController(AppDbContext db, IConfiguration config, ISkillResolver skillResolver) : ControllerBase
{
    private bool IsAuthorized() =>
        Request.Headers.TryGetValue("X-Automation-Key", out var key) &&
        key == config["Automation:ApiKey"];

    [HttpPut("applications/{id}/skills")]
    public async Task<IActionResult> SetApplicationSkillsFromAutomation(Guid id, [FromBody] SetSkillsRequest req)
    {
        if (!IsAuthorized()) return Unauthorized();

        var app = await db.Applications.FirstOrDefaultAsync(a => a.Id == id);
        if (app is null) return NotFound();

        var skills = await skillResolver.ResolveSkillsAsync(req.SkillNames);

        var existingLinks = await db.ApplicationSkills.Where(x => x.ApplicationId == id).ToListAsync();
        db.ApplicationSkills.RemoveRange(existingLinks);
        foreach (var skill in skills)
            db.ApplicationSkills.Add(new ApplicationSkill { ApplicationId = id, SkillId = skill.Id });

        await db.SaveChangesAsync();
        return Ok(skills.Select(s => s.Name));
    }
    // InternalController.cs — new action
    [HttpPut("resumes/{id}/extraction")]
    public async Task<IActionResult> SetResumeExtraction(Guid id, [FromBody] ResumeExtractionRequest req)
    {
        if (!IsAuthorized()) return Unauthorized();

        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume is null) return NotFound();

        resume.ExtractedText = req.ExtractedText;
        resume.ProposedSkillsJson = System.Text.Json.JsonSerializer.Serialize(req.SkillNames);
        resume.ExtractionStatus = "succeeded";
        await db.SaveChangesAsync();

        return Ok();
    }

    public record ResumeExtractionRequest(string ExtractedText, List<string> SkillNames);
}