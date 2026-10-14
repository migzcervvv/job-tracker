using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace JobTracker.Api.Services;
public interface ISkillResolver { Task<List<Skill>> ResolveSkillsAsync(List<string> names); }
public class SkillResolver(AppDbContext db) : ISkillResolver
{
    public static string Normalize(string name) => name.Trim().ToLowerInvariant();
    public async Task<List<Skill>> ResolveSkillsAsync(List<string> names)
    {
        var normalized = names.Where(n => !string.IsNullOrWhiteSpace(n)).Select(Normalize).Distinct().ToList();
        if (normalized.Count > 200 || normalized.Any(n => n.Length > 100)) throw new ArgumentException("Too many skills or skill name too long.");
        var existing = await db.Skills.Where(s => normalized.Contains(s.Name)).ToListAsync();
        existing.AddRange(db.Skills.Local.Where(s => normalized.Contains(s.Name) && !existing.Any(e => e.Id == s.Id)).ToList());
        foreach (var name in normalized.Except(existing.Select(s => s.Name)))
        {
            var id = Guid.NewGuid();
            if (db.Database.IsNpgsql())
                await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"Skills\" (\"Id\", \"Name\") VALUES ({id}, {name}) ON CONFLICT (\"Name\") DO NOTHING");
            else { var skill = new Skill { Id = id, Name = name }; db.Skills.Add(skill); existing.Add(skill); }
        }
        return db.Database.IsNpgsql() ? await db.Skills.Where(s => normalized.Contains(s.Name)).ToListAsync() : existing;
    }
}
