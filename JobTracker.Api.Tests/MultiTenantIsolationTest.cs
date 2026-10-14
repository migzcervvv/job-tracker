using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.EntityFrameworkCore;
namespace JobTracker.Api.Tests;
public class MultiTenantIsolationTest
{
    [Fact]
    public async Task TenantFiltersFailClosedAndIsolateOwnedRows()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var a = Guid.NewGuid(); var b = Guid.NewGuid();
        await using (var seed = new AppDbContext(options, new FakeCurrentUser(a)))
        {
            seed.Applications.AddRange(new Application { Id = Guid.NewGuid(), UserId = a, Title = "A" }, new Application { Id = Guid.NewGuid(), UserId = b, Title = "B" });
            seed.Resumes.AddRange(new Resume { Id = Guid.NewGuid(), UserId = a, FileName = "a.pdf", StoragePath = "a" }, new Resume { Id = Guid.NewGuid(), UserId = b, FileName = "b.pdf", StoragePath = "b" });
            seed.AutomationRuns.AddRange(new AutomationRun { UserId = a, Type = "skill_extraction" }, new AutomationRun { UserId = b, Type = "skill_extraction" });
            await seed.SaveChangesAsync();
        }
        await using var tenant = new AppDbContext(options, new FakeCurrentUser(a));
        Assert.Equal("A", (await tenant.Applications.SingleAsync()).Title);
        Assert.Equal(a, (await tenant.Resumes.SingleAsync()).UserId);
        Assert.Equal(a, (await tenant.AutomationRuns.SingleAsync()).UserId);
        await using var anonymous = new AppDbContext(options, new FakeCurrentUser(null));
        Assert.Empty(await anonymous.Applications.ToListAsync());
        Assert.Empty(await anonymous.Resumes.ToListAsync());
        Assert.Empty(await anonymous.AutomationRuns.ToListAsync());
        Assert.Equal(2, await anonymous.Applications.IgnoreQueryFilters().CountAsync());
    }
}
