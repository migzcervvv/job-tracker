namespace JobTracker.Api.Dtos;

public record RegisterRequestDto(string Email, string Password);
public record LoginRequest(string Email, string Password);
public record AuthResponse(string Token, string Email, string Role);