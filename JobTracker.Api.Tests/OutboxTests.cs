using System.Net;
using JobTracker.Api.Data;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
namespace JobTracker.Api.Tests;
public class OutboxTests
{
    class Factory(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : IHttpClientFactory
    {
        class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> callback) : HttpMessageHandler { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) => callback(request); }
        public HttpClient CreateClient(string name) => new(new Handler(respond));
    }
    class Storage : ISupabaseStorageService
    {
        public int Deletes; public bool Fail;
        public Task UploadAsync(string path, byte[] content, string type) => throw new InvalidOperationException("Unexpected real storage call");
        public Task<string> CreateSignedUrlAsync(string path, int expires = 300) => throw new InvalidOperationException("Unexpected real storage call");
        public Task DeleteAsync(string path) { Deletes++; if (Fail) throw new HttpRequestException(); return Task.CompletedTask; }
    }
    static IConfiguration Config => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["N8n:SkillExtractionWebhookUrl"] = "http://localhost/fixture", ["Automation:ApiKey"] = "test-only-key" }).Build();
    static AppDbContext Db(DbContextOptions<AppDbContext> options) => new(options, new FakeCurrentUser(null));
    static async Task<(Guid AppId, Guid RunId)> Seed(AppDbContext db, Guid user)
    {
        var app = new Application { Id = Guid.NewGuid(), UserId = user, Title = "Engineer", RawDescription = "Docker" };
        var run = new AutomationRun { UserId = user, ApplicationId = app.Id, Type = "skill_extraction" };
        app.ExtractionRunId = run.Id; db.Applications.Add(app); db.AutomationRuns.Add(run); await db.SaveChangesAsync(); return (app.Id, run.Id);
    }
    [Fact]
    public async Task HttpAcknowledgementLeavesRunDispatchedAndDeadlineFailsMissingCallback()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = Db(options); var (_, id) = await Seed(db, Guid.NewGuid());
        var factory = new Factory(request => { Assert.Equal(id.ToString(), request.Headers.GetValues("Idempotency-Key").Single()); return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Accepted)); });
        var dispatcher = new AutomationDispatcher(db, Config, factory, new Storage(), NullLogger<AutomationDispatcher>.Instance);
        await dispatcher.DispatchAsync();
        var run = await db.AutomationRuns.IgnoreQueryFilters().SingleAsync();
        Assert.Equal("dispatched", run.Status); Assert.Equal(1, run.Attempts);
        run.DeadlineAt = DateTimeOffset.UtcNow.AddSeconds(-1); await db.SaveChangesAsync();
        await dispatcher.DispatchAsync(); Assert.Equal("failed", (await db.AutomationRuns.IgnoreQueryFilters().SingleAsync()).Status);
    }
    [Fact]
    public async Task CallbackCompletionWinsEvenIfOutboundHttpRequestTimesOut()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = Db(options); var (_, id) = await Seed(db, Guid.NewGuid());
        var factory = new Factory(async request => {
            await using var callback = Db(options); var run = await callback.AutomationRuns.IgnoreQueryFilters().SingleAsync(r => r.Id == id);
            run.Status = "succeeded"; run.Version = Guid.NewGuid(); await callback.SaveChangesAsync();
            throw new TaskCanceledException("Simulated outbound timeout after successful callback");
        });
        await new AutomationDispatcher(db, Config, factory, new Storage(), NullLogger<AutomationDispatcher>.Instance).DispatchAsync();
        await using var verify = Db(options); Assert.Equal("succeeded", (await verify.AutomationRuns.IgnoreQueryFilters().SingleAsync()).Status);
    }
    [Fact]
    public async Task ConflictOnFirstRunDoesNotDetachRemainingDispatches()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = Db(options); var user = Guid.NewGuid(); var first = await Seed(db, user); var second = await Seed(db, user);
        var requests = 0;
        var factory = new Factory(async request => {
            requests++; if (requests == 1) { await using var callback = Db(options); var run = await callback.AutomationRuns.IgnoreQueryFilters().SingleAsync(r => r.Id == first.RunId); run.Status = "succeeded"; run.Version = Guid.NewGuid(); await callback.SaveChangesAsync(); }
            return new HttpResponseMessage(HttpStatusCode.Accepted);
        });
        await new AutomationDispatcher(db, Config, factory, new Storage(), NullLogger<AutomationDispatcher>.Instance).DispatchAsync();
        await using var verify = Db(options); var rows = await verify.AutomationRuns.IgnoreQueryFilters().ToDictionaryAsync(r => r.Id);
        Assert.Equal("succeeded", rows[first.RunId].Status); Assert.Equal("dispatched", rows[second.RunId].Status); Assert.Equal(1, rows[second.RunId].Attempts);
    }
    [Fact]
    public async Task RetryIsDurableBoundedAndStorageCleanupIsRetried()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        await using var db = Db(options); await Seed(db, Guid.NewGuid());
        var storage = new Storage { Fail = true };
        db.StorageDeletions.Add(new StorageDeletion { StoragePath = "test-user/test-file.pdf" }); await db.SaveChangesAsync();
        var dispatcher = new AutomationDispatcher(db, Config, new Factory(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable))), storage, NullLogger<AutomationDispatcher>.Instance);
        await dispatcher.DispatchAsync();
        var run = await db.AutomationRuns.IgnoreQueryFilters().SingleAsync(); Assert.Equal("queued", run.Status); Assert.True(run.NextAttemptAt > DateTimeOffset.UtcNow);
        run.Attempts = 3; run.NextAttemptAt = DateTimeOffset.UtcNow.AddSeconds(-1); await db.SaveChangesAsync();
        await dispatcher.DispatchAsync(); Assert.Equal("failed", (await db.AutomationRuns.IgnoreQueryFilters().SingleAsync()).Status);
        var cleanup = await db.StorageDeletions.SingleAsync(); Assert.Equal(1, cleanup.Attempts);
        storage.Fail = false; cleanup.NextAttemptAt = DateTimeOffset.UtcNow.AddSeconds(-1); await db.SaveChangesAsync();
        await dispatcher.DispatchAsync(); Assert.Empty(await db.StorageDeletions.ToListAsync()); Assert.Equal(2, storage.Deletes);
    }
}
