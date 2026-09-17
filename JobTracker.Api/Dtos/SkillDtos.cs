namespace JobTracker.Api.Dtos;

public record UserSkillDto(string Name, int Level);
public record SetSkillLevelRequest(string Name, int Level);