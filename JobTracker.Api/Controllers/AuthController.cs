using JobTracker.Api.Dtos;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace JobTracker.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(UserManager<IdentityUser<Guid>> users, ITokenService tokens) : ControllerBase
{
    //[HttpPost("register")]
    //public async Task<ActionResult<AuthResponse>> Register(RegisterRequest req)
    //{
    //    var user = new IdentityUser<Guid> { UserName = req.Email, Email = req.Email };
    //    var result = await users.CreateAsync(user, req.Password);
    //    if (!result.Succeeded)
    //        return BadRequest(result.Errors.Select(e => e.Description));

    //    await users.AddToRoleAsync(user, "user");
    //    var roles = await users.GetRolesAsync(user);
    //    var token = tokens.CreateToken(user, roles);
    //    return Ok(new AuthResponse(token, user.Email!, roles.FirstOrDefault() ?? "user"));
    //}

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest req)
    {
        var user = await users.FindByEmailAsync(req.Email);
        if (user is null || !await users.CheckPasswordAsync(user, req.Password))
            return Unauthorized("Invalid email or password");

        var roles = await users.GetRolesAsync(user);
        var token = tokens.CreateToken(user, roles);
        return Ok(new AuthResponse(token, user.Email!, roles.FirstOrDefault() ?? "user"));
    }
}