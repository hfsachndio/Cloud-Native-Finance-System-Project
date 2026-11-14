using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FinTrack.ServiceDefaults;
using FinTrack.Shared.Domain;
using FinTrack.Shared.Models;
using FinTrack.Shared.Storage;

var builder = WebApplication.CreateBuilder(args);
builder.AddFinTrackDefaults();
// Budgets call the Transactions service over HTTP instead of reading its data directly.
builder.Services.AddHttpClient("transactions", c =>
    c.BaseAddress = new Uri(builder.Configuration["Services:Transactions"] ?? "http://localhost:5102"));
var app = builder.Build();
app.MapFinTrackDefaults();

var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
var thisMonth = () => DateTime.UtcNow.ToString("yyyy-MM");

if (app.Configuration.IsInMemory())
{
    var repo = app.Services.GetRequiredService<IRepository<Budget>>();
    foreach (var b in SeedData.Budgets(thisMonth())) await repo.UpsertAsync(b);
}

async Task<IReadOnlyList<Transaction>> LoadTransactions(IHttpClientFactory http, string user, string month)
{
    var client = http.CreateClient("transactions");
    using var req = new HttpRequestMessage(HttpMethod.Get, $"/api/transactions?month={month}");
    req.Headers.Add("X-User-Id", user);
    using var res = await client.SendAsync(req);
    res.EnsureSuccessStatusCode();
    return await res.Content.ReadFromJsonAsync<List<Transaction>>(json) ?? new();
}

var api = app.MapGroup("/api/budgets");

api.MapGet("/", async (HttpContext ctx, IRepository<Budget> repo, IHttpClientFactory http, string? month) =>
{
    var m = month ?? thisMonth();
    var user = ctx.UserId();
    var budgets = await repo.ListAsync(user, b => b.Month == m);
    var transactions = await LoadTransactions(http, user, m);
    return Results.Ok(budgets.Select(b => BudgetCalculator.Progress(b, transactions)).OrderByDescending(p => p.Percent));
});

api.MapPost("/", async (CreateBudgetRequest req, HttpContext ctx, IRepository<Budget> repo) =>
{
    if (string.IsNullOrWhiteSpace(req.Category) || req.Limit <= 0)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["budget"] = new[] { "Category and a positive limit are required." } });
    var budget = new Budget
    {
        UserId = ctx.UserId(), Category = req.Category.Trim(), Limit = req.Limit,
        Month = req.Month ?? thisMonth(), AlertThreshold = req.AlertThreshold ?? 0.9m,
    };
    await repo.UpsertAsync(budget);
    return Results.Created($"/api/budgets/{budget.Id}", budget);
});

// Alerts are written by the BudgetAlert Azure Function when spending crosses the threshold.
api.MapGet("/alerts", async (HttpContext ctx, IRepository<BudgetAlert> alerts) =>
    Results.Ok((await alerts.ListAsync(ctx.UserId())).OrderByDescending(a => a.RaisedAt)));

app.Run();
