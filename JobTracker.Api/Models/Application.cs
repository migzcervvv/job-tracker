using System.ComponentModel.DataAnnotations.Schema;

namespace JobTracker.Api.Models;

public class Application
{
    [System.ComponentModel.DataAnnotations.ConcurrencyCheck]
    public Guid Version { get; set; } = Guid.NewGuid();
    public Guid? ExtractionRunId { get; set; }
    public Guid? ResumeId { get; set; }
    public string? NextAction { get; set; }
    public DateTimeOffset? FollowUpAt { get; set; }
    public DateTimeOffset? SnoozedUntil { get; set; }
    public DateTimeOffset? LastEmployerResponseAt { get; set; }
    public string? ContactName { get; set; }
    public string? ContactEmail { get; set; }
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
    public int? RequiredExperienceYears { get; set; }
    public SeniorityLevel? SeniorityLevel { get; set; }
    public string? EducationRequirement { get; set; }
    public Pgvector.Vector? JobEmbedding { get; set; }
    [Column(TypeName = "vector(1536)")]
    public Pgvector.Vector? RequirementsEmbedding { get; set; }

    public List<StageDetail> StageDetails { get; set; } = new();
    public List<TimelineEvent> TimelineEvents { get; set; } = new();
}
