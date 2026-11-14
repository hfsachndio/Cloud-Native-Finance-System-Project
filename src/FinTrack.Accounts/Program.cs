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
    var repo = app.Services.GetRequiredService<IRepository<Account>>();
    foreach (var a in SeedData.Accounts()) await repo.UpsertAsync(a);
}

var api = app.MapGroup("/api/accounts");

api.MapGet("/", async (HttpContext ctx, IRepository<Account> repo) =>
    Results.Ok(await repo.ListAsync(ctx.UserId())));

api.MapGet("/{id}", async (string id, HttpContext ctx, IRepository<Account> repo) =>
    await repo.GetAsync(ctx.UserId(), id) is { } account ? Results.Ok(account) : Results.NotFound());

api.MapGet("/net-worth", async (HttpContext ctx, IRepository<Account> repo) =>
{
    var accounts = await repo.ListAsync(ctx.UserId());
    return Results.Ok(new { total = accounts.Sum(a => a.Balance), accounts = accounts.Count });
});

api.MapPost("/", async (CreateAccountRequest req, HttpContext ctx, IRepository<Account> repo) =>
{
    if (string.IsNullOrWhiteSpace(req.Name)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = new[] { "Name is required." } });
    var account = new Account
    {
        UserId = ctx.UserId(), Name = req.Name.Trim(), Kind = req.Kind, Mask = req.Mask,
        Balance = req.OpeningBalance, Currency = req.Currency ?? "USD",
    };
    await repo.UpsertAsync(account);
    return Results.Created($"/api/accounts/{account.Id}", account);
});

// Moves money between two of the user's accounts.
api.MapPost("/transfer", async (TransferRequest req, HttpContext ctx, IRepository<Account> repo) =>
{
    if (req.Amount <= 0) return Results.BadRequest(new { error = "Amount must be positive." });
    var user = ctx.UserId();
    var from = await repo.GetAsync(user, req.FromAccountId);
    var to = await repo.GetAsync(user, req.ToAccountId);
    if (from is null || to is null) return Results.NotFound();
    if (from.Kind != "CreditCard" && from.Balance < req.Amount) return Results.BadRequest(new { error = "Insufficient funds." });
    from.Balance -= req.Amount; from.UpdatedAt = DateTimeOffset.UtcNow;
    to.Balance += req.Amount; to.UpdatedAt = DateTimeOffset.UtcNow;
    await repo.UpsertAsync(from);
    await repo.UpsertAsync(to);
    return Results.Ok(new { from, to });
});

app.Run();

public sealed record TransferRequest(string FromAccountId, string ToAccountId, decimal Amount);
