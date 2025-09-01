# Controlled LinkedIn Profile Scraper (Testing Only)

**Purpose:** For controlled testing on public or fully consented profiles only, using your *test* LinkedIn account.
No evasion techniques, no CAPTCHA bypass, no scraping private data, and no resale/sharing of data.
This tool simply reads visible information from profiles you manually open by URL.

## What it does
- Uses Selenium to open Chrome.
- You **log in manually** to LinkedIn once.
- Visits a list of profile URLs (from `profiles.csv`) at a slow, human-like pace.
- Extracts very basic, visible profile fields: name, headline, location, current position (best-effort).
- Saves results locally to `output.xlsx`.

## What it does *not* do
- It does **not** bypass LinkedIn's security or ToS.
- It does **not** fetch hidden/private contact info (emails, phones).
- It does **not** solve CAPTCHAs or rotate fingerprints/IPs.

## Quick start
1. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Prepare your URLs**
   Put LinkedIn profile URLs you have permission to view in `profiles.csv` under the `url` column.

3. **Run**
   ```bash
   python scraper.py
   ```

4. **Manual login step**
   - A Chrome window will open to LinkedIn.
   - Log in with your test account.
   - Return to the terminal and press Enter when you are fully logged in.

5. **Output**
   Check `output.xlsx` for the exported data.

## Notes
- CSS selectors can change. This script uses conservative, best-effort selectors.
- Keep the default rate limits (45–75s between profiles) during testing.
- Use responsibly and lawfully. You are responsible for complying with LinkedIn's Terms and applicable laws.
