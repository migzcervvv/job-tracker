using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

[ApiController]
[Route("api/resumes")]
[Authorize]
public class ResumesController(AppDbContext db, ISupabaseStorageService storage) : ControllerBase
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
}