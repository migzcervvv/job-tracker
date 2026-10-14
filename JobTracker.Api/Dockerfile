FROM mcr.microsoft.com/dotnet/sdk:8.0.425 AS build
WORKDIR /src
COPY global.json .
COPY JobTracker.Api/JobTracker.Api.csproj JobTracker.Api/
RUN dotnet restore JobTracker.Api/JobTracker.Api.csproj
COPY JobTracker.Api/ JobTracker.Api/
RUN dotnet publish JobTracker.Api/JobTracker.Api.csproj -c Release --no-restore -o /app/publish /p:UseAppHost=false

FROM build AS migrate
WORKDIR /src/JobTracker.Api
RUN dotnet tool restore
ENTRYPOINT ["dotnet", "ef", "database", "update", "--context", "AppDbContext"]

FROM mcr.microsoft.com/dotnet/aspnet:8.0.31 AS final
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
COPY --from=build /app/publish .
USER $APP_UID
ENTRYPOINT ["dotnet", "JobTracker.Api.dll"]
