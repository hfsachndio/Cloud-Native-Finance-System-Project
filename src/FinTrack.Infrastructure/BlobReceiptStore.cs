using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using FinTrack.Shared.Storage;

namespace FinTrack.Infrastructure;

/// <summary>Stores receipt files in a private Blob Storage container. Uploads trigger the ProcessReceipt function.</summary>
public sealed class BlobReceiptStore : IReceiptStore
{
    private readonly BlobContainerClient _container;

    public BlobReceiptStore(BlobServiceClient client, string containerName)
    {
        _container = client.GetBlobContainerClient(containerName);
        _container.CreateIfNotExists(PublicAccessType.None);
    }

    public async Task<string> SaveAsync(string userId, string fileName, Stream content, string contentType, CancellationToken ct = default)
    {
        var name = $"{userId}/{Guid.NewGuid():n}-{Path.GetFileName(fileName)}";
        var blob = _container.GetBlobClient(name);
        await blob.UploadAsync(content, new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } }, ct);
        return name;
    }
}
