import time
import random
import sys
from typing import List, Dict
import pandas as pd
import os

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import WebDriverException, TimeoutException

# ---------------------------
# Guardrails & configuration
# ---------------------------
MIN_DELAY_SECONDS = 20  # Increased for contact info extraction
MAX_DELAY_SECONDS = 40
PAGE_LOAD_TIMEOUT = 30
IMPLICIT_WAIT = 4

def human_delay():
    """Random delay to mimic human behavior."""
    delay = random.uniform(MIN_DELAY_SECONDS, MAX_DELAY_SECONDS)
    print(f"Waiting {delay:.1f} seconds...")
    time.sleep(delay)

def init_driver() -> webdriver.Chrome:
    """Initialize Chrome with fallback options."""
    chrome_options = Options()
    
    # Basic options that usually work
    chrome_options.add_argument("--start-maximized")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    
    # Try different approaches in order of preference
    approaches = [
        # # Approach 1: Use existing profile (if Chrome is closed)
        # {
        #     "name": "existing profile",
        #     "options": [
        #         r"--user-data-dir=C:\Users\Harsh\AppData\Local\Google\Chrome\User Data",
        #         r"--profile-directory=Profile 1"
        #     ]
        # },
        # Approach 2: Create temporary profile
        {
            "name": "temporary profile", 
            "options": [
                f"--user-data-dir={os.getcwd()}\\temp_chrome_profile",
                "--profile-directory=Default"
            ]
        },
        # Approach 3: Default (no profile)
        {
            "name": "default",
            "options": []
        }
    ]
    
    for approach in approaches:
        try:
            print(f"Trying to start Chrome with {approach['name']}...")
            
            # Create fresh options for each attempt
            options = Options()
            options.add_argument("--start-maximized")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option('useAutomationExtension', False)
            
            # Add approach-specific options
            for arg in approach["options"]:
                options.add_argument(arg)
            
            driver = webdriver.Chrome(options=options)
            driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
            driver.implicitly_wait(IMPLICIT_WAIT)
            
            # Test if driver works
            driver.get("https://www.google.com")
            print(f"✅ Successfully started Chrome with {approach['name']}")
            return driver
            
        except WebDriverException as e:
            print(f"❌ Failed with {approach['name']}: {str(e)[:100]}...")
            if 'driver' in locals():
                try:
                    driver.quit()
                except:
                    pass
            continue
    
    # If all approaches fail
    print("❌ All Chrome startup approaches failed. Please try:")
    print("1. Close all Chrome windows completely")
    print("2. Check if ChromeDriver is installed and in PATH")
    print("3. Update Chrome and ChromeDriver to compatible versions")
    sys.exit(1)

def safe_text(element):
    """Safely extract text from element."""
    try:
        return element.text.strip()
    except:
        return ""

def wait_for_manual_login(driver):
    """Wait for user to manually log in."""
    print("\n" + "="*60)
    print("🔐 MANUAL LOGIN REQUIRED")
    print("="*60)
    print("The browser is now open. Please:")
    print("1. Log in to LinkedIn manually")
    print("2. Navigate to your LinkedIn homepage")
    print("3. Come back here and press ENTER when ready")
    print("="*60)
    input("Press ENTER after you've logged in to LinkedIn... ")
    print("Continuing with profile scraping...\n")

