using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using JobTracker.Api.Services;
namespace JobTracker.Api.Tests;

public class ApplicationDuplicateTests
{
    [Fact] public void DescriptionScoreNormalizesFormattingButNeverMatchesMissingText()
    {
        Assert.Equal(100, ApplicationDuplicates.DescriptionSimilarity("Build Linux servers, deploy applications!", "build  linux servers deploy APPLICATIONS"));
        Assert.Null(ApplicationDuplicates.DescriptionSimilarity("", ""));
        Assert.Null(ApplicationDuplicates.DescriptionSimilarity(null, "Linux"));
        Assert.Equal(0, ApplicationDuplicates.DescriptionSimilarity("Build Linux servers", "Design retail advertising"));
        var original = string.Join(" ", Enumerable.Range(1, 100).Select(i => "requirement" + i));
        Assert.InRange(ApplicationDuplicates.DescriptionSimilarity(original, original.Replace("requirement50", "changed"))!.Value, 85, 99);
        Assert.Equal("acme corp", ApplicationDuplicates.Normalize("  ACME,  Corp. "));
    }
    [Fact] public async Task DuplicateCheckRequiresCompanyTitleAndThresholdAndSupportsExplicitOverride()
    {
        await using var factory = new ApiFactory(); var (user, _) = await factory.User();
        var requestId = Guid.NewGuid();
        var original = new { title = "Platform Engineer", company = "Acme", rawDescription = "Build Linux servers and deploy reliable applications with Terraform", requestId };
        var first = await user.PostAsJsonAsync("/api/applications", original); first.EnsureSuccessStatusCode();
        var body = await first.Content.ReadFromJsonAsync<JsonElement>();
        var duplicate = await user.PostAsJsonAsync("/api/applications", new { title = " platform engineer ", company = "ACME!", rawDescription = original.rawDescription });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        var warning = await duplicate.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("application_duplicate", warning.GetProperty("code").GetString());
        Assert.Equal(100, warning.GetProperty("matches")[0].GetProperty("descriptionSimilarity").GetInt32());
        Assert.Equal(body.GetProperty("application").GetProperty("id").GetGuid(), warning.GetProperty("matches")[0].GetProperty("id").GetGuid());
        // A repeated transport request stays idempotent rather than reporting a content duplicate.
        var replay = await user.PostAsJsonAsync("/api/applications", original); replay.EnsureSuccessStatusCode();
        Assert.True((await replay.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("wasDuplicate").GetBoolean());
        (await user.PostAsJsonAsync("/api/applications", new { original.title, original.company, original.rawDescription, allowDuplicate = true })).EnsureSuccessStatusCode();
        (await user.PostAsJsonAsync("/api/applications", new { original.title, original.company, rawDescription = "Design retail advertising for print media" })).EnsureSuccessStatusCode();
        (await user.PostAsJsonAsync("/api/applications", new { original.title, company = "Another Company", original.rawDescription })).EnsureSuccessStatusCode();
        (await user.PostAsJsonAsync("/api/applications", new { title = "Different Role", original.company, original.rawDescription })).EnsureSuccessStatusCode();
        var (other, _) = await factory.User();
        (await other.PostAsJsonAsync("/api/applications", new { original.title, original.company, original.rawDescription })).EnsureSuccessStatusCode();
    }
    [Fact] public async Task MissingDescriptionsDoNotBlockRepeatedCompanyAndTitle()
    {
        await using var factory = new ApiFactory(); var (user, _) = await factory.User();
        for (var i = 0; i < 2; i++) (await user.PostAsJsonAsync("/api/applications", new { title = "Engineer", company = "Acme", rawDescription = "" })).EnsureSuccessStatusCode();
    }
}
