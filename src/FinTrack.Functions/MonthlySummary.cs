using FinTrack.Shared.Models;
using FinTrack.Shared.Storage;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace FinTrack.Functions;

/// <summary>Runs at 06:00 UTC on the 1st of each month and logs last month's totals per user.</summary>
public sealed class MonthlySummary(IRepository<Account> accounts, IRepository<Transaction> transactions, ILogger<MonthlySummary> log)
{
    [Function(nameof(MonthlySummary))]
    public async Task Run([TimerTrigger("0 0 6 1 * *")] TimerInfo timer, CancellationToken ct)
    {
        var lastMonth = DateTime.UtcNow.AddMonths(-1).ToString("yyyy-MM");
        // Demo: one user. In production this iterates the users container.
        const string user = "demo-user";
        var tx = await transactions.ListAsync(user, t => t.Date.ToString("yyyy-MM") == lastMonth, ct);
        var income = tx.Where(t => t.Amount > 0).Sum(t => t.Amount);
        var spending = tx.Where(t => t.Amount < 0).Sum(t => -t.Amount);
        var netWorth = (await accounts.ListAsync(user, ct: ct)).Sum(a => a.Balance);
        log.LogInformation("Summary {Month} for {User}: income {Income}, spending {Spending}, saved {Saved}, net worth {NetWorth}",
            lastMonth, user, income, spending, income - spending, netWorth);
    }
}