def extract_contact_info(driver) -> Dict[str, str]:
    """Extract publicly available contact information."""
    contact_data = {
        "email": "",
        "phone": "",
        "website": "",
        "social_links": ""
    }
    
    # Try to click on "Contact info" if available
    try:
        # Look for contact info button/link
        contact_selectors = [
            "a[data-control-name='contact_see_more']",
            "button[aria-label*='contact']",
            "#top-card-text-details-contact-info",
            "a[href*='contact']",
            ".pv-contact-info__contact-type"
        ]
        
        contact_clicked = False
        for selector in contact_selectors:
            try:
                contact_button = driver.find_element(By.CSS_SELECTOR, selector)
                if contact_button.is_displayed():
                    driver.execute_script("arguments[0].click();", contact_button)
                    time.sleep(2)  # Wait for contact info to load
                    contact_clicked = True
                    break
            except:
                continue
        
        if contact_clicked:
            # Extract contact information from modal or expanded section
            try:
                # Email
                email_selectors = [
                    "a[href^='mailto:']",
                    ".pv-contact-info__contact-type .pv-contact-info__ci-container a",
                    ".ci-email .pv-contact-info__contact-link"
                ]
                
                for selector in email_selectors:
                    try:
                        email_elem = driver.find_element(By.CSS_SELECTOR, selector)
                        email_text = safe_text(email_elem)
                        if "@" in email_text:
                            contact_data["email"] = email_text
                            break
                        # Also check href attribute
                        href = email_elem.get_attribute("href")
                        if href and "mailto:" in href:
                            contact_data["email"] = href.replace("mailto:", "")
                            break
                    except:
                        continue
                
                # Phone
                phone_selectors = [
                    "a[href^='tel:']",
                    ".ci-phone .pv-contact-info__contact-link",
                    ".pv-contact-info__contact-type:contains('Phone') + .pv-contact-info__ci-container"
                ]
                
                for selector in phone_selectors:
                    try:
                        phone_elem = driver.find_element(By.CSS_SELECTOR, selector)
                        phone_text = safe_text(phone_elem)
                        if phone_text and any(char.isdigit() for char in phone_text):
                            contact_data["phone"] = phone_text
                            break
                        # Also check href attribute
                        href = phone_elem.get_attribute("href")
                        if href and "tel:" in href:
                            contact_data["phone"] = href.replace("tel:", "")
                            break
                    except:
                        continue
                
                # Website/Personal links
                website_selectors = [
                    ".ci-websites .pv-contact-info__contact-link",
                    "a[href^='http']:not([href*='linkedin.com'])",
                    ".pv-contact-info__contact-type .pv-contact-info__ci-container a[href^='http']"
                ]
                
                websites = []
                for selector in website_selectors:
                    try:
                        website_elems = driver.find_elements(By.CSS_SELECTOR, selector)
                        for elem in website_elems:
                            href = elem.get_attribute("href")
                            if href and "linkedin.com" not in href and href.startswith("http"):
                                websites.append(href)
                    except:
                        continue
                
                if websites:
                    contact_data["website"] = "; ".join(websites[:3])  # Limit to first 3
                
            except Exception as e:
                print(f"   ⚠️ Error extracting contact details: {e}")
        
        # Close contact modal if it was opened
        try:
            close_selectors = [
                "button[aria-label='Dismiss']",
                ".artdeco-modal__dismiss",
                "button.artdeco-button--circle"
            ]
            for selector in close_selectors:
                try:
                    close_btn = driver.find_element(By.CSS_SELECTOR, selector)
                    if close_btn.is_displayed():
                        close_btn.click()
                        time.sleep(1)
                        break
                except:
                    continue
        except:
            pass
            
    except Exception as e:
        print(f"   ⚠️ Could not access contact info: {e}")
    
    return contact_data

def extract_top_card(driver) -> Dict[str, str]:
    """Extract basic profile information from the top card."""
    data = {
        "name": "",
        "headline": "",
        "location": "",
        "current_position": "",
        "profile_url": driver.current_url
    }

    # Name - try multiple selectors
    name_selectors = [
        "h1",
        "div.text-heading-xlarge",
        "h1.text-heading-xlarge"
    ]
    
    for selector in name_selectors:
        try:
            name = driver.find_element(By.CSS_SELECTOR, selector)
            text = safe_text(name)
            if text and len(text) > 1:  # Basic validation
                data["name"] = text
                break
        except:
            continue

    # Headline
    headline_selectors = [
        "div.text-body-medium.break-words",
        "div.ph5 div.text-body-medium",
        ".pv-text-details__left-panel .text-body-medium"
    ]
    
    for selector in headline_selectors:
        try:
            headline = driver.find_element(By.CSS_SELECTOR, selector)
            text = safe_text(headline)
            if text and len(text) > 1:
                data["headline"] = text
                break
        except:
            continue

    # Location
    location_selectors = [
        "span.text-body-small.inline.t-black--light.break-words",
        ".pv-text-details__left-panel .pb2 .text-body-small",
        "div.ph5 span.text-body-small"
    ]
    
    for selector in location_selectors:
        try:
            location = driver.find_element(By.CSS_SELECTOR, selector)
            text = safe_text(location)
            if text and len(text) > 1:
                data["location"] = text
                break
        except:
            continue

    return data

