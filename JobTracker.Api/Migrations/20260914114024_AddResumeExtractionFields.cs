using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JobTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddResumeExtractionFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExtractionStatus",
                table: "Resumes",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProposedSkillsJson",
                table: "Resumes",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExtractionStatus",
                table: "Resumes");

            migrationBuilder.DropColumn(
                name: "ProposedSkillsJson",
                table: "Resumes");
        }
    }
}
