namespace FinTrack.Shared.Domain;

/// <summary>
/// Rule-based auto-categorisation used when a transaction arrives without a category.
/// Keywords are matched case-insensitively against the description.
/// </summary>
public static class Categorizer
{
    private static readonly (string Category, string[] Keywords)[] Rules =
    {
        ("Income",        new[] { "salary", "payroll", "freelance", "invoice", "refund", "dividend" }),
        ("Groceries",     new[] { "supermarket", "grocery", "mart", "bakery", "fresh" }),
        ("Bills",         new[] { "electric", "water bill", "gas bill", "internet", "phone bill", "utility" }),
        ("Transport",     new[] { "uber", "careem", "ride", "fuel", "petrol", "metro", "bus", "taxi" }),
        ("Dining",        new[] { "restaurant", "cafe", "coffee", "pizza", "burger", "food delivery" }),
        ("Health",        new[] { "pharmacy", "clinic", "hospital", "doctor", "medicine" }),
        ("Entertainment", new[] { "cinema", "netflix", "spotify", "concert", "game" }),
        ("Shopping",      new[] { "online order", "amazon", "daraz", "store", "mall" }),
    };

    public static string Categorise(string description, decimal amount)
    {
        var text = description.ToLowerInvariant();
        foreach (var (category, keywords) in Rules)
        {
            if (keywords.Any(k => text.Contains(k))) return category;
        }
        return amount > 0 ? "Income" : "Uncategorised";
    }
}
