// Vercel Routing Middleware — serves deal-specific Open Graph/Twitter meta
// tags to link-preview crawlers (iMessage, Facebook, Discord, Slack, etc.)
// when a shared link includes ?deal=<id>. Real users always get the normal
// SPA untouched: this only intercepts requests whose User-Agent matches a
// known crawler.
export const config = { matcher: ["/"] };

const BOT_UA =
  /facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|WhatsApp|TelegramBot|LinkedInBot|Pinterest|SkypeUriPreview|redditbot|Googlebot|Applebot|iMessageLinkPreview/i;

const escapeHtml = (str = "") =>
  String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async function middleware(request) {
  const url = new URL(request.url);
  const dealId = url.searchParams.get("deal");
  if (!dealId) return;

  const ua = request.headers.get("user-agent") || "";
  if (!BOT_UA.test(ua)) return;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  let deal;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/deals?id=eq.${encodeURIComponent(dealId)}&select=title,restaurant,price,image_url`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (res.ok) [deal] = await res.json();
  } catch {
    return;
  }
  if (!deal) return;

  const title = escapeHtml(`${deal.title} — MealDeals`);
  const description = escapeHtml(`${deal.title} at ${deal.restaurant} — ${deal.price}`);
  const image = escapeHtml(deal.image_url || "https://mealdeals.vercel.app/og-image.png");
  const pageUrl = escapeHtml(url.toString());

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${pageUrl}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="MealDeals" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />
<meta http-equiv="refresh" content="0; url=${pageUrl}" />
</head>
<body>
<a href="${pageUrl}">${title}</a>
</body>
</html>`;

  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}
