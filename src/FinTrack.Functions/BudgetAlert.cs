using FinTrack.Shared.Domain;
using FinTrack.Shared.Models;
using FinTrack.Shared.Storage;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace FinTrack.Functions;

/// <summary>
/// Listens to the Cosmos DB change feed for new or updated transactions and raises an alert
/// when a category's spending crosses its budget threshold (90% by default).
/// </summary>
public sealed class BudgetAlertFunction(
    IRepository<Transaction> transactions,
    IRepository<Budget> budgets,
    IRepository<BudgetAlert> alerts,
    ILogger<BudgetAlertFunction> log)
{
    [Function("BudgetAlert")]
    public async Task Run(
        [CosmosDBTrigger("fintrack", "transactions", Connection = "Cosmos", LeaseContainerName = "leases", CreateLeaseContainerIfNotExists = true)]
        IReadOnlyList<Transaction> changed, CancellationToken ct)
    {
        foreach (var group in changed.Where(t => t.Amount < 0).GroupBy(t => (t.UserId, t.Category, Month: t.Date.ToString("yyyy-MM"))))
        {
            var (userId, category, month) = group.Key;
            var budget = (await budgets.ListAsync(userId, b => b.Category == category && b.Month == month, ct)).FirstOrDefault();
            if (budget is null) continue;

            var monthTx = await transactions.ListAsync(userId, t => t.Date.ToString("yyyy-MM") == month, ct);
            var progress = BudgetCalculator.Progress(budget, monthTx);
            if (!progress.OverThreshold) continue;

            var existing = await alerts.ListAsync(userId, a => a.Category == category && a.Month == month, ct);
            if (existing.Count > 0) continue;   // one alert per category per month

            await alerts.UpsertAsync(new BudgetAlert
            {
                UserId = userId, Category = category, Month = month, Spent = progress.Spent, Limit = progress.Limit,
                Message = $"{category} is at {progress.Percent:0}% of budget.",
            }, ct);
            log.LogInformation("Budget alert for {User}: {Category} {Percent}%", userId, category, progress.Percent);
        }
    }
}
