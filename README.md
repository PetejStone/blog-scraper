# Blog Scraper → CSV

Crawl any blog and export all posts to a CSV file. Frontend hosted on GitHub Pages, backend proxy hosted on Render.

## Repo Structure

```
blog-scraper/
├── public/
│   └── index.html      # Frontend UI
├── server.js           # Express proxy/crawler
├── package.json
└── README.md
```

---

## Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) and create a **New Web Service**
3. Connect your GitHub repo
4. Set the following:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Click **Deploy**
6. Once deployed, copy your Render URL (e.g. `https://blog-scraper-xxxx.onrender.com`)

---

## Deploy Frontend to GitHub Pages

1. Go to your repo on GitHub → **Settings → Pages**
2. Set source to **Deploy from a branch**
3. Set branch to `main` and folder to `/public`
4. Save — GitHub will give you a URL like `https://yourusername.github.io/blog-scraper/`

---

## Usage

1. Open your GitHub Pages URL
2. Paste your **Render API URL** into the first field
3. Paste the **blog root URL** you want to crawl
4. Select fields to extract
5. Hit **Start Crawl**
6. Download the CSV when done

---

## Notes

- Free Render tier spins down after inactivity — first request may take ~30s to wake up
- Crawl respects a 300ms delay between requests to avoid hammering servers
- Works best on standard WordPress, Webflow, and HTML blogs
