namespace JobTracker.Api.Models;

public class Application
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }               // tenant key
    public string Company { get; set; } = "";
    public string Title { get; set; } = "";
    public string? JobUrl { get; set; }
    public string RawDescription { get; set; } = "";
    public ApplicationStatus Status { get; set; } = ApplicationStatus.Applied;
    public DateTimeOffset AppliedDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<StageDetail> StageDetails { get; set; } = new();
    public List<TimelineEvent> TimelineEvents { get; set; } = new();
}