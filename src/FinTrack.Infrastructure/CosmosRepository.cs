using FinTrack.Shared.Models;
using FinTrack.Shared.Storage;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Cosmos.Linq;

namespace FinTrack.Infrastructure;

/// <summary>Cosmos DB repository. One container per entity type, partitioned by /userId.</summary>
public sealed class CosmosRepository<T> : IRepository<T> where T : class, IEntity
{
    private readonly Container _container;

    public CosmosRepository(CosmosClient client, string database, string container) =>
        _container = client.GetContainer(database, container);

    public async Task<T?> GetAsync(string userId, string id, CancellationToken ct = default)
    {
        try
        {
            var response = await _container.ReadItemAsync<T>(id, new PartitionKey(userId), cancellationToken: ct);
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<IReadOnlyList<T>> ListAsync(string userId, Func<T, bool>? filter = null, CancellationToken ct = default)
    {
        var query = _container.GetItemLinqQueryable<T>(requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(userId) })
                              .ToFeedIterator();
        var results = new List<T>();
        while (query.HasMoreResults)
        {
            foreach (var item in await query.ReadNextAsync(ct))
            {
                if (filter is null || filter(item)) results.Add(item);
            }
        }
        return results;
    }

    public async Task<T> UpsertAsync(T item, CancellationToken ct = default) =>
        (await _container.UpsertItemAsync(item, new PartitionKey(item.UserId), cancellationToken: ct)).Resource;

    public async Task<bool> DeleteAsync(string userId, string id, CancellationToken ct = default)
    {
        try
        {
            await _container.DeleteItemAsync<T>(id, new PartitionKey(userId), cancellationToken: ct);
            return true;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }
}
