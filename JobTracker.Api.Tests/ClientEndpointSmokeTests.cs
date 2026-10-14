using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.Extensions.DependencyInjection;
namespace JobTracker.Api.Tests;

public class ClientEndpointSmokeTests
{
    [Fact] public async Task ClientApplicationAndAccountRoutesWorkTogetherForANormalAccount()
    {
        await using var factory = new ApiFactory(); var (client, _) = await factory.User();
        var created = await client.PostAsJsonAsync("/api/applications", new { title = "Platform Engineer", company = "Acme", rawDescription = "Linux" });
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("application").GetProperty("id").GetGuid();
        foreach (var path in new[] { "/api/applications?page=1&pageSize=200", $"/api/applications/{id}", "/api/me", "/api/me/preferences" })
        {
            var response = await client.GetAsync(path);
            Assert.True(response.IsSuccessStatusCode, path + ": " + await response.Content.ReadAsStringAsync());
            Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        }
    }
    [Fact] public async Task LibraryContextExplainsRolesRequirementsRelatedSkillsAndAliases()
    {
        await using var factory = new ApiFactory(); var (admin, owner) = await factory.User("admin");
        var skill = new Skill { Id = Guid.NewGuid(), Name = "linux" };
        var alias = new Skill { Id = Guid.NewGuid(), Name = "linux administration" };
        var related = new Skill { Id = Guid.NewGuid(), Name = "terraform" };
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var application = new Application { Id = Guid.NewGuid(), UserId = owner, Title = "Platform Engineer", Company = "Acme", RawDescription = "Maintain Linux servers with Terraform." };
            db.Applications.Add(application); db.Skills.AddRange(skill, alias, related);
            db.ApplicationSkills.AddRange(new ApplicationSkill { ApplicationId = application.Id, SkillId = skill.Id, Importance = 3 }, new ApplicationSkill { ApplicationId = application.Id, SkillId = related.Id, Importance = 2 });
            await db.SaveChangesAsync();
        }
        var response = await admin.GetAsync($"/api/admin/skills/{skill.Id}");
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        var data = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, data.GetProperty("requiredCount").GetInt32());
        Assert.Equal("Platform Engineer", data.GetProperty("roles")[0].GetProperty("title").GetString());
        Assert.Equal("terraform", data.GetProperty("relatedSkills")[0].GetProperty("name").GetString());
        Assert.Equal("linux administration", data.GetProperty("suggestedAliases")[0].GetProperty("name").GetString());
        Assert.Contains("Linux servers", data.GetProperty("examples")[0].GetProperty("text").GetString());
        var (member, _) = await factory.User();
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync($"/api/admin/skills/{skill.Id}")).StatusCode);
    }
}
