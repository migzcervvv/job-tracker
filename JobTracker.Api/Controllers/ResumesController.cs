using JobTracker.Api.Data;
using JobTracker.Api.Dtos;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

[ApiController]
[Route("api/resumes")]
[Authorize]
public class ResumesController(AppDbContext db, 
    ISupabaseStorageService storage,
    IConfiguration config,
    IServiceScopeFactory scopeFactory,
    IHttpClientFactory httpClientFactory,
    ISkillResolver skillResolver) : ControllerBase
{
    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private static readonly HashSet<string> AllowedTypes = new()
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };

    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await db.Resumes
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new { r.Id, r.FileName, r.ContentType, r.SizeBytes, r.CreatedAt })
            .ToListAsync());

    [HttpPost]
    [RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> Upload(IFormFile file)
    {
        if (file is null || file.Length == 0) return BadRequest("No file uploaded.");
        if (!AllowedTypes.Contains(file.ContentType)) return BadRequest("Only PDF or Word documents are allowed.");

        var id = Guid.NewGuid();
        var path = $"{CurrentUserId}/{id}-{file.FileName}";

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        await storage.UploadAsync(path, ms.ToArray(), file.ContentType);

        var resume = new Resume
        {
            Id = id,
            UserId = CurrentUserId,
            FileName = file.FileName,
            StoragePath = path,
            ContentType = file.ContentType,
            SizeBytes = file.Length,
        };
        db.Resumes.Add(resume);
        await db.SaveChangesAsync();

        // ---- webhook trigger starts here — everything above this line is Phase 2, unchanged ----
        var webhookUrl = config["N8n:ResumeExtractionWebhookUrl"];
        if (!string.IsNullOrEmpty(webhookUrl))
        {
            var resumeId = resume.Id;
            var storagePath = resume.StoragePath;

            _ = Task.Run(async () =>
            {
                using var scope = scopeFactory.CreateScope();
                var scopedDb = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var scopedStorage = scope.ServiceProvider.GetRequiredService<ISupabaseStorageService>();

                scopedDb.AutomationLogEntries.Add(new AutomationLogEntry
                {
                    Id = Guid.NewGuid(),
                    Type = "resume_extraction",
                    ApplicationId = null,
                    Status = "triggered",
                    Message = resumeId.ToString(),
                });
                await scopedDb.SaveChangesAsync();

                try
                {
                    var signedUrl = await scopedStorage.CreateSignedUrlAsync(storagePath, expiresInSeconds: 600);
                    var client = httpClientFactory.CreateClient("n8n");
                    client.Timeout = TimeSpan.FromSeconds(30);
                    var res = await client.PostAsJsonAsync(webhookUrl, new { resumeId, downloadUrl = signedUrl });

                    scopedDb.AutomationLogEntries.Add(new AutomationLogEntry
                    {
                        Id = Guid.NewGuid(),
                        Type = "resume_extraction",
                        ApplicationId = null,
                        Status = res.IsSuccessStatusCode ? "succeeded" : "failed",
                        Message = res.IsSuccessStatusCode ? resumeId.ToString() : $"resume {resumeId}: HTTP {(int)res.StatusCode}",
                    });
                    await scopedDb.SaveChangesAsync();
                }
                catch (Exception ex)
                {
                    scopedDb.AutomationLogEntries.Add(new AutomationLogEntry
                    {
                        Id = Guid.NewGuid(),
                        Type = "resume_extraction",
                        ApplicationId = null,
                        Status = "failed",
                        Message = $"resume {resumeId}: {ex.Message}",
                    });
                    await scopedDb.SaveChangesAsync();
                }
            });

            resume.ExtractionStatus = "triggered";
            await db.SaveChangesAsync();
        }
        // ---- webhook trigger ends here ----

        return Ok(new { resume.Id, resume.FileName, resume.ContentType, resume.SizeBytes, resume.CreatedAt });
    }

    [HttpGet("{id}/download")]
    public async Task<IActionResult> Download(Guid id)
    {
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume is null) return NotFound();
        var url = await storage.CreateSignedUrlAsync(resume.StoragePath);
        return Ok(new { url });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume is null) return NotFound();
        await storage.DeleteAsync(resume.StoragePath);
        db.Resumes.Remove(resume);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ResumesController.cs — new actions

    [HttpGet("{id}/proposed-skills")]
    public async Task<IActionResult> GetProposedSkills(Guid id)
    {
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume is null) return NotFound();

        var proposed = string.IsNullOrEmpty(resume.ProposedSkillsJson)
            ? new List<string>()
            : System.Text.Json.JsonSerializer.Deserialize<List<string>>(resume.ProposedSkillsJson) ?? new();

        var alreadyClaimed = await  db.UserSkills
            .Where(us => us.UserId == CurrentUserId)
            .Select(us => us.Skill!.Name)
            .ToListAsync();

        return Ok(new
        {
            extractionStatus = resume.ExtractionStatus,
            proposedSkills = proposed.Select(name => new { name, alreadyClaimed = alreadyClaimed.Contains(name) }),
        });
    }

    [HttpPost("{id}/confirm-skills")]
    public async Task<IActionResult> ConfirmSkills(Guid id, [FromBody] SetSkillsRequest req)
    {
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume is null) return NotFound();

        var skills = await skillResolver.ResolveSkillsAsync(req.SkillNames);
        var existing = await db.UserSkills.Where(us => us.UserId == CurrentUserId).Select(us => us.SkillId).ToListAsync();

        // Additive, not a replace — the user might already have skills from
        // manual entry or a different resume. Confirming from this resume
        // should never silently remove those.
        foreach (var skill in skills.Where(s => !existing.Contains(s.Id)))
            db.UserSkills.Add(new UserSkill { UserId = CurrentUserId, SkillId = skill.Id });

        await db.SaveChangesAsync();
        return Ok(skills.Select(s => s.Name));
    }
}