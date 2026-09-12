using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace JobTracker.Api.Services
{
    // Services/ISkillResolver.cs
    public interface ISkillResolver
    {
        Task<List<Skill>> ResolveSkillsAsync(List<string> names);
    }

    public class SkillResolver : ISkillResolver
    {
        private readonly AppDbContext _db;
        public SkillResolver(AppDbContext db) => _db = db;

        public async Task<List<Skill>> ResolveSkillsAsync(List<string> names)
        {
            var normalized = names
                .Select(n => n.Trim().ToLowerInvariant())
                .Where(n => n.Length > 0)
                .Distinct()
                .ToList();

            var existing = await _db.Skills.Where(s => normalized.Contains(s.Name)).ToListAsync();
            var existingNames = existing.Select(s => s.Name).ToHashSet();

            var toCreate = normalized
                .Where(n => !existingNames.Contains(n))
                .Select(n => new Skill { Id = Guid.NewGuid(), Name = n })
                .ToList();

            if (toCreate.Count > 0)
            {
                _db.Skills.AddRange(toCreate);
                await _db.SaveChangesAsync();
            }

            return existing.Concat(toCreate).ToList();
        }
    }
}
