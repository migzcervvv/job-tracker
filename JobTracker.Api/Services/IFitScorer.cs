// Services/IFitScorer.cs
using JobTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Api.Services;

public record FitBreakdown(int Overall, int SkillMatch, int? Semantic, int RequiredCovered, int RequiredTotal);

public interface IFitScorer
{
    Task<Dictionary<Guid, FitBreakdown>> ScoreAsync(Guid userId, List<Guid> applicationIds);
}

public class FitScorer(AppDbContext db) : IFitScorer
{
    public async Task<Dictionary<Guid, FitBreakdown>> ScoreAsync(Guid userId, List<Guid> applicationIds)
    {
        var mySkillIds = (await db.UserSkills
            .Where(us => us.UserId == userId)
            .Select(us => us.SkillId)
            .ToListAsync()).ToHashSet();

        var links = await db.ApplicationSkills
            .Where(x => applicationIds.Contains(x.ApplicationId))
            .Select(x => new { x.ApplicationId, x.SkillId, x.Importance })
            .ToListAsync();

        var profile = await db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == userId);

        var apps = await db.Applications
            .Where(a => applicationIds.Contains(a.Id))
            .Select(a => new { a.Id, a.RequirementsEmbedding })
            .ToListAsync();

        var result = new Dictionary<Guid, FitBreakdown>();

        foreach (var app in apps)
        {
            var required = links.Where(l => l.ApplicationId == app.Id).ToList();
            if (required.Count == 0) continue; // no tagged skills -> no score, not a zero score

            // Weight by importance: missing a must-have hurts more than
            // missing a nice-to-have. Weight 1..3 maps directly.
            var totalWeight = required.Sum(r => Math.Max(r.Importance, 1));
            var matchedWeight = required.Where(r => mySkillIds.Contains(r.SkillId))
                                        .Sum(r => Math.Max(r.Importance, 1));
            var skillMatch = (int)Math.Round(100.0 * matchedWeight / totalWeight);

            int? semantic = null;
            if (profile?.ResumeEmbedding is not null && app.RequirementsEmbedding is not null)
            {
                var sim = CosineSimilarity(profile.ResumeEmbedding.ToArray(), app.RequirementsEmbedding.ToArray());
                // Cosine over text embeddings rarely drops below ~0.3 even for
                // unrelated documents, so rescale 0.3-0.9 onto 0-100 instead of
                // reporting the raw value, which would make everything look great.
                semantic = (int)Math.Round(Math.Clamp((sim - 0.3) / 0.6, 0, 1) * 100);
            }

            // Skill match dominates — it's explainable ("you're missing Docker").
            // Semantic is a supporting signal for things skills alone miss.
            var overall = semantic.HasValue
                ? (int)Math.Round(skillMatch * 0.7 + semantic.Value * 0.3)
                : skillMatch;

            result[app.Id] = new FitBreakdown(
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