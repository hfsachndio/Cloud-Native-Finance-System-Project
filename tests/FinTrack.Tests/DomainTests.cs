using FinTrack.Shared.Domain;
using FinTrack.Shared.Models;
using FinTrack.Shared.Storage;
using Xunit;

namespace FinTrack.Tests;

public class CategorizerTests
{
    [Theory]
    [InlineData("Salary deposit", 3200, "Income")]
    [InlineData("Supermarket", -86.40, "Groceries")]
    [InlineData("Electricity bill", -64.10, "Bills")]
    [InlineData("Careem ride to office", -9.50, "Transport")]
    [InlineData("Pharmacy", -23.90, "Health")]
    [InlineData("Something odd", -5, "Uncategorised")]
    [InlineData("Unknown deposit", 50, "Income")]
    public void Categorises_by_keyword(string description, decimal amount, string expected) =>
        Assert.Equal(expected, Categorizer.Categorise(description, amount));
}

public class BudgetCalculatorTests
{
    private static Transaction Tx(string category, decimal amount, string date) =>
        new() { UserId = "u", Category = category, Amount = amount, Date = DateOnly.Parse(date) };

    [Fact]
    public void Counts_only_expenses_in_the_same_category_and_month()
    {
        var txs = new[]
        {
            Tx("Dining", -100, "2026-11-02"),
            Tx("Dining", -82, "2026-11-20"),
            Tx("Dining", -50, "2026-10-30"),    // other month
            Tx("Groceries", -40, "2026-11-05"), // other category
            Tx("Dining", 20, "2026-11-06"),     // refund, not spending
        };
        var budget = new Budget { UserId = "u", Category = "Dining", Month = "2026-11", Limit = 200 };

        var p = BudgetCalculator.Progress(budget, txs);

        Assert.Equal(182, p.Spent);
        Assert.Equal(18, p.Remaining);
        Assert.Equal(91.0m, p.Percent);
        Assert.True(p.OverThreshold);
    }

    [Fact]
    public void Remaining_never_goes_negative() =>
        Assert.Equal(0, BudgetCalculator.Progress(
            new Budget { UserId = "u", Category = "Bills", Month = "2026-11", Limit = 50 },
            new[] { Tx("Bills", -80, "2026-11-01") }).Remaining);
}

public class ReceiptParserTests
{
    [Fact]
    public void Prefers_grand_total_over_subtotal()
    {
        const string text = "FRESH MART\nMilk 2.40\nTotal: 80.00\nTax 6.40\nGrand Total: $86.40\n";
        Assert.Equal(86.40m, ReceiptParser.FindTotal(text));
        Assert.Equal("FRESH MART", ReceiptParser.FindMerchant(text));
    }

    [Fact]
    public void Handles_thousands_separators() =>
        Assert.Equal(1250.00m, ReceiptParser.FindTotal("Invoice\nAmount due: 1,250.00"));

    [Fact]
    public void Returns_null_without_a_total() =>
        Assert.Null(ReceiptParser.FindTotal("Thank you for shopping"));
}

public class InMemoryRepositoryTests
{
    [Fact]
    public async Task Keeps_users_apart()
    {
        var repo = new InMemoryRepository<Account>();
        await repo.UpsertAsync(new Account { Id = "a", UserId = "alice", Name = "A" });
        await repo.UpsertAsync(new Account { Id = "b", UserId = "bob", Name = "B" });

        Assert.Single(await repo.ListAsync("alice"));
        Assert.Null(await repo.GetAsync("alice", "b"));
        Assert.True(await repo.DeleteAsync("bob", "b"));
    }
}
