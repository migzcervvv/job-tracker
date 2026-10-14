using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using JobTracker.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace JobTracker.Api.Tests;
public class SecurityRegressionTests
{
    [Theory]
    [InlineData("GET", "/api/internal/reminders/stale")]
    [InlineData("GET", "/api/internal/reminders/deadlines")]
    [InlineData("GET", "/api/internal/digest/weekly")]
    [InlineData("POST", "/api/internal/notifications/claim")]
    [InlineData("POST", "/api/internal/notifications/complete")]
    [InlineData("POST", "/api/internal/runs/11111111-1111-1111-1111-111111111111/claim")]
    [InlineData("POST", "/api/internal/runs/11111111-1111-1111-1111-111111111111/state")]
    [InlineData("PUT", "/api/internal/applications/11111111-1111-1111-1111-111111111111/skills")]
    [InlineData("PUT", "/api/internal/applications/11111111-1111-1111-1111-111111111111/interview-questions")]
    [InlineData("PUT", "/api/internal/resumes/11111111-1111-1111-1111-111111111111/extraction")]
    public async Task EveryInternalActionRejectsAnonymousAndBrowserCredentials(string method, string path)
    {
        await using var factory = new ApiFactory();
        var anonymous = factory.CreateClient(); var (browser, _) = await factory.User();
        foreach (var client in new[] { anonymous, browser }) {
            using var request = new HttpRequestMessage(new HttpMethod(method), path);
            if (method != "GET") request.Content = JsonContent.Create(new { });
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);
        }
    }

    [Fact]
    public async Task FailedLoginsLockTheAccountAndRevokeItsExistingToken()
    {
        await using var factory = new ApiFactory(); var (user, id) = await factory.User();
        var login = factory.CreateClient();
        for (var attempt = 0; attempt < 5; attempt++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await login.PostAsJsonAsync("/api/auth/login", new { email = id + "@example.test", password = "IncorrectPassword123!" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await user.GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await login.PostAsJsonAsync("/api/auth/login", new { email = id + "@example.test", password = "TestingPassword123!" })).StatusCode);
    }

    [Fact]
    public async Task PasswordChangeRevokesOldTokenAndNewLoginReturnsImmutableAccountId()
    {
        await using var factory = new ApiFactory(); var (user, id) = await factory.User();
        (await user.PutAsJsonAsync("/api/me/password", new { currentPassword = "TestingPassword123!", newPassword = "ChangedPassword123!" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await user.GetAsync("/api/me")).StatusCode);
        var login = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new { email = id + "@example.test", password = "ChangedPassword123!" });
        login.EnsureSuccessStatusCode();
        var payload = await login.Content.ReadFromJsonAsync<JsonElement>(); Assert.Equal(id, payload.GetProperty("userId").GetGuid());
        using var scope = factory.Services.CreateScope();
        Assert.NotNull(await scope.ServiceProvider.GetRequiredService<IdentityStoreContext>().Users.SingleOrDefaultAsync(u => u.Id == id));
    }
}
