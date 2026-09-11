namespace JobTracker.Api.Models;

public class StageDetail
{
    public Guid Id { get; set; }
    public Guid ApplicationId { get; set; }
    public ApplicationStatus Stage { get; set; }
    public string FieldsJson { get; set; } = "{}";  // jsonb
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Application? Application { get; set; }
}