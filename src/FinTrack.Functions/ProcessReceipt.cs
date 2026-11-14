using System.Text;
using FinTrack.Shared.Domain;
using FinTrack.Shared.Models;
using FinTrack.Shared.Storage;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace FinTrack.Functions;

/// <summary>
/// Runs whenever a receipt lands in Blob Storage (receipts/{userId}/{file}).
/// Reads the total from the receipt text, matches it to the transaction and marks it Completed,
/// or NeedsReview when the receipt total and the transaction amount don't agree.
/// </summary>
public sealed class ProcessReceipt(IRepository<Transaction> transactions, ILogger<ProcessReceipt> log)
{
    [Function(nameof(ProcessReceipt))]
    public async Task Run(
        [BlobTrigger("receipts/{userId}/{name}", Connection = "Storage")] byte[] content,
        string userId, string name, CancellationToken ct)
    {
        var blobPath = $"{userId}/{name}";
        var tx = (await transactions.ListAsync(userId, t => t.ReceiptBlob == blobPath, ct)).FirstOrDefault();
        if (tx is null)
        {
            log.LogWarning("No transaction references receipt {Blob}", blobPath);
            return;
        }

        // Text receipts are parsed directly. Images and PDFs would go through
        // Azure AI Document Intelligence first; its text output uses the same parser.
        var text = Encoding.UTF8.GetString(content);
        var total = ReceiptParser.FindTotal(text);
        tx.ReceiptTotal = total;
        tx.Status = total is not null && Math.Abs(total.Value - Math.Abs(tx.Amount)) <= 0.01m
            ? TransactionStatus.Completed
            : TransactionStatus.NeedsReview;

        await transactions.UpsertAsync(tx, ct);
        log.LogInformation("Receipt {Blob}: total {Total}, transaction {Id} -> {Status}", blobPath, total, tx.Id, tx.Status);
    }
}
