using System.Globalization;
using System.Text.RegularExpressions;

namespace FinTrack.Shared.Domain;

/// <summary>
/// Pulls the merchant and total out of OCR text from a receipt.
/// The Azure Function feeds it text extracted from the uploaded blob.
/// </summary>
public static partial class ReceiptParser
{
    [GeneratedRegex(@"(?im)^\s*(grand\s+total|total\s+due|amount\s+due|total)\s*[:\-]?\s*(?:[a-z$€£₨]{0,4}\.?\s*)?([0-9][0-9,]*\.?[0-9]{0,2})")]
    private static partial Regex TotalLine();

    public static decimal? FindTotal(string text)
    {
        decimal? best = null;
        foreach (Match m in TotalLine().Matches(text))
        {
            var raw = m.Groups[2].Value.Replace(",", "");
            if (decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var value))
            {
                // "Grand total" wins over a plain "total" (which may be a subtotal).
                if (best is null || m.Groups[1].Value.StartsWith("grand", StringComparison.OrdinalIgnoreCase)) best = value;
            }
        }
        return best;
    }

    public static string? FindMerchant(string text) =>
        text.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault(l => l.Length > 2 && l.Any(char.IsLetter));
}
