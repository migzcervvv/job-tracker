using System.Globalization;
using System.Text.Json;
using JobTracker.Api.Models;
namespace JobTracker.Api.Services;
public static class DeadlineService
{
    public record Deadline(string Kind, DateTimeOffset DueAt, Guid? StageDetailId);
    public static List<Deadline> Due(Application app, string zone, DateTimeOffset now) => All(app, zone).Where(d => d.DueAt >= now.AddDays(-7) && d.DueAt <= now.AddDays(1)).ToList();
    public static List<Deadline> All(Application app, string zone)
    {
        TimeZoneInfo timezone;
        try { timezone = TimeZoneInfo.FindSystemTimeZoneById(zone); } catch { timezone = TimeZoneInfo.Utc; }
        var result = new List<Deadline>();
        if (app.FollowUpAt.HasValue) result.Add(new("follow_up", app.FollowUpAt.Value, null));
        foreach (var stage in app.StageDetails.Where(s => s.Stage == app.Status))
        {
            try {
                using var fields = JsonDocument.Parse(stage.FieldsJson);
                var key = stage.Stage switch { ApplicationStatus.AssessmentPending => "dueDate", ApplicationStatus.InterviewScheduled => "scheduledAt", ApplicationStatus.Offered => "deadline", _ => "" };
                if (key == "" || !fields.RootElement.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.String) continue;
                var text = value.GetString()!;
                DateTimeOffset deadline;
                if (key == "scheduledAt") { if (!DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out deadline)) continue; }
                else {
                    if (!DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) continue;
                    var local = DateTime.SpecifyKind(day.ToDateTime(new TimeOnly(23, 59)), DateTimeKind.Unspecified);
                    // Calendar deadlines end at local 23:59; resolve DST using the timezone at that date.
                    deadline = new DateTimeOffset(local, timezone.GetUtcOffset(local)).ToUniversalTime();
                }
                result.Add(new(key, deadline, stage.Id));
            } catch (JsonException) { }
        }
        return result;
    }
}
