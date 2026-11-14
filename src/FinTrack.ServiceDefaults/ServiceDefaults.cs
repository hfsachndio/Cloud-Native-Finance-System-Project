using System.Text.Json.Serialization;
using FinTrack.Shared.Models;
using FinTrack.Shared.Storage;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
#if AZURE
using FinTrack.Infrastructure;
#endif

namespace FinTrack.ServiceDefaults;

public static class ServiceDefaults
{
    /// <summary>Shared setup for every microservice: storage, health checks, problem details.</summary>
    public static WebApplicationBuilder AddFinTrackDefaults(this WebApplicationBuilder builder)
    {
        var provider = builder.Configuration["Storage:Provider"] ?? "InMemory";
#if AZURE
        if (provider.Equals("Azure", StringComparison.OrdinalIgnoreCase))
            builder.Services.AddFinTrackAzureStorage(builder.Configuration);
        else
#endif
            builder.Services.AddFinTrackInMemoryStorage();

        builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
        builder.Services.AddHealthChecks();
        builder.Services.AddProblemDetails();
        return builder;
    }

    public static IServiceCollection AddFinTrackInMemoryStorage(this IServiceCollection services)
    {
        services.AddSingleton<IRepository<Account>, InMemoryRepository<Account>>();
        services.AddSingleton<IRepository<Transaction>, InMemoryRepository<Transaction>>();
        services.AddSingleton<IRepository<Budget>, InMemoryRepository<Budget>>();
        services.AddSingleton<IRepository<BudgetAlert>, InMemoryRepository<BudgetAlert>>();
        services.AddSingleton<IReceiptStore, InMemoryReceiptStore>();
        return services;
    }

    public static WebApplication MapFinTrackDefaults(this WebApplication app)
    {
        app.UseExceptionHandler();
        app.MapHealthChecks("/health");
        return app;
    }

    /// <summary>
    /// The gateway validates the user and forwards their id in X-User-Id.
    /// Services never trust a client-supplied id directly in production (gateway strips it).
    /// </summary>
    public static string UserId(this HttpContext ctx) =>
        ctx.Request.Headers.TryGetValue("X-User-Id", out var v) && !string.IsNullOrWhiteSpace(v) ? v.ToString() : "demo-user";

    public static bool IsInMemory(this IConfiguration config) =>
        !(config["Storage:Provider"] ?? "InMemory").Equals("Azure", StringComparison.OrdinalIgnoreCase);
}
