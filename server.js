const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // public folder se frontend files serve hongi

const DELAY_MS = 1000;
const MAX_CONCURRENCY = 2;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Relative links ko Full URL mein convert karna (Sir ki requirement)
function getAbsoluteUrl(href, baseUrl) {
    try {
        const parsedBase = new URL(baseUrl);
        const resolvedUrl = new URL(href, baseUrl);
        // Sirf same domain ke links allow karein
        if (resolvedUrl.hostname === parsedBase.hostname) {
            return resolvedUrl.href;
        }
    } catch (e) {
        return null;
    }
    return null;
}

// Internal Links extract karne ka logic
async function extractSameDomainLinks(startUrl) {
    let urls = [startUrl];
    try {
        const response = await axios.get(startUrl, { timeout: 8000 });
        const $= cheerio.load(response.data);$('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href) {
                const absUrl = getAbsoluteUrl(href, startUrl);
                if (absUrl && !urls.includes(absUrl)) {
                    urls.push(absUrl);
                }
            }
        });
    } catch (err) {
        console.log(`Failed to fetch initial URL: ${startUrl}`);
    }
    return urls.slice(0, 15); // Max 15 pages for quick scan
}

// SEO Audit Logic
function auditPage(html, url, responseTime, statusCode) {
    const $ = cheerio.load(html);
    const issues = [];

    const title = $('title').text().trim();
    if (!title) {
        issues.push({ type: 'Missing Title', severity: 'Critical', why: 'Search engines need titles.', fix: 'Add <title> tag inside <head>.' });
    }

    const metaDesc = $('meta[name="description"]').attr('content');
    if (!metaDesc) {
        issues.push({ type: 'Missing Meta Description', severity: 'Critical', why: 'Meta descriptions improve CTR.', fix: 'Add <meta name="description"> tag.' });
    }

    const h1Count = $('h1').length;
    if (h1Count === 0) {
        issues.push({ type: 'Missing H1 Tag', severity: 'Critical', why: 'H1 defines page topic.', fix: 'Add one <h1> heading.' });
    }

    let missingAltCount = 0;
    $('img').each((i, img) => {
        if (!$(img).attr('alt')) missingAltCount++;
    });
    if (missingAltCount > 0) {
        issues.push({ type: 'Images Missing Alt Text', severity: 'Info', why: 'Alt text improves accessibility.', fix: 'Add alt attributes to images.' });
    }

    const canonical = $('link[rel="canonical"]').attr('href');
    if (!canonical) {
        issues.push({ type: 'Missing Canonical Tag', severity: 'Warning', why: 'Prevents duplicate content.', fix: 'Add <link rel="canonical">.' });
    }

    let score = 100;
    issues.forEach(issue => {
        if (issue.severity === 'Critical') score -= 25;
        if (issue.severity === 'Warning') score -= 10;
        if (issue.severity === 'Info') score -= 5;
    });
    if (score < 0) score = 0;

    return { url, statusCode, responseTime: `${responseTime} ms`, score, issuesCount: issues.length, issues };
}

// API Route for Scanning (POST /api/scan)
app.post('/api/scan', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const urlsToScan = await extractSameDomainLinks(url);
        const results = [];
        let index = 0;

        while (index < urlsToScan.length) {
            const chunk = urlsToScan.slice(index, index + MAX_CONCURRENCY);
            index += MAX_CONCURRENCY;

            const promises = chunk.map(async (u) => {
                const start = Date.now();
                try {
                    await sleep(DELAY_MS);
                    const response = await axios.get(u, { timeout: 8000, validateStatus: () => true });
                    const responseTime = Date.now() - start;
                    return auditPage(response.data, u, responseTime, response.status);
                } catch (err) {
                    return { url: u, statusCode: 500, responseTime: '0 ms', score: 0, issuesCount: 1, issues: [{ type: 'Broken / Unreachable', severity: 'Critical', why: 'Page unreachable.', fix: 'Check server.' }] };
                }
            });

            const chunkResults = await Promise.all(promises);
            results.push(...chunkResults);
        }

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: 'Failed to scan website' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});