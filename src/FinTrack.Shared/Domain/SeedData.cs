using FinTrack.Shared.Models;

namespace FinTrack.Shared.Domain;

/// <summary>Sample data for local development so every screen has something to show.</summary>
public static class SeedData
{
    public const string DemoUser = "demo-user";

    public static IEnumerable<Account> Accounts() => new[]
    {
        new Account { Id = "acc-checking", UserId = DemoUser, Name = "Main checking", Kind = "Checking", Mask = "4471", Balance = 8240.50m },
        new Account { Id = "acc-savings", UserId = DemoUser, Name = "Savings", Kind = "Savings", Mask = "0921", Balance = 3600.00m },
        new Account { Id = "acc-card", UserId = DemoUser, Name = "Credit card", Kind = "CreditCard", Mask = "2210", Balance = -412.30m },
        new Account { Id = "acc-cash", UserId = DemoUser, Name = "Cash wallet", Kind = "Cash", Mask = "", Balance = 1052.30m },
    };

    public static IEnumerable<Transaction> Transactions(DateOnly today)
    {
        var rows = new (string Desc, decimal Amount, int DaysAgo, TransactionStatus Status, string? Receipt)[]
        {
            ("Salary deposit", 3200.00m, 1, TransactionStatus.Completed, null),
            ("Supermarket", -86.40m, 1, TransactionStatus.Processing, "receipt.pdf"),
            ("Electricity bill", -64.10m, 2, TransactionStatus.Completed, "bill.png"),
            ("Ride share", -12.75m, 3, TransactionStatus.Completed, null),
            ("Freelance payment", 450.00m, 4, TransactionStatus.Completed, "invoice.pdf"),
            ("Pharmacy", -23.90m, 5, TransactionStatus.Completed, "rx.jpg"),
            ("Cinema tickets", -28.00m, 6, TransactionStatus.Completed, null),
            ("Online order", -142.35m, 7, TransactionStatus.NeedsReview, "order.pdf"),
            ("Restaurant", -54.20m, 8, TransactionStatus.Completed, "bill.jpg"),
            ("Internet bill", -39.99m, 9, TransactionStatus.Completed, null),
        };
        foreach (var r in rows)
        {
            yield return new Transaction
            {
                UserId = DemoUser, AccountId = "acc-checking", Description = r.Desc, Amount = r.Amount,
                Category = Categorizer.Categorise(r.Desc, r.Amount), Type = r.Amount > 0 ? TransactionType.Income : TransactionType.Expense,
                Date = today.AddDays(-r.DaysAgo), Status = r.Status, ReceiptBlob = r.Receipt,
            };
        }
        // Six months of history for the cash-flow chart.
        var rnd = new Random(42);
        for (var m = 1; m <= 5; m++)
        {
            var d = today.AddMonths(-m);
            yield return new Transaction { UserId = DemoUser, Description = "Salary deposit", Amount = 3200m, Category = "Income", Type = TransactionType.Income, Date = d, Status = TransactionStatus.Completed };
            foreach (var cat in new[] { "Groceries", "Bills", "Transport", "Dining", "Shopping" })
            {
                yield return new Transaction
                {
                    UserId = DemoUser, Description = $"{cat} spending", Amount = -Math.Round((decimal)(rnd.NextDouble() * 300 + 80), 2),
                    Category = cat, Type = TransactionType.Expense, Date = d, Status = TransactionStatus.Completed,
                };
            }
        }
    }

    public static IEnumerable<Budget> Budgets(string month) => new[]
    {
        new Budget { UserId = DemoUser, Category = "Groceries", Month = month, Limit = 450 },
        new Budget { UserId = DemoUser, Category = "Transport", Month = month, Limit = 200 },
        new Budget { UserId = DemoUser, Category = "Bills", Month = month, Limit = 450 },
        new Budget { UserId = DemoUser, Category = "Dining", Month = month, Limit = 200 },
        new Budget { UserId = DemoUser, Category = "Entertainment", Month = month, Limit = 150 },
        new Budget { UserId = DemoUser, Category = "Health", Month = month, Limit = 120 },
    };
}
