using JobTracker.Api.Data;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.EntityFrameworkCore;
namespace JobTracker.Api.Tests;
public class FitScorerTests
{
    [Fact]
    public async Task EmptyPageNeedsNoDatabaseAccess()
    {
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        await db.DisposeAsync();
        Assert.Empty(await new FitScorer(db).ScoreAsync(Guid.NewGuid(), []));
    }

    [Fact]
    public async Task CancelledRequestStopsScoring()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => new FitScorer(db).ScoreAsync(Guid.NewGuid(), [Guid.NewGuid()], cancellation.Token));
    }
    [Theory]
    [InlineData(3, 1, 75)]
    [InlineData(1, 3, 25)]
    [InlineData(3, 3, 50)]
    public async Task ActualScorerWeightsMatchedAndMissingLinks(int matched, int missing, int expected)
    {
        var user = Guid.NewGuid();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options, new FakeCurrentUser(user));
        var application = new Application { Id = Guid.NewGuid(), UserId = user };
        var have = new Skill { Id = Guid.NewGuid(), Name = "docker" }; var gap = new Skill { Id = Guid.NewGuid(), Name = "linux" };
        db.Applications.Add(application); db.Skills.AddRange(have, gap);
        db.ApplicationSkills.AddRange(new ApplicationSkill { ApplicationId = application.Id, SkillId = have.Id, Importance = matched }, new ApplicationSkill { ApplicationId = application.Id, SkillId = gap.Id, Importance = missing });
        db.UserSkills.Add(new UserSkill { UserId = user, SkillId = have.Id }); await db.SaveChangesAsync();
        var score = (await new FitScorer(db).ScoreAsync(user, new() { application.Id }))[application.Id];
        Assert.Equal(expected, score.Overall); Assert.Equal(1, score.RequiredCovered); Assert.Equal(2, score.RequiredTotal); Assert.Null(score.Semantic);
    }
    [Fact]
    public async Task UntaggedApplicationsHaveNoScoreAndOtherTenantsAreExcluded()
    {
        var user = Guid.NewGuid(); var other = Guid.NewGuid();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options, new FakeCurrentUser(user));
        var mine = new Application { Id = Guid.NewGuid(), UserId = user }; var theirs = new Application { Id = Guid.NewGuid(), UserId = other };
        db.Applications.AddRange(mine, theirs);
        var skill = new Skill { Id = Guid.NewGuid(), Name = "linux" };
        db.Skills.Add(skill);
        db.ApplicationSkills.Add(new ApplicationSkill { ApplicationId = theirs.Id, SkillId = skill.Id, Importance = 3 });
        await db.SaveChangesAsync();
        Assert.Empty(await new FitScorer(db).ScoreAsync(user, new() { mine.Id, theirs.Id }));
    }
    [Fact] public void IdenticalVectorsScoreOne() => Assert.Equal(1.0, FitScorer.CosineSimilarity(new[] { 1f, 2f }, new[] { 1f, 2f }), 5);
    [Fact] public void OrthogonalVectorsScoreZero() => Assert.Equal(0.0, FitScorer.CosineSimilarity(new[] { 1f, 0f }, new[] { 0f, 1f }), 5);
}
