using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace JobTracker.Api.Tests;

public class MultiTenantIsolationTests
{
    /// <summary>
    /// Handling multi-tenant testing for Users
    /// </summary>
    [Fact]
    public async Task UserBCannotSeeUserAsApplications()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var userA = Guid.NewGuid();
        var userB = Guid.NewGuid();

        // Seed as user A
        await using (var seedDb = new AppDbContext(options, new FakeCurrentUser(userA)))
        {
            seedDb.Applications.Add(new Application
            {
                Id = Guid.NewGuid(),
                UserId = userA,
                Title = "A's job",
                Company = "Acme",
                RawDescription = "test",
                AppliedDate = DateTimeOffset.UtcNow,
            });
            await seedDb.SaveChangesAsync();
        }

        // Query as user B — the global query filter should hide it
        await using var dbAsUserB = new AppDbContext(options, new FakeCurrentUser(userB));
        var results = await dbAsUserB.Applications.ToListAsync();

        Assert.Empty(results);
    }
}