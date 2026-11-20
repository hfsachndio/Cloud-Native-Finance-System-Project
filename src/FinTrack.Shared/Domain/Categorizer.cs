using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace FinTrack.Shared.Domain;

/// <summary>
/// Auto-categorisation for transactions that arrive without a category.
/// Uses the machine-learning model trained in <c>ml/train_categoriser.py</c> (character n-gram TF-IDF +
/// multinomial logistic regression), the same weights the Node.js API uses. Falls back to keyword rules
/// only if the model resource is missing.
/// </summary>
public static partial class Categorizer
{
    public const double MinConfidence = 0.4;

    public sealed record Prediction(string Category, double Confidence, IReadOnlyList<(string Label, double P)> Ranked);

    private sealed class Model
    {
        public string[] Labels { get; init; } = [];
        public int[] Ngram { get; init; } = [2, 5];
        public string[] Vocab { get; init; } = [];
        public double[] Idf { get; init; } = [];
        public double[][] Coef { get; init; } = [];
        public double[] Intercept { get; init; } = [];
    }

    private static readonly Lazy<(Model M, Dictionary<string, int> Index)?> Loaded = new(() =>
    {
        using var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("FinTrack.Shared.categoriser.json");
        if (s is null) return null;
        var m = JsonSerializer.Deserialize<Model>(s, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        var index = new Dictionary<string, int>(m.Vocab.Length);
        for (var i = 0; i < m.Vocab.Length; i++) index[m.Vocab[i]] = i;
        return (m, index);
    });

    [GeneratedRegex(@"\S*\d\S*")] private static partial Regex Digits();
    [GeneratedRegex(@"[^a-z&' ]+")] private static partial Regex NonLetters();
    [GeneratedRegex(@"\s+")] private static partial Regex Spaces();

    public static string Preprocess(string s) =>
        Spaces().Replace(NonLetters().Replace(Digits().Replace(s.ToLowerInvariant(), " "), " "), " ").Trim();

    private static IEnumerable<string> Ngrams(string text, int minN, int maxN)
    {
        foreach (var word in text.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var w = " " + word + " ";
            for (var n = minN; n <= maxN; n++)
            {
                var offset = 0;
                yield return w.Substring(offset, Math.Min(n, w.Length - offset));
                while (offset + n < w.Length) { offset++; yield return w.Substring(offset, n); }
                if (offset == 0) break;
            }
        }
    }

    public static Prediction? Predict(string description)
    {
        var loaded = Loaded.Value;
        if (loaded is null) return null;
        var (m, index) = loaded.Value;
        var tf = new Dictionary<int, double>();
        foreach (var g in Ngrams(Preprocess(description), m.Ngram[0], m.Ngram[1]))
            if (index.TryGetValue(g, out var i)) tf[i] = tf.GetValueOrDefault(i) + 1;
        double norm = 0;
        foreach (var i in tf.Keys.ToList()) { var v = (1 + Math.Log(tf[i])) * m.Idf[i]; tf[i] = v; norm += v * v; }
        norm = Math.Sqrt(norm); if (norm == 0) norm = 1;
        var z = new double[m.Labels.Length];
        for (var k = 0; k < z.Length; k++) { var s = m.Intercept[k]; foreach (var (i, v) in tf) s += m.Coef[k][i] * v / norm; z[k] = s; }
        var max = z.Max(); var e = z.Select(v => Math.Exp(v - max)).ToArray(); var sum = e.Sum();
        var ranked = m.Labels.Select((l, k) => (l, e[k] / sum)).OrderByDescending(x => x.Item2).ToList();
        return new Prediction(ranked[0].l, ranked[0].Item2, ranked);
    }

    public static string Categorise(string description, decimal amount)
    {
        var p = Predict(description);
        if (p is null) return RuleBased(description, amount);
        if (amount > 0) return p.Ranked.First(x => x.Label == "Transfers").P >= 0.6 ? "Transfers" : "Income";
        var category = p.Confidence >= MinConfidence ? p.Category : "Uncategorised";
        if (category == "Income") category = p.Ranked.Count > 1 && p.Ranked[1].P >= 0.2 ? p.Ranked[1].Label : "Uncategorised";
        return category;
    }

    private static readonly (string Category, string[] Keywords)[] Rules =
    {
        ("Income", new[] { "salary", "payroll", "freelance", "invoice", "refund", "dividend" }), ("Groceries", new[] { "supermarket", "grocery", "mart", "bakery", "fresh" }),
        ("Bills", new[] { "electric", "water bill", "gas bill", "internet", "phone bill", "utility" }), ("Transport", new[] { "uber", "careem", "ride", "fuel", "petrol", "metro", "bus", "taxi" }),
        ("Dining", new[] { "restaurant", "cafe", "coffee", "pizza", "burger", "food delivery" }), ("Health", new[] { "pharmacy", "clinic", "hospital", "doctor", "medicine" }),
        ("Entertainment", new[] { "cinema", "netflix", "spotify", "concert", "game" }), ("Shopping", new[] { "online order", "amazon", "daraz", "store", "mall" }),
    };
    private static string RuleBased(string description, decimal amount)
    {
        var text = description.ToLowerInvariant();
        foreach (var (category, keywords) in Rules) if (keywords.Any(k => text.Contains(k))) return category;
        return amount > 0 ? "Income" : "Uncategorised";
    }
}
