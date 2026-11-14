namespace FinTrack.Shared.Models;

public enum TransactionStatus { Pending, Processing, Completed, NeedsReview }
public enum TransactionType { Income, Expense, Transfer }

public interface IEntity
{
    string Id { get; set; }
    /// <summary>Cosmos DB partition key. Every document is partitioned by user.</summary>
    string UserId { get; set; }
}

public sealed class Account : IEntity
{
    public string Id { get; set; } = Guid.NewGuid().ToString("n");
    public string UserId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "Checking";      // Checking, Savings, CreditCard, Cash
    public string Mask { get; set; } = "";              // last 4 digits shown in the UI
    public decimal Balance { get; set; }
    public string Currency { get; set; } = "USD";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Transaction : IEntity
{
    public string Id { get; set; } = Guid.NewGuid().ToString("n");
    public string UserId { get; set; } = "";
    public string AccountId { get; set; } = "";
    public string Description { get; set; } = "";
    public string Category { get; set; } = "Uncategorised";
    public TransactionType Type { get; set; } = TransactionType.Expense;
    /// <summary>Signed amount: positive for income, negative for spending.</summary>
    public decimal Amount { get; set; }
    public DateOnly Date { get; set; } = DateOnly.FromDateTime(DateTime.UtcNow);
    public TransactionStatus Status { get; set; } = TransactionStatus.Pending;
    public string? ReceiptBlob { get; set; }
    public decimal? ReceiptTotal { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Budget : IEntity
{
    public string Id { get; set; } = Guid.NewGuid().ToString("n");
    public string UserId { get; set; } = "";
    public string Category { get; set; } = "";
    /// <summary>Month in yyyy-MM format.</summary>
    public string Month { get; set; } = DateTime.UtcNow.ToString("yyyy-MM");
    public decimal Limit { get; set; }
    public decimal AlertThreshold { get; set; } = 0.9m;
}

public sealed class BudgetAlert : IEntity
{
    public string Id { get; set; } = Guid.NewGuid().ToString("n");
    public string UserId { get; set; } = "";
    public string Category { get; set; } = "";
    public string Month { get; set; } = "";
    public decimal Spent { get; set; }
    public decimal Limit { get; set; }
    public string Message { get; set; } = "";
    public DateTimeOffset RaisedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed record CreateTransactionRequest(string AccountId, string Description, decimal Amount, DateOnly? Date, string? Category);
public sealed record CreateBudgetRequest(string Category, decimal Limit, string? Month, decimal? AlertThreshold);
public sealed record CreateAccountRequest(string Name, string Kind, string Mask, decimal OpeningBalance, string? Currency);
public sealed record BudgetProgress(string Category, string Month, decimal Limit, decimal Spent, decimal Remaining, decimal Percent, bool OverThreshold);
