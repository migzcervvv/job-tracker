using JobTracker.Api.Data;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Pgvector;
namespace JobTracker.Api.Tests;
public sealed class LocalPostgresFactAttribute : FactAttribute
{
    public LocalPostgresFactAttribute() { if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("JOBTRACKER_TEST_DATABASE"))) Skip = "Set JOBTRACKER_TEST_DATABASE to the disposable local jobtracker_test PostgreSQL database."; }
}
public class PostgresIntegrationTests
{
    [LocalPostgresFact]
    public async Task MigrationsVectorRoundTripConcurrencyAndGlobalSkillUpsert()
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("JOBTRACKER_TEST_DATABASE"));
        if (connection.Host is not ("localhost" or "127.0.0.1" or "::1") || connection.Database != "jobtracker_test") throw new InvalidOperationException("Integration tests require a loopback host and database named jobtracker_test.");
        var schema = "test_" + Guid.NewGuid().ToString("N");
        await using var admin = new NpgsqlConnection(connection.ConnectionString); await admin.OpenAsync();
        await using (var extension = new NpgsqlCommand("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public", admin)) await extension.ExecuteNonQueryAsync();
        await using (var command = new NpgsqlCommand($"CREATE SCHEMA \"{schema}\"", admin)) await command.ExecuteNonQueryAsync();
        connection.SearchPath = schema + ",public";
        await using var dataSource = PostgresDataSource.Create(connection.ConnectionString);
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(dataSource, o => {
            o.UseVector();
            o.MigrationsHistoryTable("__EFMigrationsHistory", schema);
        }).Options;
        var owner = Guid.NewGuid();
        try
        {
            await using var db = new AppDbContext(options, new FakeCurrentUser(owner)); await db.Database.MigrateAsync();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            var app = new Application { Id = Guid.NewGuid(), UserId = owner, Title = "Vector test", RequirementsEmbedding = new Vector(Enumerable.Repeat(1f, 1536).ToArray()) };
            app.StageDetails.Add(new StageDetail { Id = Guid.NewGuid(), Stage = ApplicationStatus.Applied, FieldsJson = "{}" });
            app.TimelineEvents.Add(new TimelineEvent { Id = Guid.NewGuid(), Type = "created", Body = "Vector fixture" });
            db.Applications.Add(app); await db.SaveChangesAsync();
            // Authentication initializes the identity connection before details.
            // Both contexts must use the explicitly configured vector data source.
            await using (var identity = new IdentityStoreContext(new DbContextOptionsBuilder<IdentityStoreContext>().UseNpgsql(dataSource).Options))
                await identity.Users.AsNoTracking().Take(1).ToListAsync();
            await using (var buffered = new AppDbContext(options, new FakeCurrentUser(owner)))
            {
                var detail = await buffered.Applications.AsNoTracking().AsSplitQuery()
                    .Include(a => a.TimelineEvents).Include(a => a.StageDetails).SingleAsync(a => a.Id == app.Id);
                Assert.Equal(1536, detail.RequirementsEmbedding!.ToArray().Length);
                Assert.Single(detail.StageDetails); Assert.Single(detail.TimelineEvents);
            }
            await using (var vectorConnection = await dataSource.OpenConnectionAsync())
            await using (var command = new NpgsqlCommand("SELECT NULL::public.vector, ARRAY[1,2,3]::public.vector", vectorConnection))
            await using (var reader = await command.ExecuteReaderAsync())
            {
                Assert.Equal(typeof(Vector), reader.GetFieldType(0));
                Assert.Equal(typeof(Vector), reader.GetFieldType(1));
                Assert.True(await reader.ReadAsync());
                Assert.Equal(DBNull.Value, reader.GetValue(0));
                Assert.Equal(new float[] { 1, 2, 3 }, Assert.IsType<Vector>(reader.GetValue(1)).ToArray());
            }
            Assert.Empty(await new FitScorer(db).ScoreAsync(owner, [app.Id]));
            await using var second = new AppDbContext(options, new FakeCurrentUser(owner)); var stale = await second.Applications.SingleAsync();
            app.Title = "Newer"; app.Version = Guid.NewGuid(); await db.SaveChangesAsync();
            stale.Title = "Lost update"; stale.Version = Guid.NewGuid(); await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => second.SaveChangesAsync());
            await using var verify = new AppDbContext(options, new FakeCurrentUser(owner)); Assert.Equal(1536, (await verify.Applications.SingleAsync()).RequirementsEmbedding!.ToArray().Length);
            await using var one = new AppDbContext(options, new FakeCurrentUser(owner)); await using var two = new AppDbContext(options, new FakeCurrentUser(owner));
            var resolutions = await Task.WhenAll(new SkillResolver(one).ResolveSkillsAsync(new() { " Docker ", "docker" }), new SkillResolver(two).ResolveSkillsAsync(new() { "DOCKER" }));
            Assert.Equal(resolutions[0].Single().Id, resolutions[1].Single().Id);
            Assert.Equal(1, await verify.Skills.CountAsync(s => s.Name == "docker"));
            db.ApplicationSkills.Add(new ApplicationSkill { ApplicationId = app.Id, SkillId = resolutions[0].Single().Id, Importance = 3 });
            await db.SaveChangesAsync(); Assert.Single(await verify.ApplicationSkills.ToListAsync());
            db.UserSkills.Add(new UserSkill { UserId = owner, SkillId = resolutions[0].Single().Id });
            db.UserProfiles.Add(new UserProfile { UserId = owner, ResumeEmbedding = new Vector(Enumerable.Repeat(1f, 1536).ToArray()) });
            await db.SaveChangesAsync();
            var scorer = new FitScorer(db);
            Assert.Equal(100, (await scorer.ScoreAsync(owner, [app.Id]))[app.Id].Semantic);
            var resume = new Resume { Id = Guid.NewGuid(), UserId = owner, Embedding = new Vector(Enumerable.Repeat(-1f, 1536).ToArray()) };
            db.Resumes.Add(resume); app.ResumeId = resume.Id;
            await db.SaveChangesAsync();
            var explicitResumeScore = (await scorer.ScoreAsync(owner, [app.Id]))[app.Id];
            Assert.Equal(0, explicitResumeScore.Semantic);
            Assert.Equal(70, explicitResumeScore.Overall);
            app.RequirementsEmbedding = null; await db.SaveChangesAsync();
            var keywordScore = (await scorer.ScoreAsync(owner, [app.Id]))[app.Id];
            Assert.Null(keywordScore.Semantic); Assert.Equal(100, keywordScore.Overall);
            db.Applications.Remove(app); await db.SaveChangesAsync(); Assert.Empty(await verify.ApplicationSkills.ToListAsync());
        }
        finally { await using var cleanup = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", admin); await cleanup.ExecuteNonQueryAsync(); }
    }
}
