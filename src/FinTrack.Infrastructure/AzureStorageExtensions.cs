using System.Text.Json;
using System.Text.Json.Serialization;
using Azure.Identity;
using Azure.Storage.Blobs;
using FinTrack.Shared.Models;
using FinTrack.Shared.Storage;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace FinTrack.Infrastructure;

public static class AzureStorageExtensions
{
    /// <summary>
    /// Registers Cosmos DB and Blob Storage. Uses connection strings when present (local emulators),
    /// otherwise the app's managed identity (Azure App Service).
    /// </summary>
    public static IServiceCollection AddFinTrackAzureStorage(this IServiceCollection services, IConfiguration config)
    {
        var database = config["Cosmos:Database"] ?? "fintrack";
        services.AddSingleton(_ =>
        {
            // System.Text.Json so DateOnly and string enums round-trip the same way as the HTTP APIs.
            var options = new CosmosClientOptions
            {
                UseSystemTextJsonSerializerWithOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
                {
                    Converters = { new JsonStringEnumConverter() },
                },
            };
            var cs = config["Cosmos:ConnectionString"];
            return string.IsNullOrEmpty(cs)
                ? new CosmosClient(config["Cosmos:Endpoint"], new DefaultAzureCredential(), options)
                : new CosmosClient(cs, options);
        });
        services.AddSingleton<IRepository<Account>>(sp => new CosmosRepository<Account>(sp.GetRequiredService<CosmosClient>(), database, "accounts"));
        services.AddSingleton<IRepository<Transaction>>(sp => new CosmosRepository<Transaction>(sp.GetRequiredService<CosmosClient>(), database, "transactions"));
        services.AddSingleton<IRepository<Budget>>(sp => new CosmosRepository<Budget>(sp.GetRequiredService<CosmosClient>(), database, "budgets"));
        services.AddSingleton<IRepository<BudgetAlert>>(sp => new CosmosRepository<BudgetAlert>(sp.GetRequiredService<CosmosClient>(), database, "alerts"));

        services.AddSingleton(_ =>
        {
            var cs = config["Storage:ConnectionString"];
            return string.IsNullOrEmpty(cs)
                ? new BlobServiceClient(new Uri(config["Storage:BlobEndpoint"]!), new DefaultAzureCredential())
                : new BlobServiceClient(cs);
        });
        services.AddSingleton<IReceiptStore>(sp => new BlobReceiptStore(sp.GetRequiredService<BlobServiceClient>(), config["Storage:ReceiptsContainer"] ?? "receipts"));
        return services;
    }
}
