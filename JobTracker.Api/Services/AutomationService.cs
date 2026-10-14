using System.Net.Http.Json;
using System.Text.Json;
using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Api.Services;

public class AutomationService(AppDbContext db, IConfiguration config, IHttpContextAccessor context)
{
    public bool IsDemo => context.HttpContext?.User.IsInRole("test") == true;
    public bool Configured(string type) => IsDemo || !string.IsNullOrWhiteSpace(config[WebhookSetting(type)]);
    public static string WebhookSetting(string type) => type switch
    {
        "skill_extraction" => "N8n:SkillExtractionWebhookUrl",
        "resume_extraction" => "N8n:ResumeExtractionWebhookUrl",
        "interview_questions" => "N8n:InterviewQuestionsWebhookUrl",
        _ => throw new ArgumentException("Unknown automation type.")
    };

    // Caller saves this row together with the resource. No HTTP request occurs in the user transaction.
    public AutomationRun Queue(Guid userId, string type, Application? app = null, Resume? resume = null, StageDetail? stage = null)
    {
        var run = new AutomationRun { UserId = userId, Type = type, ApplicationId = app?.Id, ResumeId = resume?.Id, StageDetailId = stage?.Id };
        db.AutomationRuns.Add(run);
        if (type == "skill_extraction" && app != null) app.ExtractionRunId = run.Id;
        if (resume != null) { resume.ExtractionRunId = run.Id; resume.ExtractionStatus = "queued"; resume.Version = Guid.NewGuid(); }
        if (stage != null) stage.QuestionRunId = run.Id;
        if (IsDemo)
        {
            run.Status = "succeeded";
            if (resume != null)
            {
                resume.ExtractionStatus = "succeeded";
                resume.ProposedSkillsJson = "[]";
                resume.ExtractedText = "Demo upload: external resume processing is disabled.";
            }
            if (stage != null) stage.GeneratedQuestions = "Demo questions\nDescribe a project relevant to this role.\nHow did you diagnose a production failure?";
        }
        return run;
    }

    public static object View(AutomationRun? run) => new
    {
        runId = run?.Id,
        status = run != null && !AutomationRun.IsTerminal(run.Status) && run.DeadlineAt <= DateTimeOffset.UtcNow ? "failed" : run?.Status,
        message = run != null && !AutomationRun.IsTerminal(run.Status) && run.DeadlineAt <= DateTimeOffset.UtcNow ? "callback_timeout" : run?.ErrorCode,
        createdAt = run?.CreatedAt, updatedAt = run?.UpdatedAt, attempts = run?.Attempts,
        stageDetailId = run?.StageDetailId
    };
}

