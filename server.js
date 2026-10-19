const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DELAY_MS = 1000; // 1 second safety delay
const MAX_CONCURRENCY = 2; // Max 2 concurrent requests

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Check Robots.txt
async function checkRobotsTxt(baseUrl) {
    try {
        const parsedUrl = new URL(baseUrl);
        const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
        await axios.get(robotsUrl, { timeout: 5000 });
    } catch (error) {
        // Ignored or bypassed gracefully
    }
}

// Relative to Absolute URL conversion & Same-Domain Link Extraction
async function getLinksToAudit(startUrl) {
    let urls = [startUrl];
    const targetParsed = new URL(startUrl);

    try {
        const homeRes = await axios.get(startUrl, { timeout: 8000 });
        const $ = cheerio.load(homeRes.data);

        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href) {
                try {
                    // Convert relative links (/titles/...) to full absolute URLs
                    const fullUrl = new URL(href, startUrl);

                    // Restrict to same domain only
                    if (fullUrl.hostname === targetParsed.hostname && (fullUrl.protocol === 'http:' || fullUrl.protocol === 'https:')) {
                        urls.push(fullUrl.href);
                    }
                } catch (e) {
                    // Invalid URL format ignored
                }
            }
        });

        // Deduplicate and limit to max 15 links
        urls = [...new Set(urls)].slice(0, 15);
    } catch (err) {
        console.log(`❌ Link extraction failed for ${startUrl}`);
    }

    return urls;
}

// SEO Audit Engine
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

    // H1 Check
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

    // SEO Score Calculation
    let score = 100;
    issues.forEach(issue => {
        if (issue.severity === 'Critical') score -= 25;
        if (issue.severity === 'Warning') score -= 10;
        if (issue.severity === 'Info') score -= 5;
    });
    if (score < 0) score = 0;

    return { url, statusCode, responseTime, score, issuesCount: issues.length, issues };
}

// POST API Endpoint /api/scan
app.post('/api/scan', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        await checkRobotsTxt(url);
        const urls = await getLinksToAudit(url);

        const results = [];
        let index = 0;

        while (index < urls.length) {
            const chunk = urls.slice(index, index + MAX_CONCURRENCY);
            index += MAX_CONCURRENCY;

            const promises = chunk.map(async (targetUrl) => {
                const start = Date.now();
                try {
                    await sleep(DELAY_MS);
                    const response = await axios.get(targetUrl, { timeout: 8000, validateStatus: () => true });
                    const responseTime = Date.now() - start;
                    return auditPage(response.data, targetUrl, responseTime, response.status);
                } catch (err) {
                    return {
                        url: targetUrl,
                        statusCode: 500,
                        responseTime: Date.now() - start,
                        score: 0,
                        issuesCount: 1,
                        issues: [{ type: 'Broken Link / Timeout', severity: 'Critical', why: 'Page unreachable.', fix: 'Check URL/Server.' }]
                    };
                }
            });

            const chunkResults = await Promise.all(promises);
            results.push(...chunkResults);
        }

        return res.json({ success: true, totalChecked: results.length, data: results });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to complete SEO scan.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:3000`);
});