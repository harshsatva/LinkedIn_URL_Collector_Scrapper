# This script creates a starter project for a controlled LinkedIn profile scraper,
# following safe-use guardrails: manual login, public/consented profiles only,
# slow rate limiting, and local-only storage.

import os
import textwrap
import json
import zipfile
import io
import pandas as pd
import numpy as np
import pathlib
import re
import sys
import random


def create_linkedin_scraper_project():
    """Creates a complete LinkedIn scraper project with all necessary files."""
    
    project_dir = "linkedin_scraper_starter"
    os.makedirs(project_dir, exist_ok=True)

    # README.md content
    readme = """# Controlled LinkedIn Profile Scraper (Testing Only)

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
"""

    # requirements.txt content
    requirements = """selenium==4.21.0
pandas==2.2.2
openpyxl==3.1.2
"""

    # profiles.csv content
    profiles_csv = """url
https://www.linkedin.com/in/example-profile-1/
https://www.linkedin.com/in/example-profile-2/
"""

    # scraper.py content
    scraper_py = '''import time
import random
import sys
from typing import List, Dict
import pandas as pd

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# ---------------------------
# Guardrails & configuration
# ---------------------------
MIN_DELAY_SECONDS = 45
MAX_DELAY_SECONDS = 75
PAGE_LOAD_TIMEOUT = 30
IMPLICIT_WAIT = 5

def wait_for_user_login(driver):
    """Wait for manual user login to LinkedIn."""
    print("A Chrome window has opened. Please log in to LinkedIn with your test account.")
    print("After completing login and landing on your LinkedIn homepage, return here and press ENTER.")
    input("Press ENTER to continue... ")

def human_delay():
    """Add random delay between requests to mimic human behavior."""
    time.sleep(random.uniform(MIN_DELAY_SECONDS, MAX_DELAY_SECONDS))

def init_driver() -> webdriver.Chrome:
    """Initialize Chrome webdriver with appropriate settings."""
    chrome_options = Options()
    # Use a normal (non-headless) browser to keep behavior closer to a real user.
    chrome_options.add_argument("--start-maximized")
    # You can specify a user-data-dir if you want persistent login, but for testing we keep it simple.
    driver = webdriver.Chrome(options=chrome_options)
    driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
    driver.implicitly_wait(IMPLICIT_WAIT)
    return driver

def safe_text(element):
    """Safely extract text from element."""
    try:
        return element.text.strip()
    except Exception:
        return ""

def extract_profile(driver) -> Dict[str, str]:
    """
    Best-effort extraction using stable-ish selectors from the 'top card' of a LinkedIn profile.
    LinkedIn changes DOM frequently, so we look for common aria-labels and data-test attributes where possible.
    """
    data = {
        "name": "",
        "headline": "",
        "location": "",
        "current_position": "",
        "profile_url": driver.current_url
    }

    # Name (commonly in h1 or [data-test-id='profile-name']-like)
    try:
        # Try several fallbacks
        candidates = [
            (By.CSS_SELECTOR, "h1"),
            (By.CSS_SELECTOR, "div.ph5.pb5 div.mt2 h1"),
            (By.CSS_SELECTOR, "div.feed-identity-module__actor-meta a span[dir='ltr']"),
        ]
        for by, sel in candidates:
            elems = driver.find_elements(by, sel)
            if elems and safe_text(elems[0]):
                data["name"] = safe_text(elems[0])
                break
    except Exception:
        pass

    # Headline
    try:
        candidates = [
            (By.CSS_SELECTOR, "div.text-body-medium.break-words"),
            (By.CSS_SELECTOR, "div.mt2 h2"),
            (By.CSS_SELECTOR, "div.ph5.pb5 div.mt2 div.text-body-medium")
        ]
        for by, sel in candidates:
            elems = driver.find_elements(by, sel)
            if elems and safe_text(elems[0]):
                data["headline"] = safe_text(elems[0])
                break
    except Exception:
        pass

    # Location
    try:
        candidates = [
            (By.CSS_SELECTOR, "span.text-body-small.inline.t-black--light.break-words"),
            (By.CSS_SELECTOR, "li.t-16.t-black.t-normal.inline-block"),
            (By.XPATH, "//span[contains(@class,'text-body-small') and contains(., ',')][1]"),
        ]
        for by, sel in candidates:
            elems = driver.find_elements(by, sel)
            if elems and safe_text(elems[0]):
                data["location"] = safe_text(elems[0])
                break
    except Exception:
        pass

    # Current position (very heuristic)
    try:
        candidates = [
            (By.XPATH, "//div[contains(@class,'pv-text-details__left-panel')]//div[contains(@class,'text-body-medium')][1]"),
            (By.XPATH, "//div[contains(@class,'pv-text-details__right-panel')]//span[contains(@class,'inline-show-more-text')]"),
            (By.CSS_SELECTOR, "div.pv-text-details__left-panel div.text-body-medium"),
        ]
        for by, sel in candidates:
            elems = driver.find_elements(by, sel)
            if elems and safe_text(elems[0]):
                data["current_position"] = safe_text(elems[0])
                break
    except Exception:
        pass

    return data

def visit_profile(driver, url: str) -> Dict[str, str]:
    """Visit a LinkedIn profile and extract data."""
    print(f"Visiting: {url}")
    driver.get(url)
    
    # Wait for the main content container to be present or time out gracefully
    try:
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
    except Exception:
        print("Page load timed out or failed; continuing.")
    
    # Extraction
    profile = extract_profile(driver)
    print(f"Extracted: {profile}")
    return profile

def main():
    """Main function to run the scraper."""
    # Load URLs from CSV
    df = pd.read_csv("profiles.csv")
    urls = [u for u in df["url"].dropna().tolist() if isinstance(u, str) and u.strip().startswith("http")]
    
    if not urls:
        print("No URLs found in profiles.csv under column 'url'. Exiting.")
        sys.exit(0)

    driver = init_driver()

    # Navigate to LinkedIn and wait for manual login
    driver.get("https://www.linkedin.com/")
    wait_for_user_login(driver)

    results = []
    for i, url in enumerate(urls, 1):
        try:
            profile = visit_profile(driver, url.strip())
            results.append(profile)
        except Exception as e:
            print(f"Error on {url}: {e}")
        
        # Rate limiting to reduce risk and load
        if i < len(urls):
            print(f"Sleeping before next profile... ({MIN_DELAY_SECONDS}-{MAX_DELAY_SECONDS}s)")
            human_delay()

    driver.quit()

    # Save to Excel
    out_df = pd.DataFrame(results)
    out_path = "output.xlsx"
    out_df.to_excel(out_path, index=False)
    print(f"Saved {len(out_df)} rows to {out_path}")

if __name__ == "__main__":
    main()
'''

    # run.sh content
    run_sh = """#!/usr/bin/env bash
python scraper.py
"""

    # run.bat content
    run_bat = r"""@echo off
python scraper.py
pause
"""

    # Write all files
    files_to_create = {
        "README.md": readme,
        "requirements.txt": requirements,
        "profiles.csv": profiles_csv,
        "scraper.py": scraper_py,
        "run.sh": run_sh,
        "run.bat": run_bat
    }

    for filename, content in files_to_create.items():
        with open(os.path.join(project_dir, filename), "w", encoding="utf-8") as f:
            f.write(content)

    # Create zip file
    zip_path = "linkedin_scraper_starter.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(project_dir):
            for name in files:
                full = os.path.join(root, name)
                arc = os.path.relpath(full, project_dir)
                z.write(full, arcname=f"linkedin_scraper_starter/{arc}")

    return zip_path

# Execute the function
if __name__ == "__main__":
    zip_path = create_linkedin_scraper_project()
    print(f"LinkedIn scraper project created and zipped at: {zip_path}")