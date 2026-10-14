using System.Net.Http.Headers;
using JobTracker.Api.Data;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
namespace JobTracker.Api.Tests;
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureServices(services => { services.AddDataProtection().UseEphemeralDataProtectionProvider(); services.AddLogging(logging => logging.ClearProviders()); });
    }
    protected override IHost CreateHost(IHostBuilder builder)
    {
        builder.ConfigureHostConfiguration(config => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Testing:Database"] = Guid.NewGuid().ToString(),
            ["Jwt:Key"] = "integration-test-key-with-32-bytes-minimum",
            ["Jwt:Issuer"] = "jobtracker-tests",
            ["Automation:ApiKey"] = "test-automation-key",
            ["N8n:SkillExtractionWebhookUrl"] = "http://localhost:9999/skills",
            ["N8n:InterviewQuestionsWebhookUrl"] = "http://localhost:9999/questions",
            ["N8n:ResumeExtractionWebhookUrl"] = "http://localhost:9999/resumes"
        }));
        return base.CreateHost(builder);
    }
    public async Task<(HttpClient Client, Guid Id)> User(string role = "user")
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        using var scope = Services.CreateScope();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        foreach (var name in new[] { "user", "admin", "test" })
            if (!await roles.RoleExistsAsync(name)) Assert.True((await roles.CreateAsync(new IdentityRole<Guid>(name))).Succeeded);
        var users = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser<Guid>>>();
        var id = Guid.NewGuid();
        var user = new IdentityUser<Guid> { Id = id, UserName = id + "@example.test", Email = id + "@example.test" };
        Assert.True((await users.CreateAsync(user, "TestingPassword123!")).Succeeded);
        Assert.True((await users.AddToRoleAsync(user, role)).Succeeded);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", scope.ServiceProvider.GetRequiredService<ITokenService>().CreateToken(user, new List<string> { role }));
        return (client, id);
    }
    public HttpClient Automation()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add("X-Automation-Key", "test-automation-key");
        return client;
    }
}
