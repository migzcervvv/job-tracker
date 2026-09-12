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
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}