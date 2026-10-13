using System.Globalization;
using System.Text.Json;
using JobTracker.Api.Models;
namespace JobTracker.Api.Services;
public static class InputValidation
{
    public static bool WebUrl(string? value) => string.IsNullOrWhiteSpace(value) ||
        value.Length <= 2048 && Uri.TryCreate(value, UriKind.Absolute, out var uri) && (uri.Scheme == "https" || uri.Scheme == "http");
    public static bool Vector(float[]? value) => value == null || value.Length == 1536 && value.All(float.IsFinite) && value.Any(v => v != 0);
    public static string? StageFields(ApplicationStatus stage, Dictionary<string, object?> fields)
    {
        var allowed = stage switch
        {
            ApplicationStatus.Applied => "source referral notes",
            ApplicationStatus.AssessmentPending => "taskLink dueDate instructions",
            ApplicationStatus.AssessmentSent => "sentAt notes",
            ApplicationStatus.InterviewScheduled => "round scheduledAt timeZone meetLink interviewerNames prepNotes",
            ApplicationStatus.Offered => "salary benefits deadline notes",
            ApplicationStatus.Rejected => "rejectedAt feedback",
            ApplicationStatus.OfferAccepted => "decidedAt notes",
            ApplicationStatus.OfferDeclined => "decidedAt notes",
            _ => "notes"
        };
        foreach (var (key, value) in fields)
        {
            if (!allowed.Split(' ').Contains(key)) return $"Unknown field: {key}.";
            if (value is JsonElement json && json.ValueKind is JsonValueKind.Object or JsonValueKind.Array) return "Stage fields must be scalar values.";
            var text = value?.ToString();
            if (text?.Length > 10000) return "Stage field is too long.";
            if (string.IsNullOrWhiteSpace(text)) continue;
            if (key.EndsWith("Link") && !WebUrl(text)) return "Invalid link.";
            if (key == "round" && (!int.TryParse(text, out var round) || round < 1 || round > 100)) return "Round must be between 1 and 100.";
            if (key is "dueDate" or "sentAt" or "deadline" or "rejectedAt" or "decidedAt" && !DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return "Use a valid calendar date.";
            if (key == "scheduledAt" && (!DateTimeOffset.TryParse(text, out _) || !(text.EndsWith('Z') || System.Text.RegularExpressions.Regex.IsMatch(text, @"[+-]\d{2}:\d{2}$")))) return "Interview time must include a UTC offset.";
            if (key == "timeZone") { try { TimeZoneInfo.FindSystemTimeZoneById(text); } catch { return "Unknown timezone."; } }
        }
        return null;
    }
}
