using FinTrack.ServiceDefaults;
using FinTrack.Shared.Domain;
using FinTrack.Shared.Models;
using FinTrack.Shared.Storage;

var builder = WebApplication.CreateBuilder(args);
builder.AddFinTrackDefaults();
var app = builder.Build();
app.MapFinTrackDefaults();

if (app.Configuration.IsInMemory())
{
    var repo = app.Services.GetRequiredService<IRepository<Transaction>>();
    foreach (var t in SeedData.Transactions(DateOnly.FromDateTime(DateTime.UtcNow))) await repo.UpsertAsync(t);
}

var api = app.MapGroup("/api/transactions");

api.MapGet("/", async (HttpContext ctx, IRepository<Transaction> repo, string? month, string? category, TransactionStatus? status) =>
{
    var items = await repo.ListAsync(ctx.UserId(), t =>
        (month is null || t.Date.ToString("yyyy-MM") == month) &&
        (category is null || t.Category.Equals(category, StringComparison.OrdinalIgnoreCase)) &&
        (status is null || t.Status == status));
    return Results.Ok(items.OrderByDescending(t => t.Date).ThenByDescending(t => t.CreatedAt));
});

api.MapGet("/{id}", async (string id, HttpContext ctx, IRepository<Transaction> repo) =>
    await repo.GetAsync(ctx.UserId(), id) is { } t ? Results.Ok(t) : Results.NotFound());

api.MapPost("/", async (CreateTransactionRequest req, HttpContext ctx, IRepository<Transaction> repo) =>
{
    if (string.IsNullOrWhiteSpace(req.Description) || req.Amount == 0)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["transaction"] = new[] { "Description and a non-zero amount are required." } });
    var t = new Transaction
    {
        UserId = ctx.UserId(), AccountId = req.AccountId, Description = req.Description.Trim(), Amount = req.Amount,
        Date = req.Date ?? DateOnly.FromDateTime(DateTime.UtcNow),
        Category = string.IsNullOrWhiteSpace(req.Category) ? Categorizer.Categorise(req.Description, req.Amount) : req.Category!,
        Type = req.Amount > 0 ? TransactionType.Income : TransactionType.Expense,
        Status = TransactionStatus.Completed,
    };
    await repo.UpsertAsync(t);
    return Results.Created($"/api/transactions/{t.Id}", t);
});

// Upload a receipt. The file goes to Blob Storage; the ProcessReceipt function reads it
// and fills in the total, so the transaction stays "Processing" until then.
api.MapPost("/{id}/receipt", async (string id, IFormFile file, HttpContext ctx, IRepository<Transaction> repo, IReceiptStore store) =>
{
    var t = await repo.GetAsync(ctx.UserId(), id);
    if (t is null) return Results.NotFound();
    if (file.Length == 0 || file.Length > 10 * 1024 * 1024) return Results.BadRequest(new { error = "Receipt must be between 1 byte and 10 MB." });
    await using var stream = file.OpenReadStream();
    t.ReceiptBlob = await store.SaveAsync(t.UserId, file.FileName, stream, file.ContentType);
    t.Status = TransactionStatus.Processing;
    await repo.UpsertAsync(t);
    return Results.Accepted($"/api/transactions/{t.Id}", t);
}).DisableAntiforgery();

api.MapDelete("/{id}", async (string id, HttpContext ctx, IRepository<Transaction> repo) =>
    await repo.DeleteAsync(ctx.UserId(), id) ? Results.NoContent() : Results.NotFound());

// Income vs spending for the last N months (dashboard cash-flow chart).
app.MapGet("/api/reports/cash-flow", async (HttpContext ctx, IRepository<Transaction> repo, int? months) =>
{
    var n = Math.Clamp(months ?? 6, 1, 24);
    var start = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(-(n - 1));
    var items = await repo.ListAsync(ctx.UserId(), t => t.Date >= new DateOnly(start.Year, start.Month, 1));
    var result = Enumerable.Range(0, n).Select(i => start.AddMonths(i).ToString("yyyy-MM")).Select(m => new
    {
        month = m,
        income = items.Where(t => t.Date.ToString("yyyy-MM") == m && t.Amount > 0).Sum(t => t.Amount),
        spending = items.Where(t => t.Date.ToString("yyyy-MM") == m && t.Amount < 0).Sum(t => -t.Amount),
    });
    return Results.Ok(result);
});

// Spending split by category for a year (reports page).
app.MapGet("/api/reports/categories", async (HttpContext ctx, IRepository<Transaction> repo, int? year) =>
{
    var y = year ?? DateTime.UtcNow.Year;
    var items = await repo.ListAsync(ctx.UserId(), t => t.Date.Year == y && t.Amount < 0);
    var total = items.Sum(t => -t.Amount);
    return Results.Ok(items.GroupBy(t => t.Category)
        .Select(g => new { category = g.Key, spent = g.Sum(t => -t.Amount), share = total == 0 ? 0 : Math.Round(g.Sum(t => -t.Amount) / total * 100, 1) })
        .OrderByDescending(x => x.spent));
});

app.Run();
