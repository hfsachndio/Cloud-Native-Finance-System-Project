using System.Collections.Concurrent;
using FinTrack.Shared.Models;

namespace FinTrack.Shared.Storage;

/// <summary>Storage abstraction. Azure uses Cosmos DB; local development uses memory.</summary>
public interface IRepository<T> where T : class, IEntity
{
    Task<T?> GetAsync(string userId, string id, CancellationToken ct = default);
    Task<IReadOnlyList<T>> ListAsync(string userId, Func<T, bool>? filter = null, CancellationToken ct = default);
    Task<T> UpsertAsync(T item, CancellationToken ct = default);
    Task<bool> DeleteAsync(string userId, string id, CancellationToken ct = default);
}

public sealed class InMemoryRepository<T> : IRepository<T> where T : class, IEntity
{
    private readonly ConcurrentDictionary<(string, string), T> _items = new();

    public Task<T?> GetAsync(string userId, string id, CancellationToken ct = default) =>
        Task.FromResult(_items.TryGetValue((userId, id), out var v) ? v : null);

    public Task<IReadOnlyList<T>> ListAsync(string userId, Func<T, bool>? filter = null, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<T>>(_items.Values.Where(i => i.UserId == userId && (filter?.Invoke(i) ?? true)).ToList());

    public Task<T> UpsertAsync(T item, CancellationToken ct = default)
    {
        _items[(item.UserId, item.Id)] = item;
        return Task.FromResult(item);
    }

    public Task<bool> DeleteAsync(string userId, string id, CancellationToken ct = default) =>
        Task.FromResult(_items.TryRemove((userId, id), out _));
}

/// <summary>Receipt file storage. Azure uses Blob Storage; local development uses memory.</summary>
public interface IReceiptStore
{
    Task<string> SaveAsync(string userId, string fileName, Stream content, string contentType, CancellationToken ct = default);
}

public sealed class InMemoryReceiptStore : IReceiptStore
{
    private readonly ConcurrentDictionary<string, byte[]> _files = new();

    public async Task<string> SaveAsync(string userId, string fileName, Stream content, string contentType, CancellationToken ct = default)
    {
        using var ms = new MemoryStream();
        await content.CopyToAsync(ms, ct);
        var name = $"{userId}/{Guid.NewGuid():n}-{Path.GetFileName(fileName)}";
        _files[name] = ms.ToArray();
        return name;
    }
}
