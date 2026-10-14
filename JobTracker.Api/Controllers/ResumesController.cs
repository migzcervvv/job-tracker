using System.Security.Claims;
using System.Text;
using System.Text.Json;
using JobTracker.Api.Data;
using JobTracker.Api.Dtos;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

[ApiController, Route("api/resumes"), Authorize]
public class ResumesController(AppDbContext db, ISupabaseStorageService storage, ISkillResolver resolver, AutomationService automation, DemoFileStore demoFiles) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private string DemoKey(string path) => User.FindFirstValue("jti") + ":" + path;
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var rows = await db.Resumes.OrderByDescending(r => r.CreatedAt).ToListAsync();
        var runIds = rows.Where(r => r.ExtractionRunId.HasValue).Select(r => r.ExtractionRunId!.Value).ToList();
        var runs = await db.AutomationRuns.Where(r => runIds.Contains(r.Id)).ToDictionaryAsync(r => r.Id);
        var active = await db.UserProfiles.Where(p => p.UserId == UserId).Select(p => p.ActiveResumeId).FirstOrDefaultAsync();
        return Ok(rows.Select(r => new { r.Id, r.FileName, r.ContentType, r.SizeBytes, r.CreatedAt,
            extractionStatus = r.ExtractionRunId.HasValue && runs.TryGetValue(r.ExtractionRunId.Value, out var run) ? EffectiveState(run) : r.ExtractionStatus,
            proposedSkillCount = Proposals(r).Count, isActive = active == r.Id, runId = r.ExtractionRunId }));
    }
    [HttpPost, RequestSizeLimit(10_000_000)]
    public async Task<IActionResult> Upload(IFormFile file)
    {
        if (file == null || file.Length == 0 || file.Length > 9_500_000) return BadRequest("Choose a PDF or Word document smaller than 9.5 MB.");
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var contentType = extension switch { ".pdf" => "application/pdf", ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".doc" => "application/msword", _ => null };
        if (contentType == null) return BadRequest("Only PDF and Word documents are supported.");
        using var memory = new MemoryStream(); await file.CopyToAsync(memory);
        var bytes = memory.ToArray();
        if (!ValidSignature(extension, bytes)) return BadRequest("File contents do not match the document extension.");
        var resume = new Resume { Id = Guid.NewGuid(), UserId = UserId, FileName = Path.GetFileName(file.FileName), ContentType = contentType, SizeBytes = bytes.Length };
        resume.StoragePath = $"{UserId}/{resume.Id}{extension}";
        StorageDeletion? cleanup = null;
        if (automation.IsDemo) demoFiles.Put(DemoKey(resume.StoragePath), bytes);
        else
        {
            // Persist compensating cleanup before external storage. An interrupted upload cannot orphan a file indefinitely.
            cleanup = new StorageDeletion { StoragePath = resume.StoragePath, NextAttemptAt = DateTimeOffset.UtcNow.AddHours(1) };
            db.StorageDeletions.Add(cleanup); await db.SaveChangesAsync();
            await storage.UploadAsync(resume.StoragePath, bytes, contentType);
        }
        db.Resumes.Add(resume);
        var run = automation.Configured("resume_extraction") ? automation.Queue(UserId, "resume_extraction", resume: resume) : null;
        if (cleanup != null) db.StorageDeletions.Remove(cleanup);
        await db.SaveChangesAsync();
        return Ok(new { resume.Id, resume.FileName, resume.ContentType, resume.SizeBytes, resume.CreatedAt, extractionStatus = resume.ExtractionStatus, runId = run?.Id, automationTriggered = run != null });
    }
    public static bool ValidSignature(string extension, byte[] bytes) => extension switch
    {
        ".pdf" => bytes.AsSpan().StartsWith("%PDF-"u8),
        ".docx" => ValidDocx(bytes),
        ".doc" => bytes.AsSpan().StartsWith(new byte[] { 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1 }),
        _ => false
    };
    private static bool ValidDocx(byte[] bytes)
    {
        try
        {
            using var zip = new System.IO.Compression.ZipArchive(new MemoryStream(bytes), System.IO.Compression.ZipArchiveMode.Read);
            return zip.Entries.Count <= 5000 && zip.Entries.Sum(e => e.Length) <= 50_000_000 && zip.GetEntry("[Content_Types].xml") != null && zip.GetEntry("word/document.xml") != null;
        }
        catch (InvalidDataException) { return false; }
    }
    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id)
    {
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume == null) return NotFound();
        return Ok(new { url = automation.IsDemo ? null : await storage.CreateSignedUrlAsync(resume.StoragePath), demo = automation.IsDemo, resume.FileName, resume.ContentType });
    }
    [HttpGet("{id:guid}/content")]
    public async Task<IActionResult> DemoContent(Guid id)
    {
        if (!automation.IsDemo) return NotFound();
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        var bytes = resume == null ? null : demoFiles.Get(DemoKey(resume.StoragePath));
        return bytes == null ? NotFound() : File(bytes, resume!.ContentType, resume.FileName);
    }
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume == null) return NotFound();
        if (automation.IsDemo) demoFiles.Delete(DemoKey(resume.StoragePath));
        else db.StorageDeletions.Add(new StorageDeletion { StoragePath = resume.StoragePath });
        var profile = await db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == UserId && p.ActiveResumeId == id);
        if (profile != null) { profile.ActiveResumeId = null; profile.ResumeRawText = null; profile.ResumeEmbedding = null; }
        foreach (var app in await db.Applications.Where(a => a.ResumeId == id).ToListAsync()) { app.ResumeId = null; app.Version = Guid.NewGuid(); }
        db.AutomationRuns.RemoveRange(await db.AutomationRuns.Where(r => r.ResumeId == id).ToListAsync());
        db.Resumes.Remove(resume); await db.SaveChangesAsync(); return NoContent();
    }
    [HttpPost("{id:guid}/activate")]
    public async Task<IActionResult> Activate(Guid id)
    {
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume == null) return NotFound();
        if (resume.ExtractionStatus != "succeeded") return Conflict("Wait for extraction before choosing this resume.");
        var profile = await db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == UserId);
        if (profile == null) { profile = new UserProfile { UserId = UserId }; db.UserProfiles.Add(profile); }
        profile.ActiveResumeId = id; profile.ResumeRawText = resume.ExtractedText; profile.ResumeEmbedding = resume.Embedding;
        await db.SaveChangesAsync(); return Ok(new { activeResumeId = id });
    }
    [HttpPost("{id:guid}/retry-extraction")]
    public async Task<IActionResult> Retry(Guid id)
    {
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume == null) return NotFound();
        if (!automation.Configured("resume_extraction")) return BadRequest("Resume extraction is not configured.");
        // Every retry gets a new ID. Old callbacks cannot change this proposal.
        resume.ProposedSkillsJson = null;
        resume.Version = Guid.NewGuid();
        var run = automation.Queue(UserId, "resume_extraction", resume: resume);
        await db.SaveChangesAsync(); return Accepted(AutomationService.View(run));
    }
    [HttpGet("{id:guid}/automation-status")]
    public async Task<IActionResult> Status(Guid id, Guid? runId = null)
    {
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume == null) return NotFound();
        var run = await db.AutomationRuns.FirstOrDefaultAsync(r => r.Id == (runId ?? resume.ExtractionRunId) && r.ResumeId == id);
        return Ok(new { runId = run?.Id, status = run == null ? resume.ExtractionStatus : EffectiveState(run), message = run?.ErrorCode });
    }
    private static string EffectiveState(AutomationRun run) => !AutomationRun.IsTerminal(run.Status) && run.DeadlineAt < DateTimeOffset.UtcNow ? "failed" : run.Status;
    private static List<SkillEvidenceDto> Proposals(Resume resume) => string.IsNullOrEmpty(resume.ProposedSkillsJson) ? new() : JsonSerializer.Deserialize<List<SkillEvidenceDto>>(resume.ProposedSkillsJson) ?? new();
    [HttpGet("{id:guid}/proposed-skills")]
    public async Task<IActionResult> Proposed(Guid id)
    {
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume == null) return NotFound();
        var claimed = (await db.UserSkills.Select(s => s.Skill!.Name).ToListAsync()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return Ok(new { extractionStatus = resume.ExtractionStatus, proposedSkills = Proposals(resume).Select(s => new { name = s.Name, evidence = s.Evidence, strength = s.Strength, alreadyClaimed = claimed.Contains(SkillResolver.Normalize(s.Name)) }) });
    }
    [HttpPost("{id:guid}/confirm-skills")]
    public async Task<IActionResult> Confirm(Guid id, SetSkillsRequest req)
    {
        await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync() : null;
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume == null) return NotFound();
        var proposals = Proposals(resume).ToDictionary(s => SkillResolver.Normalize(s.Name));
        if (req.RunId != resume.ExtractionRunId || resume.ExtractionStatus != "succeeded") return Conflict("Resume proposals changed. Reopen the review.");
        if (req.SkillNames == null || req.SkillNames.Any(n => string.IsNullOrWhiteSpace(n) || !proposals.ContainsKey(SkillResolver.Normalize(n)))) return BadRequest("Select skills from the current proposal.");
        var skills = await resolver.ResolveSkillsAsync(req.SkillNames);
        var existing = await db.UserSkills.ToListAsync();
        foreach (var skill in skills)
        {
            var proposal = proposals[skill.Name];
            if (db.Database.IsNpgsql())
            {
                await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"UserSkills\" (\"UserId\", \"SkillId\", \"Level\", \"EvidenceText\", \"EvidenceStrength\") VALUES ({UserId}, {skill.Id}, 0, {proposal.Evidence}, {proposal.Strength}) ON CONFLICT (\"UserId\", \"SkillId\") DO UPDATE SET \"EvidenceText\" = CASE WHEN EXCLUDED.\"EvidenceStrength\" >= \"UserSkills\".\"EvidenceStrength\" THEN EXCLUDED.\"EvidenceText\" ELSE \"UserSkills\".\"EvidenceText\" END, \"EvidenceStrength\" = GREATEST(\"UserSkills\".\"EvidenceStrength\", EXCLUDED.\"EvidenceStrength\")");
                continue;
            }
            var link = existing.FirstOrDefault(s => s.SkillId == skill.Id);
            if (link == null) { link = new UserSkill { UserId = UserId, SkillId = skill.Id }; db.UserSkills.Add(link); }
            if (proposal.Strength >= link.EvidenceStrength) { link.EvidenceText = proposal.Evidence; link.EvidenceStrength = proposal.Strength; }
        }
        resume.ProposedSkillsJson = null; resume.Version = Guid.NewGuid(); await db.SaveChangesAsync(); if (tx != null) await tx.CommitAsync(); return Ok(skills.Select(s => s.Name));
    }
    [HttpPost("{id:guid}/dismiss-skills")]
    public async Task<IActionResult> Dismiss(Guid id, ResumeRunRequest req)
    {
        var resume = await db.Resumes.FirstOrDefaultAsync(r => r.Id == id);
        if (resume == null) return NotFound();
        if (req.RunId != resume.ExtractionRunId) return Conflict("Resume proposals changed. Reopen the review.");
        resume.ProposedSkillsJson = null; resume.Version = Guid.NewGuid(); await db.SaveChangesAsync(); return NoContent();
    }
    public record ResumeRunRequest(Guid? RunId);
}
