using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using JobTracker.Api.Data;
using JobTracker.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<IAppStartTime, AppStartTime>();
builder.Services.AddSingleton<DemoSandboxStore>();
builder.Services.AddSingleton<DemoFileStore>();
builder.Services.AddScoped<ICurrentUserAccessor, CurrentUserAccessor>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<ISupabaseStorageService, SupabaseStorageService>();
builder.Services.AddScoped<ISkillResolver, SkillResolver>();
builder.Services.AddScoped<IFitScorer, FitScorer>();
builder.Services.AddScoped<IN8nHealthChecker, N8nHealthChecker>();
builder.Services.AddScoped<AutomationKeyFilter>();
builder.Services.AddScoped<AutomationService>();
builder.Services.AddScoped<AutomationDispatcher>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient("n8n", c => c.Timeout = TimeSpan.FromSeconds(20));

var connectionString = builder.Configuration.GetConnectionString("Default");
var testDatabase = builder.Environment.IsEnvironment("Testing") ? builder.Configuration["Testing:Database"] : null;
var testRoot = new Microsoft.EntityFrameworkCore.Storage.InMemoryDatabaseRoot();
builder.Services.AddDbContext<IdentityStoreContext>(options =>
{
    if (testDatabase != null) options.UseInMemoryDatabase(testDatabase, testRoot).EnableServiceProviderCaching(false);
    else options.UseNpgsql(connectionString);
});
builder.Services.AddDbContext<AppDbContext>((sp, options) =>
{
    var user = sp.GetRequiredService<IHttpContextAccessor>().HttpContext?.User;
    if (user?.IsInRole("test") == true)
    {
        var session = user.FindFirst("jti")?.Value ?? throw new InvalidOperationException("Demo session ID missing.");
        // Disposable sandbox roots must not accumulate in EF's process-wide provider cache.
        options.UseInMemoryDatabase("demo", sp.GetRequiredService<DemoSandboxStore>().GetRoot(session)).EnableServiceProviderCaching(false);
    }
    else if (testDatabase != null) options.UseInMemoryDatabase(testDatabase, testRoot).EnableServiceProviderCaching(false);
    else options.UseNpgsql(connectionString, o => o.UseVector());
});
builder.Services.AddIdentityCore<IdentityUser<Guid>>(options =>
{
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequireDigit = true;
    options.Password.RequiredLength = 10;
    options.User.RequireUniqueEmail = true;
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
}).AddRoles<IdentityRole<Guid>>().AddEntityFrameworkStores<IdentityStoreContext>().AddDefaultTokenProviders();

var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Configure Jwt:Key with at least 32 random bytes.");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidateAudience = false, ValidateLifetime = true, ValidateIssuerSigningKey = true,
        ClockSkew = TimeSpan.FromSeconds(30),
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
    };
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = async context =>
        {
            var manager = context.HttpContext.RequestServices.GetRequiredService<UserManager<IdentityUser<Guid>>>();
            var id = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = id is null ? null : await manager.FindByIdAsync(id);
            if (user is null || user.SecurityStamp != context.Principal?.FindFirstValue("security_stamp") || await manager.IsLockedOutAsync(user))
            { context.Fail("Session revoked."); return; }
            var roles = await manager.GetRolesAsync(user);
            var tokenRoles = context.Principal!.FindAll(ClaimTypes.Role).Select(c => c.Value).OrderBy(r => r);
            if (!roles.OrderBy(r => r).SequenceEqual(tokenRoles)) context.Fail("Role changed.");
        }
    };
});
builder.Services.AddAuthorization(options => options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddPolicy("Frontend", p => p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()));
builder.Services.Configure<ForwardedHeadersOptions>(o => o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);
if (!builder.Environment.IsEnvironment("Testing") && builder.Configuration.GetValue("Automation:WorkerEnabled", true))
    builder.Services.AddHostedService<AutomationWorker>();
var app = builder.Build();

if (!builder.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
    foreach (var role in new[] { "admin", "user", "test" })
        if (!await roles.RoleExistsAsync(role)) Ensure(await roles.CreateAsync(new IdentityRole<Guid>(role)));
    var users = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser<Guid>>>();
    foreach (var seed in new[] { (Section: "Bootstrap", Role: "admin"), (Section: "TestAccount", Role: "test") })
    {
        var email = app.Configuration[$"{seed.Section}:{(seed.Role == "admin" ? "AdminEmail" : "Email")}"];
        var password = app.Configuration[$"{seed.Section}:{(seed.Role == "admin" ? "AdminPassword" : "Password")}"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) continue;
        if (seed.Role == "admin" && (await users.GetUsersInRoleAsync("admin")).Count != 0) continue;
        if (await users.FindByEmailAsync(email) != null) continue;
        var user = new IdentityUser<Guid> { UserName = email, Email = email, EmailConfirmed = true };
        Ensure(await users.CreateAsync(user, password));
        Ensure(await users.AddToRoleAsync(user, seed.Role));
    }
}
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Request-Id"] = context.TraceIdentifier;
    try { await next(); }
    catch (DbUpdateConcurrencyException)
    { context.Response.StatusCode = 409; await context.Response.WriteAsJsonAsync(new { error = "This record changed. Reload before saving." }); }
    catch (Exception ex) when (ex is Npgsql.PostgresException { SqlState: "40001" or "40P01" or "23505" } || ex is DbUpdateException { InnerException: Npgsql.PostgresException { SqlState: "40001" or "40P01" or "23505" } })
    { context.Response.StatusCode = 409; await context.Response.WriteAsJsonAsync(new { error = "Concurrent update. Reload before retrying." }); }
    catch (Exception ex)
    {
        app.Logger.LogError("Request {RequestId} failed ({ExceptionType})", context.TraceIdentifier, ex.GetType().Name);
        if (!context.Response.HasStarted) { context.Response.StatusCode = 500; await context.Response.WriteAsJsonAsync(new { error = "Internal server error", requestId = context.TraceIdentifier }); }
    }
});
app.UseForwardedHeaders();
if (!app.Environment.IsEnvironment("Testing")) app.UseHttpsRedirection();
app.UseCors("Frontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
static void Ensure(IdentityResult result) { if (!result.Succeeded) throw new InvalidOperationException("Identity setup failed: " + string.Join(", ", result.Errors.Select(e => e.Code))); }
public partial class Program { }
