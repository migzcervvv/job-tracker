// Models/Resume.cs
namespace JobTracker.Api.Models;

public class Resume
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string FileName { get; set; } = "";
    public string StoragePath { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long SizeBytes { get; set; }
    public string? ExtractedText { get; set; } // populated in Phase 3, nullable now
    public string? ExtractionStatus { get; set; } // null | "triggered" | "succeeded" | "failed"
    public string? ProposedSkillsJson { get; set; } // JSON array of skill names, pending confirmation
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}