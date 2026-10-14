using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
namespace JobTracker.Api.Tests;
public class FeatureRegressionTests
{
    [Fact]
    public async Task NullCollectionElementsReturnValidationErrorsWithoutMutatingData()
    {
        await using var factory = new ApiFactory(); var (user, _) = await factory.User();
        Assert.Equal(HttpStatusCode.BadRequest, (await user.PostAsJsonAsync("/api/data/import", new { schemaVersion = 1, applications = new object?[] { null } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await user.PostAsJsonAsync("/api/data/import", new { schemaVersion = 1, applications = new[] { new { application = new { title = "Invalid", rawDescription = "Docker" }, skills = new object?[] { null } } } })).StatusCode);
        var created = await Create(user); var app = created.GetProperty("application"); var id = app.GetProperty("id").GetGuid();
        var runId = created.GetProperty("runId").GetGuid();
        var (other, _) = await factory.User();
        Assert.Equal(HttpStatusCode.BadRequest, (await other.PostAsJsonAsync("/api/applications", new { title = "Collision", rawDescription = "Docker", requestId = id })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await factory.Automation().PutAsJsonAsync($"/api/internal/applications/{id}/skills", new { runId, skills = new object?[] { null } })).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await db.ApplicationSkills.IgnoreQueryFilters().ToListAsync());
        Assert.NotEqual("succeeded", (await db.AutomationRuns.IgnoreQueryFilters().SingleAsync()).Status);
    }
    static async Task<JsonElement> Json(HttpResponseMessage response) { Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync()); return await response.Content.ReadFromJsonAsync<JsonElement>(); }
    static async Task<JsonElement> Create(HttpClient client, int status = 0, Guid? requestId = null) => await Json(await client.PostAsJsonAsync("/api/applications", new { title = "Engineer", rawDescription = "Docker", status, requestId }));
    [Fact]
    public async Task GlobalSkillMergePreservesAssociationsAndMetadataForEveryTenant()
    {
        await using var factory = new ApiFactory(); var (admin, _) = await factory.User("admin"); var (_, one) = await factory.User(); var (_, two) = await factory.User();
        Guid sourceId = Guid.NewGuid(), targetId = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var first = new Application { Id = Guid.NewGuid(), UserId = one }; var second = new Application { Id = Guid.NewGuid(), UserId = two };
            db.Applications.AddRange(first, second); db.Skills.AddRange(new Skill { Id = sourceId, Name = "docker alias" }, new Skill { Id = targetId, Name = "docker" });
            db.ApplicationSkills.AddRange(new ApplicationSkill { ApplicationId = first.Id, SkillId = sourceId, Importance = 3 }, new ApplicationSkill { ApplicationId = second.Id, SkillId = sourceId, Importance = 2 }, new ApplicationSkill { ApplicationId = second.Id, SkillId = targetId, Importance = 1 });
            db.UserSkills.AddRange(new UserSkill { UserId = one, SkillId = sourceId, Level = SkillLevel.Expert, EvidenceText = "Production deployment", EvidenceStrength = .9 }, new UserSkill { UserId = two, SkillId = sourceId, Level = SkillLevel.Advanced, EvidenceStrength = .8 }, new UserSkill { UserId = two, SkillId = targetId, Level = SkillLevel.Beginner, EvidenceStrength = .1 });
            await db.SaveChangesAsync();
        }
        await Json(await admin.PostAsJsonAsync("/api/admin/skills/merge", new { sourceSkillId = sourceId, targetSkillId = targetId }));
        using var verifyScope = factory.Services.CreateScope(); var verify = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var appLinks = await verify.ApplicationSkills.IgnoreQueryFilters().ToListAsync(); Assert.Equal(2, appLinks.Count); Assert.All(appLinks, link => Assert.Equal(targetId, link.SkillId));
        Assert.Contains(appLinks, link => link.Importance == 3); Assert.Contains(appLinks, link => link.Importance == 2);
        var userLinks = await verify.UserSkills.IgnoreQueryFilters().ToListAsync(); Assert.Equal(2, userLinks.Count);
        Assert.Equal(SkillLevel.Expert, userLinks.Single(link => link.UserId == one).Level); Assert.Equal("Production deployment", userLinks.Single(link => link.UserId == one).EvidenceText);
        Assert.Equal(SkillLevel.Advanced, userLinks.Single(link => link.UserId == two).Level);
        Assert.False(await verify.Skills.AnyAsync(s => s.Id == sourceId));
    }
    [Fact]
    public async Task ResumeCallbacksDoNotSelectActiveProfileAndOldProposalConfirmationIsRejected()
    {
        await using var factory = new ApiFactory(); var (user, owner) = await factory.User();
        var resumeId = Guid.NewGuid(); var runId = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.Resumes.Add(new Resume { Id = resumeId, UserId = owner, FileName = "fixture.pdf", StoragePath = "fixture", ExtractionRunId = runId, ExtractionStatus = "queued" }); db.AutomationRuns.Add(new AutomationRun { Id = runId, UserId = owner, ResumeId = resumeId, Type = "resume_extraction" }); await db.SaveChangesAsync(); }
        await Json(await factory.Automation().PutAsJsonAsync($"/api/internal/resumes/{resumeId}/extraction", new { runId, extractedText = "Built Docker services", skills = new[] { new { name = "Docker", evidence = "Built Docker services", strength = .9 } } }));
        using (var scope = factory.Services.CreateScope()) Assert.Empty(await scope.ServiceProvider.GetRequiredService<AppDbContext>().UserProfiles.IgnoreQueryFilters().ToListAsync());
        await Json(await user.PostAsJsonAsync($"/api/resumes/{resumeId}/confirm-skills", new { runId, skillNames = new[] { "docker" } }));
        var skills = await Json(await user.GetAsync("/api/me/skills")); Assert.Equal("Built Docker services", skills[0].GetProperty("evidenceText").GetString());
        await Json(await user.PostAsync($"/api/resumes/{resumeId}/activate", null));
        using (var scope = factory.Services.CreateScope()) Assert.Equal(resumeId, (await scope.ServiceProvider.GetRequiredService<AppDbContext>().UserProfiles.IgnoreQueryFilters().SingleAsync()).ActiveResumeId);
        await Json(await user.PostAsync($"/api/resumes/{resumeId}/retry-extraction", null));
        Assert.Equal(HttpStatusCode.Conflict, (await user.PostAsJsonAsync($"/api/resumes/{resumeId}/confirm-skills", new { runId, skillNames = Array.Empty<string>() })).StatusCode);
        (await factory.Automation().PutAsJsonAsync($"/api/internal/resumes/{resumeId}/extraction", new { runId, extractedText = "Outdated", skills = Array.Empty<object>() })).EnsureSuccessStatusCode();
        using var verifyScope = factory.Services.CreateScope();
        Assert.Equal("Built Docker services", (await verifyScope.ServiceProvider.GetRequiredService<AppDbContext>().Resumes.IgnoreQueryFilters().SingleAsync()).ExtractedText);
    }
    [Fact]
    public async Task AccountDeletionErasesOwnedDataAndQueuesStorageCleanup()
    {
        await using var factory = new ApiFactory(); var (admin, _) = await factory.User("admin"); var (user, owner) = await factory.User(); var created = await Create(user); var id = created.GetProperty("application").GetProperty("id").GetGuid();
        using (var scope = factory.Services.CreateScope()) { var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); db.Resumes.Add(new Resume { Id = Guid.NewGuid(), UserId = owner, FileName = "private.pdf", StoragePath = "owner/resume.pdf" }); db.UserProfiles.Add(new UserProfile { UserId = owner, ResumeRawText = "Private text" }); await db.SaveChangesAsync(); }
        (await admin.DeleteAsync($"/api/admin/users/{owner}")).EnsureSuccessStatusCode();
        using var verifyScope = factory.Services.CreateScope(); var verify = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await verify.Applications.IgnoreQueryFilters().Where(a => a.UserId == owner).ToListAsync());
        Assert.Empty(await verify.StageDetails.IgnoreQueryFilters().Where(s => s.ApplicationId == id).ToListAsync());
        Assert.Empty(await verify.TimelineEvents.IgnoreQueryFilters().Where(t => t.ApplicationId == id).ToListAsync());
        Assert.Empty(await verify.Resumes.IgnoreQueryFilters().Where(r => r.UserId == owner).ToListAsync());
        Assert.Empty(await verify.UserProfiles.IgnoreQueryFilters().Where(r => r.UserId == owner).ToListAsync());
        Assert.Empty(await verify.AutomationRuns.IgnoreQueryFilters().Where(r => r.UserId == owner).ToListAsync());
        Assert.Single(await verify.StorageDeletions.ToListAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await user.GetAsync("/api/me")).StatusCode);
    }
    [Fact]
    public async Task JsonPortabilityPreservesRequirementsStagesAndNotesIdempotently()
    {
        await using var factory = new ApiFactory(); var (source, _) = await factory.User(); var (destination, _) = await factory.User();
        var input = new { schemaVersion = 1, applications = new[] { new { application = new { title = "Imported", company = "Example", rawDescription = "Docker", requestId = Guid.NewGuid(), status = -1 }, skills = new[] { new { name = "Docker", importance = 3 } }, stageDetails = new[] { new { stage = 0, fields = new { notes = "Stage note" } } }, notes = new[] { "Recruiter call" } } } };
        var result = await Json(await source.PostAsJsonAsync("/api/data/import", input)); Assert.Equal(1, result.GetProperty("imported").GetInt32());
        result = await Json(await source.PostAsJsonAsync("/api/data/import", input)); Assert.Equal(1, result.GetProperty("skipped").GetInt32());
        var exported = await Json(await source.GetAsync("/api/data/export"));
        Assert.Equal(3, exported.GetProperty("applications")[0].GetProperty("skills")[0].GetProperty("importance").GetInt32());
        // Remap exported IDs for another account; primary keys cannot collide across tenants.
        var application = exported.GetProperty("applications")[0].GetProperty("application");
        result = await Json(await destination.PostAsJsonAsync("/api/data/import", new { schemaVersion = 1, applications = new[] { new { application = new { title = application.GetProperty("title").GetString(), rawDescription = "Docker", status = -1 }, skills = exported.GetProperty("applications")[0].GetProperty("skills"), stageDetails = exported.GetProperty("applications")[0].GetProperty("stageDetails"), notes = exported.GetProperty("applications")[0].GetProperty("notes") } } }));
        Assert.Equal(1, result.GetProperty("imported").GetInt32());
    }
    [Fact]
    public async Task NotificationClaimAndCompletionAreDeduplicatedAndRespectOptIn()
    {
        await using var factory = new ApiFactory(); var (user, owner) = await factory.User(); var automation = factory.Automation();
        var key = "stale:" + owner + ":2026-10-13";
        Assert.Equal(HttpStatusCode.Conflict, (await automation.PostAsJsonAsync("/api/internal/notifications/claim", new { userId = owner, deliveryKey = key })).StatusCode);
        await Json(await user.PutAsJsonAsync("/api/me/preferences", new { remindersEnabled = true, weeklyDigestEnabled = false, timeZone = "UTC" }));
        var receipt = await Json(await automation.PostAsJsonAsync("/api/internal/notifications/claim", new { userId = owner, deliveryKey = key }));
        Assert.Equal(HttpStatusCode.Conflict, (await automation.PostAsJsonAsync("/api/internal/notifications/claim", new { userId = owner, deliveryKey = key })).StatusCode);
        var completion = new { deliveryKey = key, leaseToken = receipt.GetProperty("leaseToken").GetGuid() };
        (await automation.PostAsJsonAsync("/api/internal/notifications/complete", completion)).EnsureSuccessStatusCode();
        (await automation.PostAsJsonAsync("/api/internal/notifications/complete", completion)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await automation.PostAsJsonAsync("/api/internal/notifications/claim", new { userId = owner, deliveryKey = key })).StatusCode);
    }
    [Fact]
    public async Task WorkflowClaimPreventsDuplicateProcessingAndSavedApplicationsDoNotCountAsApplied()
    {
        await using var factory = new ApiFactory(); var (user, _) = await factory.User(); var created = await Create(user, -1, Guid.NewGuid());
        var runId = created.GetProperty("runId").GetGuid(); var automation = factory.Automation();
        await Json(await automation.PostAsync($"/api/internal/runs/{runId}/claim", null));
        Assert.Equal(HttpStatusCode.Conflict, (await automation.PostAsync($"/api/internal/runs/{runId}/claim", null)).StatusCode);
        var alerts = await Json(await user.GetAsync("/api/analytics/pipeline-alerts")); Assert.Equal(0, alerts.GetProperty("appliedThisWeek").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await user.PostAsJsonAsync("/api/applications", new { title = "Bad URL", rawDescription = "", jobUrl = "javascript:alert(1)" })).StatusCode);
    }
}
