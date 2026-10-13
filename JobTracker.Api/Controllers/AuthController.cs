using JobTracker.Api.Dtos;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
namespace JobTracker.Api.Controllers;
[ApiController, Route("api/auth")]
public class AuthController(UserManager<IdentityUser<Guid>> users, ITokenService tokens) : ControllerBase
{
    [AllowAnonymous, EnableRateLimiting("login"), HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var user = await users.FindByEmailAsync(req.Email);
        if (user is null || await users.IsLockedOutAsync(user)) return Unauthorized("Invalid email or password");
        if (!await users.CheckPasswordAsync(user, req.Password))
        { await users.AccessFailedAsync(user); return Unauthorized("Invalid email or password"); }
        await users.ResetAccessFailedCountAsync(user);
        var roles = await users.GetRolesAsync(user);
        return Ok(new { token = tokens.CreateToken(user, roles), userId = user.Id, email = user.Email, role = roles.FirstOrDefault() ?? "user" });
    }
}
