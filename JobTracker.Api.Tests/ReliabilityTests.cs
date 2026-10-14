using JobTracker.Api.Data;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace JobTracker.Api.Tests;

public class ReliabilityTests
{
    [Theory]
    [InlineData("null")]
    [InlineData("[]")]
    [InlineData("42")]
    [InlineData("true")]
    [InlineData("\"legacy\"")]
    [InlineData("invalid JSON")]
    public async Task LegacyStageFieldsDoNotBreakDetailOrBoard(string fields)
    {
        await using var factory = new ApiFactory();
        var (client, owner) = await factory.User();
        var id = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var application = new Application { Id = id, UserId = owner, Title = "Legacy interview", Status = ApplicationStatus.InterviewScheduled };
            application.StageDetails.Add(new StageDetail { Id = Guid.NewGuid(), Stage = application.Status, FieldsJson = fields });
            db.Applications.Add(application);
            await db.SaveChangesAsync();
        }
        (await client.GetAsync($"/api/applications/{id}")).EnsureSuccessStatusCode();
        (await client.GetAsync("/api/applications")).EnsureSuccessStatusCode();
    }

    [Theory]
    [InlineData("42P01")]
    [InlineData("42703")]
    [InlineData("42883")]
    public void MissingSchemaHasSafeActionableError(string sqlState)
    {
        var failure = RequestFailure.Classify(new PostgresException("private database details", "ERROR", "ERROR", sqlState));
        Assert.Equal(503, failure.Status);
        Assert.Equal("database_schema_outdated", failure.Code);
        Assert.DoesNotContain("private", failure.Message);
    }

    [Fact]
    public void DatabaseOutageIsDistinguishedFromUnexpectedFailure()
    {
        Assert.Equal("database_unavailable", RequestFailure.Classify(new NpgsqlException("private", new TimeoutException())).Code);
        Assert.Equal(500, RequestFailure.Classify(new InvalidOperationException("private")).Status);
        Assert.Equal(TimeSpan.FromSeconds(5), AutomationWorker.RetryDelay(0));
        Assert.Equal(TimeSpan.FromSeconds(10), AutomationWorker.RetryDelay(1));
        Assert.Equal(TimeSpan.FromSeconds(60), AutomationWorker.RetryDelay(100));
    }
}
