namespace JobTracker.Api.Dtos;

public class UpdateApplicationSkillsRequest
{
    public List<SkillImportanceDto> Skills { get; set; } = new();
}

public class SkillImportanceDto
{
    public string Name { get; set; } = string.Empty; // .net / c# / react / sql / etc
    public int Importance { get; set; } // 3 = required, 2 = preferred, 1 = nice_to_have
}
