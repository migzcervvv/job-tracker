using JobTracker.Api.Data;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpContextAccessor();

builder.Services.AddSingleton<IAppStartTime, AppStartTime>();
builder.Services.AddScoped<ICurrentUserAccessor, CurrentUserAccessor>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<ISupabaseStorageService, SupabaseStorageService>();
builder.Services.AddScoped<ISkillResolver, SkillResolver>();
builder.Services.AddScoped<IFitScorer, FitScorer>();
builder.Services.AddScoped<IN8nHealthChecker, N8nHealthChecker>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient("n8n");

var connectionString = builder.Configuration.GetConnectionString("Default");
builder.Services.AddDbContext<AppDbContext>((sp, options) =>
{
    var httpContextAccessor = sp.GetService<IHttpContextAccessor>();
    var user = httpContextAccessor?.HttpContext?.User;
    var isTestUser = user?.IsInRole("test") ?? false;

    if (isTestUser)
    {
        // Keyed by jti (unique per login), not by user id — two people
        // logging in with the same shared test credentials get separate
        // sandboxes. A missing jti (shouldn't happen post-login, but covers
        // any token minted before this claim existed) falls back to a
        // single shared sandbox rather than throwing.
        var sessionId = user!.FindFirst(JwtRegisteredClaimNames.Jti)?.Value ?? "shared";
        options.UseInMemoryDatabase($"TestSandbox:{sessionId}");
    }
    else
    {
        options.UseNpgsql(
        connectionString,
        o =>
        {
            o.UseVector();
        }
        );
    }
});

builder.Services
    .AddIdentity<IdentityUser<Guid>, IdentityRole<Guid>>(options =>
    {
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequireDigit = true;
        options.Password.RequiredLength = 8;
        options.User.RequireUniqueEmail = true;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!)),
        };
    });

builder.Services.AddAuthorization();

var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>();

if (corsOrigins is null || corsOrigins.Length == 0)
    throw new InvalidOperationException("Cors:Origins is not configured.");

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
        policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod());
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor |
        ForwardedHeaders.XForwardedProto;
});
var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;

    // --- Roles ---
    var roleManager = services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
    foreach (var role in new[] { "admin", "user", "test" })
    {
        if (!await roleManager.RoleExistsAsync(role))
            await roleManager.CreateAsync(new IdentityRole<Guid>(role));
    }

    var userManager = services.GetRequiredService<UserManager<IdentityUser<Guid>>>();

    // --- Admin bootstrap: only fires if literally no admin exists yet — safe to
    // leave in permanently, since it's a no-op once you have at least one. ---
    var existingAdmins = await userManager.GetUsersInRoleAsync("admin");
    if (existingAdmins.Count == 0)
    {
        var bootstrapEmail = app.Configuration["Bootstrap:AdminEmail"];
        var bootstrapPassword = app.Configuration["Bootstrap:AdminPassword"];

        if (!string.IsNullOrEmpty(bootstrapEmail) && !string.IsNullOrEmpty(bootstrapPassword))
        {
            var admin = await userManager.FindByEmailAsync(bootstrapEmail);
            if (admin is null)
            {
                admin = new IdentityUser<Guid> { UserName = bootstrapEmail, Email = bootstrapEmail };
                var result = await userManager.CreateAsync(admin, bootstrapPassword);
                if (result.Succeeded)
                    await userManager.AddToRoleAsync(admin, "admin");
            }
            else
            {
                // Account already exists (e.g. from before registration closed) — promote it, don't error.
                await userManager.AddToRoleAsync(admin, "admin");
            }
        }
    }

    // --- Test account: seeds the shared test login into the REAL database (the
    // account record itself, not usage data). Runs with no HttpContext, so the
    // DbContext above resolves the real Npgsql provider here regardless of the
    // request-time switch logic. ---
    var testEmail = app.Configuration["TestAccount:Email"];
    var testPassword = app.Configuration["TestAccount:Password"];
    if (!string.IsNullOrWhiteSpace(testEmail) && !string.IsNullOrWhiteSpace(testPassword))
    {
        var testUser = await userManager.FindByEmailAsync(testEmail);
        if (testUser is null)
        {
            testUser = new IdentityUser<Guid>
            {
                UserName = testEmail,
                Email = testEmail,
                EmailConfirmed = true,
            };
            var result = await userManager.CreateAsync(testUser, testPassword);
            if (result.Succeeded)
                await userManager.AddToRoleAsync(testUser, "test");
        }
        else if (!await userManager.IsInRoleAsync(testUser, "test"))
        {
            await userManager.AddToRoleAsync(testUser, "test");
        }
    }
}
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex)
    {
        Console.WriteLine(ex);
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(
            System.Text.Json.JsonSerializer.Serialize(new { error = "Internal server error" }));
    }
});

app.UseForwardedHeaders();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    await next();
});

app.UseHttpsRedirection();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();