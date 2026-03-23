// api/anime.js - API endpoint for Vercel
const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://anime-sama.to";
const CATALOGUE_URL = `${BASE_URL}/catalogue`;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
};

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchPage(url) {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    return res.data;
  } catch (err) {
    console.warn(`Erreur fetch ${url}: ${err.message}`);
    return null;
  }
}

async function getTotalPages() {
  const html = await fetchPage(CATALOGUE_URL);
  if (!html) throw new Error("Impossible de charger la page catalogue.");
  
  const $ = cheerio.load(html);
  let maxPage = 1;
  
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/[?&/]page[=/](\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxPage) maxPage = num;
    }
  });
  
  $(".pagination a, .page-link, [class*='pag'] a").each((_, el) => {
    const text = $(el).text().trim();
    const num = parseInt(text, 10);
    if (!isNaN(num) && num > maxPage) maxPage = num;
  });
  
  return maxPage;
}

function extractAnimeLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    let full = href.startsWith("http") ? href : `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
    
    if (
      full.startsWith(`${BASE_URL}/catalogue/`) &&
      !full.includes("?") &&
      !full.includes("#") &&
      full !== `${BASE_URL}/catalogue/` &&
      full !== `${BASE_URL}/catalogue`
    ) {
      const slug = full.replace(`${BASE_URL}/catalogue/`, "");
      const parts = slug.split("/").filter(Boolean);
      if (parts.length === 1) {
        links.add(full);
      }
    }
  });
  
  return [...links];
}

async function scrapeAllPages(totalPages) {
  const allLinks = new Set();
  
  for (let page = 1; page <= totalPages; page++) {
    const urls = [
      page === 1 ? CATALOGUE_URL : `${CATALOGUE_URL}?page=${page}`,
      `${CATALOGUE_URL}/page/${page}`,
    ];
    
    let found = false;
    for (const url of urls) {
      const html = await fetchPage(url);
      if (!html) continue;
      
      const links = extractAnimeLinks(html, url);
      if (links.length > 0) {
        links.forEach((l) => allLinks.add(l));
        found = true;
        break;
      }
    }
    
    if (!found && page > 1) {
      break;
    }
    
    await sleep(300);
  }
  
  return [...allLinks];
}

function slugToTitle(url) {
  const slug = url.replace(`${BASE_URL}/catalogue/`, "");
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  
  try {
    const totalPages = await getTotalPages();
    const allLinks = await scrapeAllPages(totalPages);
    
    if (allLinks.length === 0) {
      return res.status(500).json({ error: "Aucun lien d'anime trouvé" });
    }
    
    const animes = allLinks.sort().map((url, index) => ({
      id: index + 1,
      titre: slugToTitle(url),
      url: url,
      slug: url.replace(`${BASE_URL}/catalogue/`, ""),
    }));
    
    const output = {
      source: BASE_URL,
      scrape_date: new Date().toISOString(),
      total: animes.length,
      animes: animes,
    };
    
    return res.status(200).json(output);
  } catch (err) {
    console.error("Erreur:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
