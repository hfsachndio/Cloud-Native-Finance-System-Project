using FinTrack.ServiceDefaults;

// API gateway: one public entry point that routes /api/* to the right microservice
// and serves the React web app from wwwroot.
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHealthChecks();
builder.Services.AddHttpClient("proxy").ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { UseCookies = false });
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(builder.Configuration["Cors:Origins"] ?? "http://localhost:5173").AllowAnyHeader().AllowAnyMethod()));
var app = builder.Build();

var routes = new (string Prefix, string Service)[]
{
    ("/api/accounts", "Accounts"),
    ("/api/transactions", "Transactions"),
    ("/api/reports", "Transactions"),
    ("/api/budgets", "Budgets"),
};
string[] hopByHop = { "Connection", "Keep-Alive", "Transfer-Encoding", "Upgrade", "Proxy-Connection", "Host" };

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapHealthChecks("/health");

app.Map("/api/{**rest}", async (HttpContext ctx, IHttpClientFactory factory, IConfiguration config) =>
{
    var path = ctx.Request.Path.Value!;
    var route = routes.FirstOrDefault(r => path.StartsWith(r.Prefix, StringComparison.OrdinalIgnoreCase));
    if (route.Service is null) return Results.NotFound();

    var target = new Uri(new Uri(config[$"Services:{route.Service}"]!), path + ctx.Request.QueryString);
    using var request = new HttpRequestMessage(new HttpMethod(ctx.Request.Method), target);
    if (ctx.Request.ContentLength > 0 || ctx.Request.Headers.ContainsKey("Transfer-Encoding"))
    {
        request.Content = new StreamContent(ctx.Request.Body);
        if (ctx.Request.ContentType is { } ct) request.Content.Headers.TryAddWithoutValidation("Content-Type", ct);
    }
    foreach (var h in ctx.Request.Headers)
    {
        if (hopByHop.Contains(h.Key, StringComparer.OrdinalIgnoreCase) || h.Key.Equals("X-User-Id", StringComparison.OrdinalIgnoreCase)) continue;
        request.Headers.TryAddWithoutValidation(h.Key, h.Value.ToArray());
    }
    // In Azure, App Service Authentication puts the signed-in user's id in X-MS-CLIENT-PRINCIPAL-ID.
    // Locally we fall back to the demo user. Clients can never set X-User-Id themselves.
    var user = ctx.Request.Headers["X-MS-CLIENT-PRINCIPAL-ID"].FirstOrDefault() ?? "demo-user";
    request.Headers.TryAddWithoutValidation("X-User-Id", user);

    using var response = await factory.CreateClient("proxy").SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ctx.RequestAborted);
    ctx.Response.StatusCode = (int)response.StatusCode;
    foreach (var h in response.Headers.Concat(response.Content.Headers))
    {
        if (!hopByHop.Contains(h.Key, StringComparer.OrdinalIgnoreCase)) ctx.Response.Headers[h.Key] = h.Value.ToArray();
    }
    await response.Content.CopyToAsync(ctx.Response.Body, ctx.RequestAborted);
    return Results.Empty;
});

app.MapFallbackToFile("index.html");
app.Run();
