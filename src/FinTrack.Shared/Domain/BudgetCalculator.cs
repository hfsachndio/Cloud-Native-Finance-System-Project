using FinTrack.Shared.Models;

namespace FinTrack.Shared.Domain;

public static class BudgetCalculator
{
    /// <summary>Spending for a category in a month (expenses are stored as negative amounts).</summary>
    public static decimal SpentIn(IEnumerable<Transaction> transactions, string category, string month) =>
        transactions
            .Where(t => t.Amount < 0
                        && string.Equals(t.Category, category, StringComparison.OrdinalIgnoreCase)
                        && t.Date.ToString("yyyy-MM") == month)
            .Sum(t => -t.Amount);

    public static BudgetProgress Progress(Budget budget, IEnumerable<Transaction> transactions)
    {
        var spent = SpentIn(transactions, budget.Category, budget.Month);
        var percent = budget.Limit == 0 ? 0 : Math.Round(spent / budget.Limit * 100m, 1);
        return new BudgetProgress(budget.Category, budget.Month, budget.Limit, spent,
            Math.Max(0, budget.Limit - spent), percent, spent >= budget.Limit * budget.AlertThreshold);
    }
}
