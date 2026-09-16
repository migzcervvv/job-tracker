using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Pgvector;

#nullable disable

namespace JobTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFitScoreInfrastructure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:vector", ",,");

            migrationBuilder.AddColumn<double>(
                name: "EvidenceStrength",
                table: "UserSkills",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<string>(
                name: "EvidenceText",
                table: "UserSkills",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Importance",
                table: "ApplicationSkills",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "EducationRequirement",
                table: "Applications",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Vector>(
                name: "JobEmbedding",
                table: "Applications",
                type: "vector(1536)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RequiredExperienceYears",
                table: "Applications",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SeniorityLevel",
                table: "Applications",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "UserProfiles",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExperienceYears = table.Column<int>(type: "integer", nullable: false),
                    SeniorityLevel = table.Column<int>(type: "integer", nullable: true),
                    Education = table.Column<string>(type: "text", nullable: true),
                    ResumeRawText = table.Column<string>(type: "text", nullable: true),
                    ResumeEmbedding = table.Column<Vector>(type: "vector(1536)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserProfiles", x => x.UserId);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "EvidenceStrength",
                table: "UserSkills");

            migrationBuilder.DropColumn(
                name: "EvidenceText",
                table: "UserSkills");

            migrationBuilder.DropColumn(
                name: "Importance",
                table: "ApplicationSkills");

            migrationBuilder.DropColumn(
                name: "EducationRequirement",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "JobEmbedding",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "RequiredExperienceYears",
                table: "Applications");

            migrationBuilder.DropColumn(
                name: "SeniorityLevel",
                table: "Applications");

            migrationBuilder.AlterDatabase()
                .OldAnnotation("Npgsql:PostgresExtension:vector", ",,");
        }
    }
}
