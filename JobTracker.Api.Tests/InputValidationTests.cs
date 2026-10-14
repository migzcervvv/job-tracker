using JobTracker.Api.Models;
using JobTracker.Api.Services;
namespace JobTracker.Api.Tests;
public class InputValidationTests
{
    [Theory]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("file:///etc/passwd", false)]
    [InlineData("https://example.test/jobs/1", true)]
    [InlineData("", true)]
    public void PostingLinksOnlyAllowHttp(string url, bool expected) => Assert.Equal(expected, InputValidation.WebUrl(url));
    [Fact]
    public void EmbeddingDimensionMagnitudeAndFinitenessAreValidated()
    {
        Assert.True(InputValidation.Vector(null)); Assert.False(InputValidation.Vector(new float[1536]));
        Assert.False(InputValidation.Vector(new[] { 1f }));
        var vector = Enumerable.Repeat(1f, 1536).ToArray(); Assert.True(InputValidation.Vector(vector));
        vector[0] = float.NaN; Assert.False(InputValidation.Vector(vector)); vector[0] = float.PositiveInfinity; Assert.False(InputValidation.Vector(vector));
    }
    [Theory]
    [InlineData("2026-12-01T08:00", false)]
    [InlineData("2026-12-01T08:00:00Z", true)]
    [InlineData("2026-12-01T08:00:00+08:00", true)]
    public void InterviewTimeRequiresExplicitOffset(string timestamp, bool valid) => Assert.Equal(valid, InputValidation.StageFields(ApplicationStatus.InterviewScheduled, new() { ["scheduledAt"] = timestamp }) == null);
    [Fact]
    public void CalendarDeadlinesUseUsersTimezoneAndExcludeIrrelevantStages()
    {
        var app = new Application { Status = ApplicationStatus.AssessmentPending };
        app.StageDetails.Add(new StageDetail { Stage = ApplicationStatus.AssessmentPending, FieldsJson = "{\"dueDate\":\"2026-10-14\"}" });
        app.StageDetails.Add(new StageDetail { Stage = ApplicationStatus.Offered, FieldsJson = "{\"deadline\":\"2026-10-14\"}" });
        var deadlines = DeadlineService.Due(app, "Asia/Shanghai", DateTimeOffset.Parse("2026-10-14T00:00:00Z"));
        Assert.Single(deadlines); Assert.Equal(DateTimeOffset.Parse("2026-10-14T15:59:00Z"), deadlines[0].DueAt);
    }
    [Theory]
    [InlineData("2026-02-30")]
    [InlineData("14/10/2026")]
    public void InvalidCalendarDatesAreRejected(string date) => Assert.NotNull(InputValidation.StageFields(ApplicationStatus.AssessmentPending, new() { ["dueDate"] = date }));
}