public sealed class AutomationDispatcher(AppDbContext db, IConfiguration config, IHttpClientFactory clients,
    ISupabaseStorageService storage, ILogger<AutomationDispatcher> logger)
{
    public async Task DispatchAsync(CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var expired = await db.AutomationRuns.IgnoreQueryFilters()
            .Where(r => r.Status != "succeeded" && r.Status != "failed" && r.Status != "cancelled" && r.DeadlineAt <= now).Take(50).ToListAsync(ct);
        foreach (var run in expired) { run.Status = "failed"; run.ErrorCode = "callback_timeout"; run.UpdatedAt = now; run.Version = Guid.NewGuid(); }
        try { await db.SaveChangesAsync(ct); } catch (DbUpdateConcurrencyException) { db.ChangeTracker.Clear(); }

        var due = await db.AutomationRuns.IgnoreQueryFilters()
            .Where(r => (r.Status == "queued" || r.Status == "dispatching") && r.NextAttemptAt <= now && r.DeadlineAt > now)
            .OrderBy(r => r.CreatedAt).Select(r => r.Id).Take(10).ToListAsync(ct);
        foreach (var runId in due)
        {
            db.ChangeTracker.Clear();
            var run = await db.AutomationRuns.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == runId, ct);
            if (run == null || run.NextAttemptAt > now || run.DeadlineAt <= now || run.Status is not ("queued" or "dispatching")) continue;
            if (run.Attempts >= 4) { run.Status = "failed"; run.ErrorCode = "dispatch_exhausted"; run.Version = Guid.NewGuid(); await TrySave(ct); continue; }
            run.Status = "dispatching";
            run.Attempts++;
            run.NextAttemptAt = now.AddMinutes(1); // lease longer than HTTP timeout; survives worker/process restart
            run.UpdatedAt = now;
            run.Version = Guid.NewGuid();
            if (!await TrySave(ct)) continue;
            try
            {
                var payload = await Payload(run, ct);
                if (payload is null) { run.Status = "cancelled"; run.ErrorCode = "resource_replaced_or_deleted"; }
                else
                {
                    using var request = new HttpRequestMessage(HttpMethod.Post, config[AutomationService.WebhookSetting(run.Type)]);
                    request.Headers.Add("X-Automation-Key", config["Automation:ApiKey"]);
                    request.Headers.Add("Idempotency-Key", run.Id.ToString());
                    request.Content = JsonContent.Create(payload);
                    using var response = await clients.CreateClient("n8n").SendAsync(request, ct);
                    response.EnsureSuccessStatusCode();
                    run.Status = "dispatched"; // only the authenticated callback can complete the run
                    run.ErrorCode = null;
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch (Exception ex)
            {
                run.Status = run.Attempts >= 4 ? "failed" : "queued";
                run.ErrorCode = "dispatch_failed";
                run.NextAttemptAt = DateTimeOffset.UtcNow.AddSeconds(Math.Pow(2, run.Attempts) * 5 + Random.Shared.Next(5));
                logger.LogWarning("Automation {RunId} dispatch attempt {Attempt} failed ({ExceptionType})", run.Id, run.Attempts, ex.GetType().Name);
            }
            run.UpdatedAt = DateTimeOffset.UtcNow;
            run.Version = Guid.NewGuid();
            await TrySave(ct); // a callback may already have completed it; never overwrite that result
        }

        var deletions = await db.StorageDeletions.Where(d => d.NextAttemptAt <= now).Take(20).ToListAsync(ct);
        foreach (var deletion in deletions)
        {
            try { await storage.DeleteAsync(deletion.StoragePath); db.StorageDeletions.Remove(deletion); }
            catch { deletion.Attempts++; deletion.NextAttemptAt = now.AddMinutes(Math.Min(1440, Math.Pow(2, Math.Min(deletion.Attempts, 10)))); }
        }
        await db.SaveChangesAsync(ct);
        var retention = now.AddDays(-30);
        if (db.Database.IsNpgsql())
            await db.AutomationRuns.IgnoreQueryFilters().Where(r => r.UpdatedAt < retention && (r.Status == "succeeded" || r.Status == "failed" || r.Status == "cancelled") &&
                !db.Applications.IgnoreQueryFilters().Any(a => a.ExtractionRunId == r.Id) &&
                !db.Resumes.IgnoreQueryFilters().Any(a => a.ExtractionRunId == r.Id) &&
                !db.StageDetails.IgnoreQueryFilters().Any(s => s.QuestionRunId == r.Id)).ExecuteDeleteAsync(ct);
    }

    private async Task<bool> TrySave(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); return true; }
        catch (DbUpdateConcurrencyException) { db.ChangeTracker.Clear(); return false; }
    }

    private async Task<object?> Payload(AutomationRun run, CancellationToken ct)
    {
        if (run.Type == "resume_extraction")
        {
            var resume = await db.Resumes.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(r => r.Id == run.ResumeId && r.UserId == run.UserId, ct);
            if (resume?.ExtractionRunId != run.Id) return null;
            return new { schemaVersion = 1, runId = run.Id, resumeId = resume.Id, downloadUrl = await storage.CreateSignedUrlAsync(resume.StoragePath, 600) };
        }
        var app = await db.Applications.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(a => a.Id == run.ApplicationId && a.UserId == run.UserId, ct);
        if (app is null) return null;
        if (run.Type == "skill_extraction")
            return app.ExtractionRunId != run.Id ? null : new { schemaVersion = 1, runId = run.Id, applicationId = app.Id, rawDescription = app.RawDescription };
        var stage = await db.StageDetails.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(s => s.Id == run.StageDetailId && s.ApplicationId == app.Id, ct);
        if (stage?.QuestionRunId != run.Id) return null;
        var profile = await db.UserProfiles.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(p => p.UserId == app.UserId, ct);
        var resumeId = app.ResumeId ?? profile?.ActiveResumeId;
        var resumeText = resumeId is null ? "" : await db.Resumes.IgnoreQueryFilters().Where(r => r.Id == resumeId && r.UserId == app.UserId).Select(r => r.ExtractedText).FirstOrDefaultAsync(ct);
        return new { schemaVersion = 1, runId = run.Id, applicationId = app.Id, stageDetailId = stage.Id, jobTitle = app.Title, company = app.Company, jobDescription = app.RawDescription, resumeText = resumeText ?? "" };
    }
}

public sealed class AutomationWorker(IServiceScopeFactory scopes, ILogger<AutomationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<AutomationDispatcher>().DispatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogError("Automation worker iteration failed ({ExceptionType})", ex.GetType().Name); }
            try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
