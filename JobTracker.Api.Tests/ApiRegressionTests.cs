using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
namespace JobTracker.Api.Tests;
public class ApiRegressionTests
{
    static async Task<JsonElement> Json(HttpResponseMessage response) { response.EnsureSuccessStatusCode(); return await response.Content.ReadFromJsonAsync<JsonElement>(); }
    static async Task<JsonElement> Create(HttpClient client, string title = "Engineer") => await Json(await client.PostAsJsonAsync("/api/applications", new { title, company = "Example", rawDescription = "Docker and Linux", requestId = Guid.NewGuid() }));
    [Fact]
    public async Task AnonymousInternalRequestsAndOrdinaryUsersCannotBypassAuthorization()
    {
        await using var app = new ApiFactory();
        var anonymous = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/applications")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync($"/api/internal/applications/{Guid.NewGuid()}/requirements", new { })).StatusCode);
        anonymous.DefaultRequestHeaders.Add("X-Automation-Key", "wrong");
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/internal/reminders/stale")).StatusCode);
        var (user, _) = await app.User();
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync("/api/admin/users")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/health/ready")).StatusCode);
    }
    [Fact]
    public async Task CreatePersistsRunAndCallbackNormalizesDuplicatesIdempotently()
    {
        await using var app = new ApiFactory();
        var (user, _) = await app.User();
        var created = await Create(user);
        var id = created.GetProperty("application").GetProperty("id").GetGuid();
        var runId = created.GetProperty("runId").GetGuid();
        var state = await Json(await user.GetAsync($"/api/applications/{id}/automation-status?runId={runId}"));
        Assert.Equal("queued", state.GetProperty("status").GetString());
        var callback = new { runId, skills = new[] { new { name = " Docker ", importance = 1 }, new { name = "docker", importance = 3 }, new { name = "LINUX", importance = 1 } } };
        var internalClient = app.Automation();
        await Json(await internalClient.PutAsJsonAsync($"/api/internal/applications/{id}/skills", callback));
        await Json(await internalClient.PutAsJsonAsync($"/api/internal/applications/{id}/skills", callback));
        var skills = await Json(await user.GetAsync($"/api/applications/{id}/skills"));
        Assert.Equal(2, skills.GetProperty("skills").GetArrayLength());
        Assert.Equal(3, skills.GetProperty("skills")[0].GetProperty("importance").GetInt32());
        state = await Json(await user.GetAsync($"/api/applications/{id}/automation-status?runId={runId}"));
        Assert.Equal("succeeded", state.GetProperty("status").GetString());
        var (other, _) = await app.User();
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/applications/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/applications/{id}/skills")).StatusCode);
    }
    [Fact]
    public async Task SupersededCallbacksAndStaleRequirementsEditsAreRejected()
    {
        await using var app = new ApiFactory();
        var (user, _) = await app.User();
        var created = await Create(user);
        var row = created.GetProperty("application"); var id = row.GetProperty("id").GetGuid();
        var newRun = await Json(await user.PostAsync($"/api/applications/{id}/retry-skill-extraction", null));
        var internalClient = app.Automation();
        Assert.Equal(HttpStatusCode.Conflict, (await internalClient.PutAsJsonAsync($"/api/internal/applications/{id}/skills", new { runId = created.GetProperty("runId").GetGuid(), skills = new[] { new { name = "old", importance = 3 } } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await internalClient.PutAsJsonAsync($"/api/internal/applications/{id}/skills", new { runId = newRun.GetProperty("runId").GetGuid(), skills = Array.Empty<object>(), requirementsEmbedding = new[] { 1f, 2f } })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await user.PutAsJsonAsync($"/api/applications/{id}/skills", new { version = row.GetProperty("version").GetGuid(), skills = Array.Empty<object>() })).StatusCode);
        var fresh = await Json(await user.GetAsync($"/api/applications/{id}"));
        var saved = await Json(await user.PutAsJsonAsync($"/api/applications/{id}/skills", new { version = fresh.GetProperty("version").GetGuid(), skills = new[] { new { name = "manual", importance = 2 } } }));
        Assert.Equal(2, saved.GetProperty("skills")[0].GetProperty("importance").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await internalClient.PutAsJsonAsync($"/api/internal/applications/{id}/skills", new { runId = newRun.GetProperty("runId").GetGuid(), skills = new[] { new { name = "late", importance = 3 } } })).StatusCode);
    }
    [Fact]
    public async Task FitIsConsistentAndPersonalLevelsDoNotChangeIt()
    {
        await using var app = new ApiFactory();
        var (user, _) = await app.User(); var created = await Create(user);
        var id = created.GetProperty("application").GetProperty("id").GetGuid();
        await Json(await app.Automation().PutAsJsonAsync($"/api/internal/applications/{id}/skills", new { runId = created.GetProperty("runId").GetGuid(), skills = new[] { new { name = "docker", importance = 3 }, new { name = "linux", importance = 1 } } }));
        await Json(await user.PostAsJsonAsync("/api/me/skills", new { skillNames = new[] { "docker" } }));
        await Json(await user.PutAsJsonAsync("/api/me/skills/level", new { name = "docker", level = 1 }));
        var detail = await Json(await user.GetAsync($"/api/applications/{id}"));
        var board = await Json(await user.GetAsync("/api/applications"));
        Assert.Equal(75, detail.GetProperty("fitPercentage").GetInt32());
        Assert.Equal(detail.GetProperty("fitPercentage").GetInt32(), board[0].GetProperty("fitPercentage").GetInt32());
        await Json(await user.PutAsJsonAsync("/api/me/skills/level", new { name = "docker", level = 4 }));
        detail = await Json(await user.GetAsync($"/api/applications/{id}"));
        Assert.Equal(75, detail.GetProperty("fitPercentage").GetInt32());
    }
    [Fact]
    public async Task InterviewCallbackTargetsImmutableRoundAndPreservesUserNotes()
    {
        await using var app = new ApiFactory();
        var (user, _) = await app.User(); var created = await Create(user);
        var id = created.GetProperty("application").GetProperty("id").GetGuid();
        var first = await Json(await user.PutAsJsonAsync($"/api/applications/{id}/stage-details", new { stage = 3, fields = new { round = 1, prepNotes = "My notes", scheduledAt = "2026-12-01T08:00:00Z", timeZone = "UTC" } }));
        var second = await Json(await user.PutAsJsonAsync($"/api/applications/{id}/stage-details", new { stage = 3, fields = new { round = 2 } }));
        var stageId = first.GetProperty("id").GetGuid();
        var run = await Json(await user.PostAsJsonAsync($"/api/applications/{id}/interview-questions", new { stageDetailId = stageId }));
        await Json(await app.Automation().PutAsJsonAsync($"/api/internal/applications/{id}/interview-questions", new { runId = run.GetProperty("runId").GetGuid(), stageDetailId = stageId, questions = "How do you deploy?" }));
        var detail = await Json(await user.GetAsync($"/api/applications/{id}"));
        var rounds = detail.GetProperty("stageDetails").EnumerateArray().ToList();
        Assert.Equal("How do you deploy?", rounds.Single(r => r.GetProperty("id").GetGuid() == stageId).GetProperty("generatedQuestions").GetString());
        Assert.Contains("My notes", rounds.Single(r => r.GetProperty("id").GetGuid() == stageId).GetProperty("fieldsJson").GetString());
        Assert.Equal(JsonValueKind.Null, rounds.Single(r => r.GetProperty("id").GetGuid() == second.GetProperty("id").GetGuid()).GetProperty("generatedQuestions").ValueKind);
        Assert.Equal(HttpStatusCode.Conflict, (await user.PutAsJsonAsync($"/api/applications/{id}/stage-details", new { stage = 3, stageDetailId = stageId, version = first.GetProperty("version").GetGuid(), fields = new { prepNotes = "stale overwrite" } })).StatusCode);
    }
    [Fact]
    public async Task NotesUpdateActivityButDoNotInventEmployerResponse()
    {
        await using var app = new ApiFactory();
        var (user, owner) = await app.User(); var created = await Create(user);
        var id = created.GetProperty("application").GetProperty("id").GetGuid();
        using (var scope = app.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var row = await db.Applications.IgnoreQueryFilters().SingleAsync(a => a.Id == id); row.UpdatedAt = DateTimeOffset.UtcNow.AddDays(-100); row.AppliedDate = row.UpdatedAt; await db.SaveChangesAsync(); }
        var updated = await Json(await user.PostAsJsonAsync($"/api/applications/{id}/notes", new { body = "Sent a follow-up" }));
        Assert.True(updated.GetProperty("updatedAt").GetDateTimeOffset() > DateTimeOffset.UtcNow.AddMinutes(-1));
        var alerts = await Json(await user.GetAsync("/api/analytics/pipeline-alerts"));
        Assert.Empty(alerts.GetProperty("stale").EnumerateArray());
        Assert.Single(alerts.GetProperty("noReply").EnumerateArray());
        updated = await Json(await user.PatchAsJsonAsync($"/api/applications/{id}/follow-up", new { version = updated.GetProperty("version").GetGuid(), responseReceived = true }));
        alerts = await Json(await user.GetAsync("/api/analytics/pipeline-alerts"));
        Assert.Empty(alerts.GetProperty("noReply").EnumerateArray());
    }
    [Fact]
    public async Task RoleMutationRevokesTokensAndEnforcesServerSafeguards()
    {
        await using var app = new ApiFactory();
        var (admin, adminId) = await app.User("admin");
        var (second, secondId) = await app.User("admin");
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/users/{adminId}/role", new { role = "user" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.DeleteAsync($"/api/admin/users/{adminId}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/admin/users/{secondId}/role", new { role = "unknown" })).StatusCode);
        (await admin.PutAsJsonAsync($"/api/admin/users/{secondId}/role", new { role = "user" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await second.GetAsync("/api/admin/users")).StatusCode);
        (await admin.DeleteAsync($"/api/admin/users/{secondId}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await second.PostAsJsonAsync("/api/applications", new { title = "orphan", rawDescription = "" })).StatusCode);
    }
    [Fact]
    public async Task DemoProfileUsesPersistentIdentityAndSandboxIsPerSession()
    {
        await using var app = new ApiFactory();
        var (demo, id) = await app.User("test");
        var profile = await Json(await demo.GetAsync("/api/me")); Assert.Equal(id, profile.GetProperty("id").GetGuid());
        var created = await Create(demo);
        var run = await Json(await demo.GetAsync($"/api/applications/{created.GetProperty("application").GetProperty("id").GetGuid()}/automation-status"));
        Assert.Equal("succeeded", run.GetProperty("status").GetString());
        var login = await Json(await app.CreateClient().PostAsJsonAsync("/api/auth/login", new { email = id + "@example.test", password = "TestingPassword123!" }));
        var newSession = app.CreateClient(); newSession.DefaultRequestHeaders.Authorization = new("Bearer", login.GetProperty("token").GetString());
        Assert.Empty((await Json(await newSession.GetAsync("/api/applications"))).EnumerateArray());
        Assert.Equal(HttpStatusCode.BadRequest, (await demo.PutAsJsonAsync("/api/me/profile", new { email = "changed@example.test" })).StatusCode);
    }
}
