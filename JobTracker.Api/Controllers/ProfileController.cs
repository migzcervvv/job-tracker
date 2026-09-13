// Controllers/ProfileController.cs
using System.Security.Claims;
using JobTracker.Api.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace JobTracker.Api.Controllers;

[ApiController]
[Route("api/me")]
[Authorize]
public class ProfileController(UserManager<IdentityUser<Guid>> users) : ControllerBase
{
    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<IActionResult> GetProfile()
    {
        var user = await users.FindByIdAsync(CurrentUserId.ToString());
        if (user is null) return NotFound();
        var roles = await users.GetRolesAsync(user);
        return Ok(new { user.Id, user.Email, role = roles.FirstOrDefault() ?? "user" });
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest req)
    {
        var user = await users.FindByIdAsync(CurrentUserId.ToString());
        if (user is null) return NotFound();

        user.Email = req.Email;
        user.UserName = req.Email;
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded) return BadRequest(result.Errors.Select(e => e.Description));

        return Ok(new { user.Email });
    }

    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
    {
        var user = await users.FindByIdAsync(CurrentUserId.ToString());
        if (user is null) return NotFound();

        var result = await users.ChangePasswordAsync(user, req.CurrentPassword, req.NewPassword);
        if (!result.Succeeded) return BadRequest(result.Errors.Select(e => e.Description));

        return Ok();
    }
}

public record UpdateProfileRequest(string Email);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);