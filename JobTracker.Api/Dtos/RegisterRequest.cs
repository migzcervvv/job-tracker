namespace JobTracker.Api.Dtos;

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);
public record AuthResponse(string Token, string Email, string Role);