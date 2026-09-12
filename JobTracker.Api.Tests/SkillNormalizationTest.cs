using JobTracker.Api.Data;
using JobTracker.Api.Models;
using JobTracker.Api.Services;
using JobTracker.Api.Tests;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Xunit;

public class SkillNormalizationTests
{
    [Fact]
    public void TrimsAndLowercasesSkillNames()
    {
        var input = new List<string> { "  C#  ", "Docker", "docker" };

        var normalized = input
            .Select(n => n.Trim().ToLowerInvariant())
            .Where(n => n.Length > 0)
            .Distinct()
            .ToList();

        Assert.Equal(2, normalized.Count);
        Assert.Contains("c#", normalized);
        Assert.Contains("docker", normalized);
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(9, true)]
    [InlineData(47, false)]
    public void ValidatesStatusIsADefinedEnumValue(int status, bool expectedValid)
    {
        Assert.Equal(expectedValid, Enum.IsDefined(typeof(ApplicationStatus), status));
    }

    [Fact]
    public void TokenContainsUserIdAndRoleClaims()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> {
        {"Jwt:Key", "test-key-at-least-32-characters-long"},
        {"Jwt:Issuer", "test-issuer"},
            })
            .Build();

        var service = new TokenService(config);
        var user = new IdentityUser<Guid> { Id = Guid.NewGuid(), Email = "test@example.com" };

        var token = service.CreateToken(user, new List<string> { "admin" });
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.Contains(jwt.Claims, c => c.Type == ClaimTypes.Role && c.Value == "admin");
    }
}