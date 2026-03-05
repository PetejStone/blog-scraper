const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const defaultHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (HTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

// --- Proxy fetch endpoint ---
app.get("/fetch", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing url param");
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: defaultHeaders,
    });
    res.send(response.data);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// --- Helper: fetch a page ---
async function fetchPage(url) {
  const res = await axios.get(url, {
    timeout: 10000,
    headers: defaultHeaders,
  });
  return res.data;
}

// --- Helper: is this URL worth crawling (on the path to a post)? ---
function isRelevantUrl(url, rootUrl) {
  const path = url.replace(rootUrl, "").replace(/\/$/, "");
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return true;
  if (segments.length === 1) return /^\d{4}$/.test(segments[0]);
  if (segments.length === 2) return /^\d{4}$/.test(segments[0]);
  if (segments.length === 3) return /^\d{4}$/.test(segments[0]);
  return false;
}

// --- Helper: extract all same-base links from a page ---
function extractLinks(html, baseUrl, rootUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  const base = new URL(rootUrl);

  $("a[href]").each((_, el) => {
    try {
      const href = new URL($(el).attr("href"), baseUrl);
      href.hash = "";
      href.search = "";
      const clean = href.href;
      if (href.hostname !== base.hostname) return;
      if (!clean.startsWith(rootUrl)) return;
      if (clean.includes("/categories")) return;
      if (!isRelevantUrl(clean, rootUrl)) return;
      links.add(clean);
    } catch {}
  });

  return links;
}

// --- Helper: does URL match year/month/slug pattern? ---
function looksLikePost(url) {
  return /\/\d{4}\/[^/]+\/[^/]+\/?$/.test(url);
}

// --- Helper: extract post data from HTML ---
function extractPost(html, url, fields) {
  const $ = cheerio.load(html);
  const post = { URL: url };

  if (fields.title)
    post["Title"] =
      $("title").text().trim() ||
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content") ||
      "";

  if (fields.metaDesc)
    post["Meta Description"] =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "";

  if (fields.date) {
    const raw =
      $("time[datetime]").attr("datetime") ||
      $('meta[property="article:published_time"]').attr("content") ||
      $("[class*='date']").first().text().trim() ||
      $("[class*='published']").first().text().trim() ||
      $("[class*='post-date']").first().text().trim() ||
      "";
    post["Publish Date"] = raw.substring(0, 30);
  }

  if (fields.author) {
    const raw =
      $('meta[name="author"]').attr("content") ||
      $("[class*='author']").first().text().trim() ||
      $("[rel='author']").first().text().trim() ||
      "";
    post["Author"] = raw.substring(0, 80);
  }

  if (fields.h1) post["H1"] = $("h1").first().text().trim() || "";

  if (fields.wordCount) {
    const body =
      $("article").text() || $("main").text() || $("body").text() || "";
    post["Word Count"] = body.trim().split(/\s+/).filter(Boolean).length;
  }

  if (fields.content) {
    const contentEl =
      $("article").length ? $("article") :
      $("[class*='post-body']").length ? $("[class*='post-body']") :
      $("[class*='post-content']").length ? $("[class*='post-content']") :
      $("[class*='blog-content']").length ? $("[class*='blog-content']") :
      $("[class*='entry-content']").length ? $("[class*='entry-content']") :
      $("main").length ? $("main") : null;
    post["Content"] = contentEl ? contentEl.text().replace(/\s+/g, " ").trim() : "";
  }

  if (fields.ogImage)
    post["OG Image"] = $('meta[property="og:image"]').attr("content") || "";

  if (fields.canonical)
    post["Canonical"] = $('link[rel="canonical"]').attr("href") || "";

  return post;
}

// --- Main scrape endpoint ---
app.post("/scrape", async (req, res) => {
  const { rootUrl, maxPages, fields = {} } = req.body;
  const limit = maxPages ? parseInt(maxPages) : Infinity;

  if (!rootUrl) return res.status(400).json({ error: "rootUrl is required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  const visited = new Set();
  const queue = [rootUrl];
  const posts = [];
  let crawled = 0;

  try {
    while (queue.length > 0 && crawled < limit) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      crawled++;

      send("log", { message: `[${crawled}] Fetching: ${current}` });

      let html;
      try {
        html = await fetchPage(current);
      } catch (e) {
        send("log", { message: `  ✗ Failed — ${e.message}` });
        continue;
      }

      const links = extractLinks(html, current, rootUrl);
      for (const link of links) {
        if (!visited.has(link) && !queue.includes(link)) queue.push(link);
      }

      if (current !== rootUrl && looksLikePost(current)) {
        const post = extractPost(html, current, fields);
        posts.push(post);
        send("log", { message: `  ✓ Post: ${post["Title"] || "(no title)"}` });
      }

      send("progress", { crawled, queued: queue.length, found: posts.length });

      await new Promise((r) => setTimeout(r, 300));
    }

    send("done", { posts });
  } catch (e) {
    send("error", { message: e.message });
  }

  res.end();
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
