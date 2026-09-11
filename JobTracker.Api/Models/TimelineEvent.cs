namespace JobTracker.Api.Models;

public class TimelineEvent
{
    public Guid Id { get; set; }
    public Guid ApplicationId { get; set; }
    public string Type { get; set; } = "note";      // created, status_changed, email_matched, note, confirmation_received
    public string Body { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Application? Application { get; set; }
}