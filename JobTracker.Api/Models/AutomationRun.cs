using System.ComponentModel.DataAnnotations;

namespace JobTracker.Api.Models;

public class AutomationRun
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid? ApplicationId { get; set; }
    public Guid? ResumeId { get; set; }
    public Guid? StageDetailId { get; set; }
    public string Type { get; set; } = "";
    public string Status { get; set; } = "queued";
    public int Attempts { get; set; }
    public string? ErrorCode { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset NextAttemptAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset DeadlineAt { get; set; } = DateTimeOffset.UtcNow.AddMinutes(10);
    [ConcurrencyCheck] public Guid Version { get; set; } = Guid.NewGuid();
    public static bool IsTerminal(string status) => status is "succeeded" or "failed" or "cancelled";
}

public class StorageDeletion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string StoragePath { get; set; } = "";
    public int Attempts { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; } = DateTimeOffset.UtcNow;
}
