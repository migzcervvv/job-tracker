// Services/IFitScorer.cs
using JobTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Api.Services;

public record FitBreakdown(int Overall, int SkillMatch, int? Semantic, int RequiredCovered, int RequiredTotal);

public interface IFitScorer
{
    Task<Dictionary<Guid, FitBreakdown>> ScoreAsync(Guid userId, List<Guid> applicationIds, CancellationToken ct = default);
}

public class FitScorer(AppDbContext db) : IFitScorer
{
    public async Task<Dictionary<Guid, FitBreakdown>> ScoreAsync(Guid userId, List<Guid> applicationIds, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        var result = new Dictionary<Guid, FitBreakdown>();
        if (applicationIds.Count == 0) return result;

        var links = await db.ApplicationSkills.AsNoTracking()
            .Where(x => applicationIds.Contains(x.ApplicationId) && x.Application!.UserId == userId)
            .Select(x => new { x.ApplicationId, x.SkillId, x.Importance })
            .ToListAsync(ct);
        // New applications have no extracted skills. They need no profile,
        // resume or vector queries, and no score is different from a zero score.
        if (links.Count == 0) return result;

        var mySkillIds = (await db.UserSkills.AsNoTracking()
            .Where(us => us.UserId == userId)
            .Select(us => us.SkillId)
            .ToListAsync(ct)).ToHashSet();

        var semanticScores = new Dictionary<Guid, int>();
        // Demo/test stores deliberately do not map vector properties.
        if (db.Database.IsNpgsql())
        {
            var scoredIds = links.Select(l => l.ApplicationId).Distinct().ToList();
            var apps = await db.Applications.AsNoTracking()
                .Where(a => a.UserId == userId && scoredIds.Contains(a.Id) && a.RequirementsEmbedding != null)
                .Select(a => new { a.Id, a.RequirementsEmbedding, a.ResumeId })
                .ToListAsync(ct);
            var resumeIds = apps.Where(a => a.ResumeId.HasValue).Select(a => a.ResumeId!.Value).Distinct().ToList();
            var resumes = new Dictionary<Guid, Pgvector.Vector?>();
            if (resumeIds.Count > 0)
                resumes = await db.Resumes.AsNoTracking().Where(r => r.UserId == userId && resumeIds.Contains(r.Id))
                    .Select(r => new { r.Id, r.Embedding }).ToDictionaryAsync(r => r.Id, r => r.Embedding, ct);
            var profileEmbedding = apps.Any(a => a.ResumeId == null)
                ? await db.UserProfiles.AsNoTracking().Where(p => p.UserId == userId).Select(p => p.ResumeEmbedding).FirstOrDefaultAsync(ct)
                : null;
            foreach (var app in apps)
            {
                var resumeEmbedding = app.ResumeId.HasValue ? resumes.GetValueOrDefault(app.ResumeId.Value) : profileEmbedding;
                if (resumeEmbedding == null) continue;
                var sim = CosineSimilarity(resumeEmbedding.ToArray(), app.RequirementsEmbedding!.ToArray());
                // Display heuristic, not a calibrated probability.
                semanticScores[app.Id] = (int)Math.Round(Math.Clamp((sim - 0.3) / 0.6, 0, 1) * 100);
            }
        }

        foreach (var group in links.GroupBy(l => l.ApplicationId))
        {
            ct.ThrowIfCancellationRequested();
            var required = group.ToList();

            // Weight by importance: missing a must-have hurts more than
            // missing a nice-to-have. Weight 1..3 maps directly.
            var totalWeight = required.Sum(r => Math.Clamp(r.Importance, 1, 3));
            var matchedWeight = required.Where(r => mySkillIds.Contains(r.SkillId))
                                        .Sum(r => Math.Clamp(r.Importance, 1, 3));
            var skillMatch = (int)Math.Round(100.0 * matchedWeight / totalWeight);

            int? semantic = semanticScores.TryGetValue(group.Key, out var value) ? value : null;

            // Skill match dominates — it's explainable ("you're missing Docker").
            // Semantic is a supporting signal for things skills alone miss.
            var overall = semantic.HasValue
                ? (int)Math.Round(skillMatch * 0.7 + semantic.Value * 0.3)
                : skillMatch;

            result[group.Key] = new FitBreakdown(
                overall, skillMatch, semantic,
                required.Count(r => mySkillIds.Contains(r.SkillId)), required.Count);
        }

        return result;
    }

    public static double CosineSimilarity(float[] a, float[] b)
    {
        if (a.Length != b.Length) return 0;
        double dot = 0, magA = 0, magB = 0;
        for (var i = 0; i < a.Length; i++)
        {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }
        if (magA == 0 || magB == 0) return 0;
        return dot / (Math.Sqrt(magA) * Math.Sqrt(magB));
    }
}
