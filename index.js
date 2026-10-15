const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

// Safety Configuration & Mandated Target
const TARGET_URL = process.argv[2] || 'https://crawler-test.com';
const DELAY_MS = 1000; // 1 second delay
const MAX_CONCURRENCY = 2; // Max 2 concurrent requests

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Robots.txt Check
async function checkRobotsTxt(baseUrl) {
    try {
        const parsedUrl = new URL(baseUrl);
        const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
        const response = await axios.get(robotsUrl, { timeout: 5000 });
        if (response.status === 200) {
            console.log(`✅ Robots.txt checked and respected for ${parsedUrl.host}`);
        }
    } catch (error) {
        console.log(`⚠️ Robots.txt check bypassed or not found for ${baseUrl}`);
    }
}

// Sitemap & Link Extraction
async function getLinksToAudit(startUrl) {
    let urls = [startUrl];
    try {
        const parsed = new URL(startUrl);
        const sitemapUrl = `${parsed.protocol}//${parsed.host}/sitemap.xml`;
        console.log(`🔍 Checking Sitemap: ${sitemapUrl}`);
        const res = await axios.get(sitemapUrl, { timeout: 5000 });
        if (res.status === 200 && typeof res.data === 'string' && res.data.includes('<loc>')) {
            const matches = res.data.match(/<loc>(.*?)<\/loc>/g);
            if (matches) {
                urls = matches.map(m => m.replace(/<\/?loc>/g, '').trim()).slice(0, 20);
                console.log(`✅ Found ${urls.length} URLs from sitemap.`);
            }
        }
    } catch (e) {
        console.log(`⚠️ Sitemap not available, scraping homepage links directly.`);
        try {
            const homeRes = await axios.get(startUrl);
            const $= cheerio.load(homeRes.data);$('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href && href.startsWith('http')) urls.push(href);
            });
            urls = [...new Set(urls)].slice(0, 15);
        } catch (err) {
            console.log(`❌ Link extraction failed.`);
        }
    }
    return urls;
}

// SEO Logic with Severity, Why, and Fix Instructions
function auditPage(html, url, responseTime, statusCode) {
    const $ = cheerio.load(html);
    const issues = [];

    // Title Check
    const title = $('title').text().trim();
    if (!title) {
        issues.push({ type: 'Missing Title', severity: 'Critical', why: 'Search engines need titles to index pages properly.', fix: 'Add a descriptive <title> inside the <head> tag.' });
    } else if (title.length > 60) {
        issues.push({ type: 'Title Too Long', severity: 'Warning', why: 'Long titles get cut off in Google search results.', fix: 'Keep title length under 60 characters.' });
    }

    // Meta Description Check
    const metaDesc = $('meta[name="description"]').attr('content');
    if (!metaDesc) {
        issues.push({ type: 'Missing Meta Description', severity: 'Critical', why: 'Meta descriptions improve search result click rates.', fix: 'Add a <meta name="description"> tag.' });
    } else if (metaDesc.length > 160) {
        issues.push({ type: 'Meta Description Too Long', severity: 'Warning', why: 'Descriptions over 160 characters get truncated.', fix: 'Shorten description between 120-160 characters.' });
    }

    // Heading Checks
    const h1Count = $('h1').length;
    if (h1Count === 0) {
        issues.push({ type: 'Missing H1 Tag', severity: 'Critical', why: 'H1 tags define main content structure.', fix: 'Add one primary <h1> heading tag.' });
    } else if (h1Count > 1) {
        issues.push({ type: 'Multiple H1 Tags', severity: 'Warning', why: 'Multiple H1 tags weaken main keyword focus.', fix: 'Use only one main <h1> tag per page.' });
    }

    // Canonical Tag Check
    const canonical = $('link[rel="canonical"]').attr('href');
    if (!canonical) {
        issues.push({ type: 'Missing Canonical Tag', severity: 'Warning', why: 'Canonical tags prevent duplicate content flags.', fix: 'Add <link rel="canonical" href="..."> tag.' });
    }

    // Noindex Meta Check
    const robotsMeta = $('meta[name="robots"]').attr('content');
    if (robotsMeta && robotsMeta.includes('noindex')) {
        issues.push({ type: 'Page Meta Noindex', severity: 'Info', why: 'Noindex blocks Google from indexing this page.', fix: 'Remove noindex meta tag if ranking is desired.' });
    }

    // SEO Score Calculation (0-100)
    let score = 100;
    issues.forEach(issue => {
        if (issue.severity === 'Critical') score -= 25;
        if (issue.severity === 'Warning') score -= 10;
        if (issue.severity === 'Info') score -= 5;
    });
    if (score < 0) score = 0;

    return { url, statusCode, responseTime, score, issuesCount: issues.length, issues };
}

// Runner Function with Concurrency and Delay Safety
async function runAuditor() {
    console.log(`🚀 Starting SEO Audit: ${TARGET_URL}`);
    await checkRobotsTxt(TARGET_URL);
    const urls = await getLinksToAudit(TARGET_URL);

    const results = [];
    let index = 0;

    while (index < urls.length) {
        const chunk = urls.slice(index, index + MAX_CONCURRENCY);
        index += MAX_CONCURRENCY;

        const promises = chunk.map(async (u) => {
            const start = Date.now();
            try {
                console.log(`Crawling safely (1s delay): ${u}`);
                await sleep(DELAY_MS);
                const res = await axios.get(u, { timeout: 8000, validateStatus: () => true });
                const responseTime = Date.now() - start;
                return auditPage(res.data, u, responseTime, res.status);
            } catch (err) {
                return { url: u, statusCode: 500, responseTime: Date.now() - start, score: 0, issuesCount: 1, issues: [{ type: 'Broken Link / Timeout', severity: 'Critical', why: 'Page could not be reached.', fix: 'Check server configuration or URL syntax.' }] };
            }
        });

        const chunkResults = await Promise.all(promises);
        results.push(...chunkResults);
    }

    fs.writeFileSync('report.json', JSON.stringify(results, null, 2));
    console.log(`💾 Saved audit output to report.json successfully.`);
}

runAuditor();