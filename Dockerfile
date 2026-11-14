# One Dockerfile for every service:  docker build --build-arg PROJECT=FinTrack.Accounts .
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG PROJECT=FinTrack.Gateway
WORKDIR /src
COPY . .
RUN dotnet publish src/${PROJECT}/${PROJECT}.csproj -c Release -o /app -p:UseAzure=true

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ARG PROJECT=FinTrack.Gateway
ENV ENTRY=${PROJECT}.dll
ENTRYPOINT ["sh", "-c", "dotnet $ENTRY"]
