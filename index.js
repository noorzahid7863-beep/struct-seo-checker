const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const cheerio = require('cheerio');

// 1. Command line se URL lena (e.g., node index.js https://www.xloopdigital.com)
const targetUrlArg = process.argv[2];
if (!targetUrlArg) {
  console.error("❌ Error: Please provide a URL!");
  console.error("Usage: node index.js https://www.xloopdigital.com");
  process.exit(1);
}

const parsedBase = new URL(targetUrlArg);
const BASE_URL = parsedBase.origin;

// Helper: Fetch function using native http/https to avoid fetch issues
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const startTime = Date.now();
    
    const req = client.get(url, { headers: { 'User-Agent': 'SEO-Checker-Bot/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        resolve({
          status: res.statusCode,
          html: data,
          responseTime
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request Timeout'));
    });
  });
}

// Simple XML parser for sitemap
function extractUrlsFromSitemap(xmlText) {
  const urls = [];
  const regex = /<loc>(.*?)<\/loc>/g;
  let match;
  while ((match = regex.exec(xmlText)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
}

// Extract internal links from HTML homepage fallback
function extractInternalLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  
  $('a').each((_, element) => {
    let href = $(element).attr('href');
    if (href) {
      try {
        let fullUrl = new URL(href, baseUrl).href;
        // Sirf same domain ke links rakho
        if (fullUrl.startsWith(baseUrl)) {
          links.add(fullUrl.split('#')[0]); // Remove hashes
        }
      } catch (e) {
        // Invalid URL ignore karo
      }
    }
  });
  
  return Array.from(links);
}

// Concurrency queue (Max 3 requests at a time)
async function runWithConcurrency(items, limit, fn) {
  let results = [];
  let index = 0;
  
  async function worker() {
    while (index < items.length) {
      let currentIndex = index++;
      try {
        let res = await fn(items[currentIndex]);
        results[currentIndex] = { success: true, data: res };
      } catch (err) {
        results[currentIndex] = { success: false, error: err.message };
      }
    }
  }

  let workers = Array(limit).fill(0).map(() => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log(`🔍 Starting audit for: ${BASE_URL}`);
  let urlsToTest = [];

  // Step A: Try fetching sitemap.xml
  try {
    console.log(`📡 Trying to fetch sitemap: ${BASE_URL}/sitemap.xml`);
    const sitemapRes = await fetchPage(`${BASE_URL}/sitemap.xml`);
    if (sitemapRes.status === 200) {
      urlsToTest = extractUrlsFromSitemap(sitemapRes.html);
      console.log(`✅ Found ${urlsToTest.length} URLs from sitemap.`);
    }
  } catch (e) {
    console.log(`⚠️ Sitemap not found or failed. Falling back to homepage crawling...`);
  }

  // Step B: Fallback to homepage crawling if sitemap failed or empty
  if (urlsToTest.length === 0) {
    try {
      const homeRes = await fetchPage(BASE_URL);
      if (homeRes.status === 200) {
        let extracted = extractInternalLinks(homeRes.html, BASE_URL);
        urlsToTest = [BASE_URL, ...extracted];
        console.log(`✅ Extracted ${urlsToTest.length} internal links from homepage.`);
      }
    } catch (e) {
      console.error(`❌ Failed to load homepage: ${e.message}`);
      process.exit(1);
    }
  }

  // Limit to max 50 pages as per requirement
  urlsToTest = Array.from(new Set(urlsToTest)).slice(0, 50);
  console.log(`🚀 Total unique pages to audit: ${urlsToTest.length}`);

  let reportData = [];
  let issueMap = new Map();
  let totalBrokenLinks = 0;

  // Function to audit a single page
  async function auditPage(url) {
    console.log(`Crawling: ${url}`);
    const pageResult = {
      url,
      status: 0,
      responseTime: 0,
      issues: [],
      internalLinksCount: 0,
      brokenLinksOnPage: []
    };

    try {
      const res = await fetchPage(url);
      pageResult.status = res.status;
      pageResult.responseTime = res.responseTime;

      if (res.status !== 200) {
        pageResult.issues.push(`HTTP Status ${res.status}`);
        return pageResult;
      }

      const $ = cheerio.load(res.html);

      // 1. Title Check
      const title = $('title').text().trim();
      if (!title) {
        pageResult.issues.push('Missing Title');
      } else if (title.length > 60) {
        pageResult.issues.push('Title too long (>60 chars)');
      }

      // 2. Meta Description Check
      const metaDesc = $('meta[name="description"]').attr('content');
      if (!metaDesc) {
        pageResult.issues.push('Missing Meta Description');
      } else if (metaDesc.trim().length > 160) {
        pageResult.issues.push('Meta Description too long (>160 chars)');
      }

      // 3. H1 Check
      const h1Tags = $('h1');
      if (h1Tags.length === 0) {
        pageResult.issues.push('Missing H1 Tag');
      } else if (h1Tags.length > 1) {
        pageResult.issues.push('Multiple H1 Tags found');
      }

      // 4. Images Alt Check
      let missingAltCount = 0;
      $('img').each((_, img) => {
        const alt = $(img).attr('alt');
        if (!alt || alt.trim() === '') {
          missingAltCount++;
        }
      });
      if (missingAltCount > 0) {
        pageResult.issues.push(`Missing Alt Text in ${missingAltCount} images`);
      }

      // 5. Internal Links Check (Link Health)
      const internalLinks = [];
      $('a').each((_, el) => {
        let href = $(el).attr('href');
        if (href) {
          try {
            let full = new URL(href, BASE_URL).href;
            if (full.startsWith(BASE_URL)) {
              internalLinks.push(full);
            }
          } catch (err) {}
        }
      });

      const uniqueInternalLinks = Array.from(new Set(internalLinks));
      pageResult.internalLinksCount = uniqueInternalLinks.length;

      // Check broken links (sample check or check all)
      for (let link of uniqueInternalLinks.slice(0, 10)) { // limit to 10 per page for performance
        try {
          // Quick HEAD or GET check
          const linkRes = await fetchPage(link);
          if (linkRes.status >= 400) {
            totalBrokenLinks++;
            pageResult.brokenLinksOnPage.push({ link, status: linkRes.status });
            pageResult.issues.push(`Broken Link: ${link} (${linkRes.status})`);
          }
        } catch (err) {
          totalBrokenLinks++;
          pageResult.brokenLinksOnPage.push({ link, status: 'Error' });
          pageResult.issues.push(`Broken Link: ${link}`);
        }
      }

    } catch (err) {
      pageResult.status = 500;
      pageResult.issues.push(`Fetch Error: ${err.message}`);
    }

    return pageResult;
  }

  // Run audit with concurrency limit = 3
  console.log(`⏳ Running queue with concurrency limit of 3...`);
  const queueResults = await runWithConcurrency(urlsToTest, 3, auditPage);

  queueResults.forEach(item => {
    if (item.success) {
      reportData.push(item.data);
      // Group issues using Map
      item.data.issues.forEach(issue => {
        let key = issue.includes('Broken Link') ? 'Broken Links' : issue;
        issueMap.set(key, (issueMap.get(key) || 0) + 1);
      });
    }
  });

  // Sort pages by number of issues (worst first)
  reportData.sort((a, b) => b.issues.length - a.issues.length);

  // Save report.json
  fs.writeFileSync('report.json', JSON.stringify(reportData, null, 2));
  console.log(`💾 Saved report to report.json`);

  // Save report.csv
  let csvRows = ['URL,Status,ResponseTime(ms),IssuesCount,Issues'];
  reportData.forEach(row => {
    let issuesStr = `"${row.issues.join(' | ')}"`;
    csvRows.push(`"${row.url}",${row.status},${row.responseTime},${row.issues.length},${issuesStr}`);
  });
  fs.writeFileSync('report.csv', csvRows.join('\n'));
  console.log(`💾 Saved report to report.csv`);

  // Terminal Summary
  console.log("\n==============================");
  console.log("📊 SEO AUDIT SUMMARY REPORT");
  console.log("==============================");
  console.log(`Total Pages Checked: ${reportData.length}`);
  let pagesWithIssues = reportData.filter(p => p.issues.length > 0).length;
  console.log(`Pages with Issues: ${pagesWithIssues}`);
  console.log(`Total Broken Links Found: ${totalBrokenLinks}`);
  
  console.log("\n📌 Issues Breakdown (Grouped by Map):");
  for (let [issueType, count] of issueMap.entries()) {
    console.log(` - ${issueType}: ${count} pages`);
  }

  console.log("\n🔥 Top 5 Worst Pages (Most Issues):");
  reportData.slice(0, 5).forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.url} (${p.issues.length} issues)`);
  });
  console.log("==============================\n");
}

main();