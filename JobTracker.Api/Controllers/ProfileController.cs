using System.Security.Claims;
using JobTracker.Api.Data;
using JobTracker.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace JobTracker.Api.Controllers;
[ApiController, Route("api/me"), Authorize]
public class ProfileController(UserManager<IdentityUser<Guid>> users, AppDbContext db) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet]
    public async Task<IActionResult> GetProfile()
    {
        var user = await users.FindByIdAsync(UserId.ToString());
        if (user == null) return NotFound();
        var roles = await users.GetRolesAsync(user);
        return Ok(new { user.Id, user.Email, role = roles.FirstOrDefault() ?? "user" });
    }
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile(UpdateProfileRequest req)
    {
        if (User.IsInRole("test")) return BadRequest("Shared demo account details cannot be changed.");
        if (!new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(req.Email)) return BadRequest("Enter a valid email address.");
        var user = await users.FindByIdAsync(UserId.ToString()); if (user == null) return NotFound();
        user.Email = req.Email.Trim(); user.UserName = user.Email;
        var result = await users.UpdateAsync(user);
        return result.Succeeded ? Ok(new { user.Email }) : BadRequest(result.Errors.Select(e => e.Description));
    }
    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req)
    {
        if (User.IsInRole("test")) return BadRequest("Shared demo account details cannot be changed.");
        var user = await users.FindByIdAsync(UserId.ToString()); if (user == null) return NotFound();
        var result = await users.ChangePasswordAsync(user, req.CurrentPassword, req.NewPassword);
        return result.Succeeded ? Ok(new { signInRequired = true }) : BadRequest(result.Errors.Select(e => e.Description));
    }
    [HttpGet("preferences")]
    public async Task<IActionResult> Preferences()
    {
        var profile = await db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == UserId);
        return Ok(new { remindersEnabled = profile?.RemindersEnabled ?? false, weeklyDigestEnabled = profile?.WeeklyDigestEnabled ?? false, timeZone = profile?.TimeZone ?? "UTC", deliveryChannel = "email" });
    }
    [HttpPut("preferences")]
    public async Task<IActionResult> Preferences(PreferencesRequest req)
    {
        try { TimeZoneInfo.FindSystemTimeZoneById(req.TimeZone); } catch { return BadRequest("Unknown timezone."); }
        var profile = await db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == UserId);
        if (profile == null) { profile = new UserProfile { UserId = UserId }; db.UserProfiles.Add(profile); }
        profile.RemindersEnabled = req.RemindersEnabled; profile.WeeklyDigestEnabled = req.WeeklyDigestEnabled; profile.TimeZone = req.TimeZone;
        await db.SaveChangesAsync(); return await Preferences();
    }
}
public record UpdateProfileRequest(string Email);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public record PreferencesRequest(bool RemindersEnabled, bool WeeklyDigestEnabled, string TimeZone);
