# Website SEO & Link Health Checker

An automated Node.js tool and web dashboard designed to audit website pages, check SEO health (Titles, Meta descriptions, H1 tags, image Alt texts), and detect broken links.

---

## 🚀 What the Tool Does
- **Crawls Website:** Automatically reads the sitemap (`sitemap.xml`) or falls back to scraping internal links from the homepage (up to 50 pages).
- **Concurrency Queue:** Uses a queue system to fetch a maximum of 3 pages at a time to prevent server overload.
- **SEO Audits:** Checks for:
  - Missing or overly long page titles (>60 chars)
  - Missing or overly long meta descriptions (>160 chars)
  - Missing or multiple H1 tags
  - Images missing `alt` text
  - Broken internal links (HTTP 404/500 errors)
- **Reports:** Generates summary reports in the terminal and saves full data into `report.json` and `report.csv`.
- **UI Dashboard:** Provides a clean HTML/JS interface with search and filter options.

---

## 🛠️ How to Run It

1. **Clone the Repository:**
   ```bash
   git clone [https://github.com/noorzahid7863-beep/struct-seo-checker.git](https://github.com/noorzahid7863-beep/struct-seo-checker.git)
   cd seo-checker

   ---

## 🚀 Future Improvements

To scale this tool from a local development script into an enterprise-grade SEO auditing suite, the following enhancements are planned for future releases:

1. **Deep Crawling & Recursive Discovery:**
   - Move beyond static sitemaps by implementing recursive link extraction to audit deep nested internal pages dynamically.

2. **Headless Browser Integration (Puppeteer / Playwright):**
   - Support Client-Side Rendered (CSR) applications, Single Page Applications (SPAs), and dynamic JavaScript-injected meta tags.

3. **Scheduled Audits & Alerting System:**
   - Implement automated cron jobs to trigger recurring scans and send alerts via Email, Slack, or Webhooks when critical broken links are detected.

4. **Performance & Core Web Vitals:**
   - Integrate Google Lighthouse API metrics (LCP, FID, CLS) alongside structural SEO tag evaluations.

5. **Database Persistence & Historical Reports:**
   - Store historical report snapshots in a PostgreSQL/MongoDB database to track SEO improvements and score trends over time.