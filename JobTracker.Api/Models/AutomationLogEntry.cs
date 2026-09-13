// Models/AutomationLogEntry.cs
namespace JobTracker.Api.Models;

public class AutomationLogEntry
{
    public Guid Id { get; set; }
    public string Type { get; set; } = "";        // "skill_extraction"
    public Guid? ApplicationId { get; set; }
    public string Status { get; set; } = "";      // "triggered" | "succeeded" | "failed"
    public string? Message { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}