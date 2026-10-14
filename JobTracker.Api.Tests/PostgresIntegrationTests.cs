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
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection.ConnectionString, o => o.UseVector()).Options;
        var owner = Guid.NewGuid();
        try
        {
            await using var db = new AppDbContext(options, new FakeCurrentUser(owner)); await db.Database.MigrateAsync();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            var app = new Application { Id = Guid.NewGuid(), UserId = owner, Title = "Vector test", RequirementsEmbedding = new Vector(Enumerable.Repeat(1f, 1536).ToArray()) };
            db.Applications.Add(app); await db.SaveChangesAsync();
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
            db.Applications.Remove(app); await db.SaveChangesAsync(); Assert.Empty(await verify.ApplicationSkills.ToListAsync());
        }
        finally { await using var cleanup = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", admin); await cleanup.ExecuteNonQueryAsync(); }
    }
}
