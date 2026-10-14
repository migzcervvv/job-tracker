using JobTracker.Api.Data;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
namespace JobTracker.Api.Tests;
public class SkillNormalizationTests
{
    [Fact]
    public async Task ResolverDeduplicatesNormalizedNamesAcrossUncommittedCalls()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var resolver = new SkillResolver(db);
        var first = await resolver.ResolveSkillsAsync(new() { " Docker ", "DOCKER", " C# " });
        var second = await resolver.ResolveSkillsAsync(new() { "docker" });
        Assert.Equal(first.Single(s => s.Name == "docker").Id, second.Single().Id);
        await db.SaveChangesAsync(); Assert.Equal(2, await db.Skills.CountAsync());
    }
    [Fact]
    public void TokensIncludeRevocationStampAndBoundedExpiry()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Jwt:Key"] = "test-key-at-least-32-characters-long", ["Jwt:Issuer"] = "test-issuer", ["Jwt:ExpiryMinutes"] = "99999" }).Build();
        var user = new IdentityUser<Guid> { Id = Guid.NewGuid(), Email = "test@example.test", SecurityStamp = "security-version" };
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(new TokenService(config).CreateToken(user, new List<string> { "admin" }));
        Assert.Contains(jwt.Claims, c => c.Type == ClaimTypes.Role && c.Value == "admin");
        Assert.Contains(jwt.Claims, c => c.Type == "security_stamp" && c.Value == user.SecurityStamp);
        Assert.True(jwt.ValidTo <= DateTime.UtcNow.AddMinutes(121));
    }
}
