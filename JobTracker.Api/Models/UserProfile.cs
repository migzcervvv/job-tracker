using System.ComponentModel.DataAnnotations.Schema;

namespace JobTracker.Api.Models;

public class UserProfile
{
    public Guid? ActiveResumeId { get; set; }
    public bool RemindersEnabled { get; set; }
    public bool WeeklyDigestEnabled { get; set; }
    public string TimeZone { get; set; } = "UTC";
    public Guid UserId { get; set; }
    public int ExperienceYears { get; set; }
    public SeniorityLevel? SeniorityLevel { get; set; }
    public string? Education { get; set; }
    public string? ResumeRawText { get; set; }
    [Column(TypeName = "vector(1536)")]
    public Pgvector.Vector? ResumeEmbedding { get; set; }
}