def extract_experience(driver) -> List[str]:
    """Extract experience information."""
    experiences = []
    try:
        # Try to find experience section
        exp_selectors = [
            "#experience ~ div li",
            ".pv-profile-section.experience li",
            "section[data-section='experience'] li"
        ]
        
        for selector in exp_selectors:
            try:
                sections = driver.find_elements(By.CSS_SELECTOR, selector)
                if sections:
                    for sec in sections[:5]:  # Limit to first 5 experiences
                        try:
                            role = safe_text(sec.find_element(By.CSS_SELECTOR, "h3, .mr1.t-bold"))
                            company = safe_text(sec.find_element(By.CSS_SELECTOR, "p, .pv-entity__secondary-title"))
                            if role and company:
                                experiences.append(f"{role} at {company}")
                        except:
                            continue
                    break
            except:
                continue
    except:
        pass
    return experiences

def visit_profile(driver, url: str) -> Dict[str, str]:
    """Visit a LinkedIn profile and extract data."""
    print(f"🔍 Visiting: {url}")
    
    try:
        driver.get(url)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "main"))
        )
        
        # Small delay to let page fully load
        time.sleep(3)
        
    except TimeoutException:
        print("⚠️  Page load timeout; continuing with extraction...")
    except Exception as e:
        print(f"⚠️  Error loading page: {e}")
        return {"error": str(e), "profile_url": url}

    # Extract profile data
    profile = extract_top_card(driver)
    
    # Extract contact information
    print("   📞 Extracting contact info...")
    contact_info = extract_contact_info(driver)
    profile.update(contact_info)
    
    # Extract experience
    experiences = extract_experience(driver)
    if experiences:
        profile["experience"] = "; ".join(experiences)
    else:
        profile["experience"] = ""

    print(f"✅ Extracted: {profile['name']} - {profile['headline'][:50]}...")
    if profile['email']:
        print(f"   📧 Email: {profile['email']}")
    if profile['phone']:
        print(f"   📱 Phone: {profile['phone']}")
    
    return profile

def main():
    """Main function to run the scraper."""
    print("🚀 LinkedIn Profile Scraper Starting...")
    
    # Load URLs from CSV
    try:
        df = pd.read_csv("profiles.csv")
        urls = [u for u in df["url"].dropna().tolist() 
               if isinstance(u, str) and u.strip().startswith("http")]
    except FileNotFoundError:
        print("❌ profiles.csv not found. Please create it with a 'url' column.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error reading profiles.csv: {e}")
        sys.exit(1)

    if not urls:
        print("❌ No valid URLs found in profiles.csv. Exiting.")
        sys.exit(1)
    
    print(f"📋 Found {len(urls)} profiles to scrape")

    # Initialize driver
    driver = init_driver()
    
    try:
        # Navigate to LinkedIn
        print("🌐 Opening LinkedIn...")
        driver.get("https://www.linkedin.com/")
        
        # Wait for manual login
        wait_for_manual_login(driver)

        results = []
        for i, url in enumerate(urls, 1):
            print(f"\n📊 Processing profile {i}/{len(urls)}")
            
            try:
                profile = visit_profile(driver, url.strip())
                results.append(profile)
            except Exception as e:
                print(f"❌ Error processing {url}: {e}")
                results.append({"error": str(e), "profile_url": url})

            # Rate limiting between profiles
            if i < len(urls):
                print(f"⏳ Rate limiting...")
                human_delay()

        # Save results
        print(f"\n💾 Saving results...")
        # out_df = pd.DataFrame(results)
        # output_file = "output.xlsx"
        # out_df.to_excel(output_file, index=False)
        output_file = "output.xlsx"
        out_df = pd.DataFrame(results)

        # If output.xlsx already exists, append new results
        if os.path.exists(output_file):
            old_df = pd.read_excel(output_file)
            final_df = pd.concat([old_df, out_df], ignore_index=True)
        else:
            final_df = out_df

        final_df.to_excel(output_file, index=False)
        print(f"✅ Saved {len(final_df)} total profiles to {output_file}")
        
        # Show summary
        successful = len([r for r in results if "error" not in r])
        print(f"\n📈 Summary: {successful}/{len(urls)} profiles scraped successfully")

    finally:
        print("🔄 Closing browser...")
        driver.quit()

if __name__ == "__main__":
    main()