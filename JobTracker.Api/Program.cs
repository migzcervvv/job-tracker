using JobTracker.Api.Data;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
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
builder.Services.AddScoped<IFitScorer, FitScorer>();   // new
builder.Services.AddHttpClient();
builder.Services.AddHttpClient("n8n");

var connectionString = builder.Configuration.GetConnectionString("Default");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        connectionString,
        o =>
        {
            o.UseVector(); // This line will work if the correct package is installed.
        }
    )
);

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
    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
    foreach (var role in new[] { "admin", "user" })
    {
        if (!await roleManager.RoleExistsAsync(role))
            await roleManager.CreateAsync(new IdentityRole<Guid>(role));
    }
}

using (var scope = app.Services.CreateScope())
{
    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
    foreach (var role in new[] { "admin", "user" })
    {
        if (!await roleManager.RoleExistsAsync(role))
            await roleManager.CreateAsync(new IdentityRole<Guid>(role));
    }

    // Bootstrap: only fires if literally no admin exists yet — safe to leave
    // in permanently, since it's a no-op once you have at least one.
    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser<Guid>>>();
    var existingAdmins = await userManager.GetUsersInRoleAsync("admin");

    if (existingAdmins.Count == 0)
    {
        var bootstrapEmail = app.Configuration["Bootstrap:AdminEmail"];
        var bootstrapPassword = app.Configuration["Bootstrap:AdminPassword"];

        if (!string.IsNullOrEmpty(bootstrapEmail) && !string.IsNullOrEmpty(bootstrapPassword))
        {
            var user = await userManager.FindByEmailAsync(bootstrapEmail);
            if (user is null)
            {
                user = new IdentityUser<Guid> { UserName = bootstrapEmail, Email = bootstrapEmail };
                var result = await userManager.CreateAsync(user, bootstrapPassword);
                if (result.Succeeded)
                    await userManager.AddToRoleAsync(user, "admin");
            }
            else
            {
                // Account already exists (e.g. from before registration closed) — promote it, don't error.
                await userManager.AddToRoleAsync(user, "admin");
            }
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