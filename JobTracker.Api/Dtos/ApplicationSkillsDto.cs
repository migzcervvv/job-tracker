namespace JobTracker.Api.Dtos;
public class SkillImportanceDto
{
    public string Name { get; set; } = "";
    public int Importance { get; set; } // 3 required, 2 preferred, 1 nice to have
}
