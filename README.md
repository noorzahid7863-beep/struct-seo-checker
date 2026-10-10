# Website SEO & Link Health Checker

A automated Node.js tool and web dashboard designed to audit website pages, check SEO health (Titles, Meta descriptions, H1 tags, image Alt texts), and detect broken links.

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
   git clone [https://github.com/noorzahid7863/seo-link-checker.git](https://github.com/noorzahid7863/seo-link-checker.git)
   cd seo-checker