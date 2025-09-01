import time
import random
import sys
from typing import Dict
import pandas as pd
import os
from urllib.parse import urlparse

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
MIN_DELAY_SECONDS = 3
MAX_DELAY_SECONDS = 4
PAGE_LOAD_TIMEOUT = 10
IMPLICIT_WAIT = 2
LINKEDIN_URL = "https://www.linkedin.com/"
SALES_NAVIGATOR_URL = "https://www.linkedin.com/sales/"

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
        {
            "name": "temporary profile", 
            "options": [
                f"--user-data-dir={os.getcwd()}\\temp_chrome_profile",
                "--profile-directory=Default"
            ]
        },
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
            print(f"Successfully started Chrome with {approach['name']}")
            return driver
            
        except WebDriverException as e:
            print(f"Failed with {approach['name']}: {str(e)[:100]}...")
            if 'driver' in locals():
                try:
                    driver.quit()
                except:
                    pass
            continue
    
    print("All Chrome startup approaches failed. Please try:")
    print("1. Close all Chrome windows completely")
    print("2. Check if ChromeDriver is installed and in PATH")
    print("3. Update Chrome and ChromeDriver to compatible versions")
    sys.exit(1)

def safe_text(element):
    """Safely extract text from an element"""
    try:
        return element.text.strip() if element and element.text else ""
    except:
        return ""

def is_sales_navigator_url(url: str) -> bool:
    """Check if the URL is a Sales Navigator URL."""
    parsed_url = urlparse(url)
    return "sales" in parsed_url.netloc or "sales" in parsed_url.path

def wait_for_manual_login(driver, is_sales_navigator: bool = False):
    """Wait for user to manually log in to LinkedIn or Sales Navigator."""
    target_url = SALES_NAVIGATOR_URL if is_sales_navigator else LINKEDIN_URL
    print("\n" + "="*60)
    print(f"MANUAL LOGIN REQUIRED {'(Sales Navigator)' if is_sales_navigator else '(LinkedIn)'}")
    print("="*60)
    print(f"The browser is now open. Please:")
    print(f"1. Log in to {'Sales Navigator' if is_sales_navigator else 'LinkedIn'} manually")
    print(f"2. Navigate to {'Sales Navigator homepage' if is_sales_navigator else 'LinkedIn homepage'}")
    print("3. Come back here and press ENTER when ready")
    print("="*60)
    driver.get(target_url)
    input("Press ENTER after you've logged in... ")
    print("Continuing with profile scraping...\n")

def extract_about_section(driver, is_sales_navigator: bool = False) -> str:
    """Extract the About section text, handling expansion if needed."""
    about_text = ""
    
    try:
        if is_sales_navigator:
            # Sales Navigator: Click "Show more" if present
            show_more_selectors = [
                "button._ellipsis-button_1d1vlq",
                "button[id^='ellipsis-button-']",
                "button[data-test-expand-button]",
                "#about-section button[type='button']",
                "button:contains('Show more')"
            ]
            clicked = False
            for selector in show_more_selectors:
                try:
                    btn = driver.find_element(By.CSS_SELECTOR, selector)
                    if btn.is_displayed():
                        driver.execute_script("arguments[0].click();", btn)
                        time.sleep(1)
                        clicked = True
                        print("   → Clicked 'Show more' in Sales Navigator About section")
                        break
                except:
                    continue
            
            # Extract full text (post-expansion)
            text_selectors = [
                "div[data-anonymize='person-blurb']",
                "#about-section div._content-width_1dtbsb",
                "div[id*='clamped-content']",
                "._about-section_1dtbsb ._bodyText_1e5nen"
            ]

            about_texts = []  # List to store all matching texts

            for selector in text_selectors:
                try:
                    elements = driver.find_elements(By.CSS_SELECTOR, selector)  # Use `find_elements` to get all matches
                    for elem in elements:
                        text = safe_text(elem)
                        if text and len(text) > 20:
                            # Clean residual button text if not clicked/expanded
                            cleaned_text = text.replace('… Show more', '').strip()
                            about_texts.append(cleaned_text)  # Append each cleaned text to the list
                except:
                    continue

            # Combine all collected texts into a single string (if needed)
            about_text = "\n\n".join(about_texts).strip()

            # Print the extracted data for debugging
            if about_text:
                print(f"   ✅ Extracted About: {about_text[:100]}...")
            else:
                print("   ⚠️ No About section data found.")
        
        else:
            # LinkedIn: Click "see more" if present
            show_more_selectors = [
                ".pv-about-section a.lt-line-clamp__more",
                "a.lt-line-clamp__more",
                "a[aria-label*='see more']",
                ".lt-line-clamp__more",
                "a:contains('see more')"
            ]
            clicked = False
            for selector in show_more_selectors:
                try:
                    btn = driver.find_element(By.CSS_SELECTOR, selector)
                    if btn.is_displayed():
                        driver.execute_script("arguments[0].click();", btn)
                        time.sleep(1)
                        clicked = True
                        print("   → Clicked 'see more' in LinkedIn About section")
                        break
                except:
                    continue
            
            # Extract full text (post-expansion)
            text_selectors = [
                ".pv-about__summary-text .lt-line-clamp__raw-line",
                "div.full-width.t-14.t-normal.t-black span[aria-hidden='true']",
                ".pv-about__summary-text",
                "div[class*='full-width t-14 t-normal t-black'] span[aria-hidden='true']",
                "div.qmdGMKYuIypnxyEHNTIvfxuATDBMXQom span[aria-hidden='true']",
                "div.FwOlsjQqkKryZHlZOACWZtVIHRMuhoM span"
            ]
            for selector in text_selectors:
                try:
                    elem = driver.find_element(By.CSS_SELECTOR, selector)
                    text = safe_text(elem)
                    if text and len(text) > 20:
                        about_text = text
                        break
                except:
                    continue
            
            # Fallback: Join multiple clamped lines if direct extraction fails
            if not about_text:
                try:
                    lines = driver.find_elements(By.CSS_SELECTOR, ".lt-line-clamp__raw-line, .lt-line-clamp__line")
                    if lines:
                        about_text = '\n'.join([safe_text(l) for l in lines if safe_text(l)]).strip()
                except:
                    pass
    
    except Exception as e:
        print(f"   ⚠️ Error extracting About section: {e}")
    
    # Clean up: Normalize multiple newlines/paragraphs (from <br><br>)
    if about_text:
        about_text = '\n\n'.join([para.strip() for para in about_text.split('\n\n') if para.strip()])
        print(f"   ✅ Extracted About: {about_text[:100]}...")
    
    return about_text

def scrape_company_info(driver, company_url: str) -> tuple:
    """
    Navigate to company URL and extract company name, website, and description information.
    Returns tuple: (company_name, website_url, company_description)
    """
    if not company_url:
        return "", "", ""
    
    try:
        print(f"   → Scraping company info from: {company_url}")
        
        # Store current URL to return later
        current_url = driver.current_url
        
        # Navigate to company page
        driver.get(company_url)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "main"))
        )
        time.sleep(2)
        
        company_name = ""
        website_url = ""
        company_description = ""
        
        # Extract company name from h1 element
        company_name_selectors = [
            "h1.org-top-card-summary__title",  # Main selector for LinkedIn company pages
            "h1[class*='org-top-card-summary__title']",  # Partial class match
            ".org-top-card-summary__title",  # Class selector
            "h1"  # Fallback to any h1
        ]
        
        for selector in company_name_selectors:
            try:
                company_name_elem = driver.find_element(By.CSS_SELECTOR, selector)
                company_name = safe_text(company_name_elem)
                if company_name:
                    print(f"   ✅ Found company name: {company_name}")
                    break
            except:
                continue
        
        # Look for website information
        website_selectors = [
            "a[href*='://']:not([href*='linkedin']):not([href*='mailto']):not([href*='tel'])",
            ".company-overview__website a",
            "[data-field='website'] a",
            ".company-info a[href*='://']:not([href*='linkedin'])",
            "a.link-without-visited-state:not([href*='linkedin'])",
            "a[href^='https://']:not([href*='linkedin.com'])",
            "a[href^='www.']"
        ]
        
        for selector in website_selectors:
            try:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                for element in elements:
                    href = element.get_attribute("href")
                    if href and not any(x in href.lower() for x in ['linkedin.com', 'mailto:', 'tel:', 'javascript:']):
                        if href.startswith('http'):
                            website_url = href
                            print(f"   ✅ Found website: {website_url}")
                            break
                if website_url:
                    break
            except:
                continue
        
        # Extract company description - NEW FUNCTIONALITY
        # Check if it's a Sales Navigator company page or regular LinkedIn company page
        is_sales_nav_company = "/sales/company/" in company_url
        
        if is_sales_nav_company:
            # Sales Navigator company description extraction
            try:
                # First, try to click "Show more" button to expand description
                show_more_selectors = [
                    "button[data-test-expand-button]",
                    "button[data-control-name='read_more_description']",
                    ".ellipsis-button",
                    "button:contains('Show more')"
                ]
                
                for btn_sel in show_more_selectors:
                    try:
                        show_more_btn = driver.find_element(By.CSS_SELECTOR, btn_sel)
                        if show_more_btn.is_displayed():
                            driver.execute_script("arguments[0].click();", show_more_btn)
                            time.sleep(1)
                            print("   → Clicked 'Show more' button for Sales Navigator description")
                            break
                    except:
                        continue
                
                # Sales Navigator description selectors (after expanding)
                sales_nav_desc_selectors = [
                    "p[data-anonymize='company-blurb']",  # Main selector for expanded description
                    "[data-anonymize='company-blurb']",   # Fallback
                    "._description-wrapper_mb60vc p",     # Container selector
                    ".pb1 p[data-anonymize='company-blurb']"  # More specific
                ]
                
                for selector in sales_nav_desc_selectors:
                    try:
                        desc_elem = driver.find_element(By.CSS_SELECTOR, selector)
                        desc_text = safe_text(desc_elem)
                        if desc_text and len(desc_text.strip()) > 20:
                            company_description = desc_text.strip()
                            print(f"   ✅ Found Sales Navigator description: {company_description[:100]}...")
                            break
                    except:
                        continue
                        
            except Exception as e:
                print(f"   ⚠️ Error extracting Sales Navigator description: {e}")
        else:
            # Regular LinkedIn company page description extraction
            try:
                # First, try to click "see more" button to expand description
                see_more_selectors = [
                    "a.lt-line-clamp__more",
                    "a[role='button']:contains('see more')",
                    ".lt-line-clamp__more",
                    "button[aria-label*='See more details']"
                ]
                
                for btn_sel in see_more_selectors:
                    try:
                        see_more_btn = driver.find_element(By.CSS_SELECTOR, btn_sel)
                        if see_more_btn.is_displayed():
                            driver.execute_script("arguments[0].click();", see_more_btn)
                            time.sleep(1)
                            print("   → Clicked 'see more' button for LinkedIn description")
                            break
                    except:
                        continue
                
                # LinkedIn description selectors (prioritizing the ones from your HTML)
                linkedin_desc_selectors = [
                    ".lt-line-clamp__raw-line",  # Main selector for expanded description
                    ".org-about-module__description .lt-line-clamp__raw-line",  # More specific
                    ".organization-about-module__content-consistant-cards-description .lt-line-clamp__raw-line",  # Most specific
                    ".org-about-module__description",  # Container fallback
                    ".organization-about-module__content-consistant-cards-description"  # Container fallback
                ]
                
                for selector in linkedin_desc_selectors:
                    try:
                        desc_elem = driver.find_element(By.CSS_SELECTOR, selector)
                        desc_text = safe_text(desc_elem)
                        if desc_text and len(desc_text.strip()) > 20:
                            company_description = desc_text.strip()
                            print(f"   ✅ Found LinkedIn description: {company_description[:100]}...")
                            break
                    except:
                        continue
                
                # If still no description found, try to extract from truncated version
                if not company_description:
                    truncated_selectors = [
                        ".lt-line-clamp__line",  # Individual lines before expansion
                        ".organization-about-module__content-consistant-cards-description span"
                    ]
                    
                    for selector in truncated_selectors:
                        try:
                            desc_elements = driver.find_elements(By.CSS_SELECTOR, selector)
                            if desc_elements:
                                # Combine all line elements
                                combined_text = " ".join([safe_text(elem) for elem in desc_elements if safe_text(elem)])
                                if combined_text and len(combined_text.strip()) > 20:
                                    company_description = combined_text.strip()
                                    print(f"   ✅ Found LinkedIn description (truncated): {company_description[:100]}...")
                                    break
                        except:
                            continue
                            
            except Exception as e:
                print(f"   ⚠️ Error extracting LinkedIn description: {e}")
        
        # Fallback: Generic description extraction if platform-specific methods fail
        if not company_description:
            try:
                fallback_selectors = [
                    "[data-test='about-us-description']",
                    ".about-us-company-module__description",
                    ".org-page-details__definition dd",
                    ".org-about-us__description",
                    "section[data-test='about-us'] p",
                    ".org-top-card-summary__description",
                    "[data-test='company-about-us'] p"
                ]
                
                for selector in fallback_selectors:
                    try:
                        desc_elements = driver.find_elements(By.CSS_SELECTOR, selector)
                        for desc_elem in desc_elements:
                            desc_text = safe_text(desc_elem)
                            if desc_text and len(desc_text.strip()) > 20:
                                company_description = desc_text.strip()
                                print(f"   ✅ Found description with fallback: {company_description[:100]}...")
                                break
                        if company_description:
                            break
                    except:
                        continue
            except:
                pass
        
        # Navigate back to original page
        driver.get(current_url)
        return company_name, website_url, company_description
        
    except Exception as e:
        print(f"   ❌ Error scraping company info: {str(e)}")
        try:
            driver.get(current_url)
        except:
            pass
        return "", "", ""

def extract_first_company_info(driver, is_sales_navigator: bool = False) -> Dict[str, str]:
    """
    Extract all experience information and first company details.
    Works for both LinkedIn and Sales Navigator profiles.
    """
    company_info = {
        "Company Name": "",
        "Company Url": "",
        "Company Website": "",
        "Company Description": "",
        "Experience": ""  # New field for full experience section
    }
    
    try:
        experience_entries = []  # List to store all experiences
        first_company_url = ""  # Store first company URL for later processing
        
        if is_sales_navigator:
            # Sales Navigator: Use the exact XPath you provided
            exp_ul_xpath = "//*[@id='scroll-to-experience-section']/div/ul"
            
            try:
                experience_ul = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.XPATH, exp_ul_xpath))
                )
                
                # Get all experience items
                exp_items = experience_ul.find_elements(By.CSS_SELECTOR, "li._experience-entry_1irc72")
                print(f"   Found {len(exp_items)} experience entries in Sales Navigator")
                
                for index, item in enumerate(exp_items):
                    # Extract role using the exact structure from your HTML
                    role = ""
                    try:
                        role_elem = item.find_element(By.CSS_SELECTOR, "h2[data-anonymize='job-title']")
                        role = safe_text(role_elem)
                    except:
                        pass
                    
                    # Extract company name using the exact structure from your HTML
                    company_name = ""
                    try:
                        company_elem = item.find_element(By.CSS_SELECTOR, "p[data-anonymize='company-name']")
                        company_name = safe_text(company_elem)
                    except:
                        pass
                    
                    # Extract duration - from your HTML structure
                    duration = ""
                    try:
                        # Look for the span with date range
                        duration_elem = item.find_element(By.CSS_SELECTOR, "span.FaIDAmBvHCUAhRDrOYReTwrRgdFObBlKKw")
                        date_range = safe_text(duration_elem)
                        
                        # Also look for the duration text (like "1 yr 3 mos")
                        duration_text_elem = item.find_element(By.CSS_SELECTOR, "p._bodyText_1e5nen._default_1i6ulk._sizeXSmall_1e5nen._lowEmphasis_1i6ulk")
                        duration_full_text = safe_text(duration_text_elem)
                        
                        # Combine date range and duration
                        if date_range and duration_full_text:
                            # Extract just the duration part (after the date range)
                            duration_parts = duration_full_text.split(date_range)
                            if len(duration_parts) > 1:
                                duration_only = duration_parts[1].strip()
                                duration = f"{date_range} · {duration_only}" if duration_only else date_range
                            else:
                                duration = date_range
                        elif date_range:
                            duration = date_range
                        elif duration_full_text:
                            duration = duration_full_text
                    except:
                        pass
                    
                    # Extract location - from your HTML structure
                    location = ""
                    try:
                        location_elem = item.find_element(By.CSS_SELECTOR, "p.IcGLmQVeFqxrUMEeMBuKbysvdrtdpDiSlHJY")
                        location = safe_text(location_elem)
                    except:
                        pass
                    
                    # Build experience entry
                    if role or company_name:
                        entry_parts = []
                        if role:
                            entry_parts.append(role)
                        if company_name:
                            entry_parts.append(f"at {company_name}")
                        if duration:
                            entry_parts.append(f"({duration})")
                        if location:
                            entry_parts.append(f"[{location}]")
                        
                        entry = " ".join(entry_parts)
                        experience_entries.append(entry)
                        print(f"   ✓ Experience {index + 1}: {entry[:80]}...")
                    
                    # Store first company URL for later processing
                    if index == 0:
                        company_info["Company Name"] = company_name
                        try:
                            # Look for company link - using your HTML structure
                            company_link_elem = item.find_element(By.CSS_SELECTOR, "a[href*='/sales/company/']")
                            first_company_url = company_link_elem.get_attribute("href")
                            if first_company_url.startswith("/"):
                                first_company_url = "https://www.linkedin.com" + first_company_url
                            company_info["Company Url"] = first_company_url
                        except Exception as e:
                            print(f"   ⚠️ Could not extract company URL: {e}")
                            pass
            
            except Exception as e:
                print(f"   ⚠️ Error extracting Sales Navigator experience: {e}")
        
        else:
            # LinkedIn: Use the exact XPath you provided
            exp_ul_xpath = "//*[@id='profile-content']/div/div[2]/div/div/main/section[6]/div[3]/ul"
            #//*[@id="profile-content"]/div/div[2]/div/div/main/section[3]
            
            try:
                experience_ul = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.XPATH, exp_ul_xpath))
                )
                
                # Get all experience items using your HTML structure
                exp_items = experience_ul.find_elements(By.CSS_SELECTOR, "li.artdeco-list__item")
                print(f"   Found {len(exp_items)} experience entries in LinkedIn")
                
                for index, item in enumerate(exp_items):
                    # Extract role - using your HTML structure
                    role = ""
                    role_selectors = [
                        "span.t-bold span[aria-hidden='true']",
                        ".display-flex.align-items-center .t-bold span[aria-hidden='true']"
                    ]
                    for role_sel in role_selectors:
                        try:
                            role_elem = item.find_element(By.CSS_SELECTOR, role_sel)
                            role = safe_text(role_elem)
                            if role and len(role) > 1:
                                break
                        except:
                            continue
                    
                    # Extract company name - using your HTML structure  
                    company_name = ""
                    company_selectors = [
                        "span.t-14.t-normal span[aria-hidden='true']",
                        ".t-14.t-normal span[aria-hidden='true']"
                    ]
                    for comp_sel in company_selectors:
                        try:
                            comp_elem = item.find_element(By.CSS_SELECTOR, comp_sel)
                            comp_text = safe_text(comp_elem)
                            # Filter out duration info (contains "·" or time indicators)
                            if comp_text and "·" not in comp_text and "yr" not in comp_text and "mo" not in comp_text and "Present" not in comp_text:
                                company_name = comp_text
                                break
                        except:
                            continue
                    
                    # Extract duration
                    duration = ""
                    duration_selectors = [
                        "span.pvs-entity__caption-wrapper[aria-hidden='true']",
                        ".t-14.t-normal.t-black--light span[aria-hidden='true']"
                    ]
                    for dur_sel in duration_selectors:
                        try:
                            dur_elem = item.find_element(By.CSS_SELECTOR, dur_sel)
                            duration_text = safe_text(dur_elem)
                            # Look for time-related text
                            if duration_text and any(keyword in duration_text for keyword in ["yr", "mo", "Present", "–", "-"]):
                                duration = duration_text
                                break
                        except:
                            continue
                    
                    # Extract location
                    location = ""
                    try:
                        location_selectors = [
                            ".t-14.t-normal span[aria-hidden='true']"
                        ]
                        location_spans = item.find_elements(By.CSS_SELECTOR, ".t-14.t-normal span[aria-hidden='true']")
                        for span in location_spans:
                            span_text = safe_text(span)
                            # Look for location indicators (contains place names, "Remote", "Hybrid")
                            if span_text and any(keyword in span_text for keyword in ["Remote", "Hybrid", "United States", "United Kingdom", "India", "Canada", "Australia"]):
                                location = span_text
                                break
                    except:
                        pass
                    
                    # Build experience entry
                    if role or company_name:
                        entry_parts = []
                        if role:
                            entry_parts.append(role)
                        if company_name:
                            entry_parts.append(f"at {company_name}")
                        if duration:
                            entry_parts.append(f"({duration})")
                        if location:
                            entry_parts.append(f"[{location}]")
                        
                        entry = " ".join(entry_parts)
                        experience_entries.append(entry)
                        print(f"   ✓ Experience {index + 1}: {entry[:80]}...")
                    
                    # Store first company URL for later processing
                    if index == 0:
                        company_info["Company Name"] = company_name
                        try:
                            # Look for company link in the first experience item
                            company_link_selectors = [
                                "a[href*='/company/']",
                                "a.optional-action-target-wrapper[href*='/company/']"
                            ]
                            for link_sel in company_link_selectors:
                                try:
                                    company_link_elem = item.find_element(By.CSS_SELECTOR, link_sel)
                                    first_company_url = company_link_elem.get_attribute("href")
                                    if first_company_url:
                                        company_info["Company Url"] = first_company_url
                                        break
                                except:
                                    continue
                        except:
                            pass
            
            except Exception as e:
                print(f"   ⚠️ Error with LinkedIn experience XPath: {e}")
                
                # Fallback: Try alternative selectors if XPath fails
                try:
                    exp_items = driver.find_elements(By.CSS_SELECTOR, "section[data-section='experience'] li, .experience-section li")
                    if exp_items:
                        print(f"   Fallback found {len(exp_items)} experience entries")
                        # Process with same logic as above
                        # ... (same processing logic)
                except:
                    print("   ⚠️ Fallback experience extraction also failed")
        
        # Store all experience entries in Experience column
        if experience_entries:
            company_info["Experience"] = "\n".join(experience_entries)
            print(f"   ✅ Total Experience entries: {len(experience_entries)}")
            print(f"   ✅ Experience preview: {company_info['Experience'][:150]}...")
        
        # Now process first company details if we have a company URL
        if first_company_url:
            print(f"   → Processing first company: {first_company_url}")
            try:
                company_name, website, description = scrape_company_info(driver, first_company_url)
                if company_name:
                    company_info["Company Name"] = company_name
                if website:
                    company_info["Company Website"] = website
                if description:
                    company_info["Company Description"] = description
                print(f"   ✅ First company processed: {company_name}")
            except Exception as e:
                print(f"   ⚠️ Error processing first company: {e}")
        else:
            print("   ⚠️ No company URL found for first experience")
    
    except Exception as e:
        print(f"   ❌ Error in extract_first_company_info: {e}")
    
    return company_info

def extract_linkedin_profile(driver) -> Dict[str, str]:
    """Extract basic LinkedIn profile information."""
    data = {
        "First Name": "",
        "Last Name": "",
        "Full Name": "",
        "Designation": "",
        "Current Position": "",
        "About": "",
        "Location": "",
        "Email": "",
        "Mobile No.": "",
        "Experience": "",
        "Company Name": "",
        "Company Url": "",
        "Company Website": "",
        "Company Description": "",
        "Profile Url": driver.current_url
    }

    # Extract name
    name_selectors = [
        "h1",
        "div.text-heading-xlarge",
        "h1.text-heading-xlarge"
    ]
    
    for selector in name_selectors:
        try:
            name_elem = driver.find_element(By.CSS_SELECTOR, selector)
            full_name = safe_text(name_elem)
            if full_name and len(full_name) > 1:
                data["Full Name"] = full_name
                name_parts = full_name.split(" ", 1)
                data["First Name"] = name_parts[0]
                data["Last Name"] = name_parts[1] if len(name_parts) > 1 else ""
                break
        except:
            continue

    # Extract headline (designation)
    headline_selectors = [
        "div.text-body-medium.break-words",
        "div.ph5 div.text-body-medium",
        ".pv-text-details__left-panel .text-body-medium"
    ]
    
    for selector in headline_selectors:
        try:
            headline_elem = driver.find_element(By.CSS_SELECTOR, selector)
            designation = safe_text(headline_elem)
            if designation and len(designation) > 1:
                data["Designation"] = designation
                break
        except:
            continue

    # Extract location
    location_selectors = [
        "span.text-body-small.inline.t-black--light.break-words",
        ".pv-text-details__left-panel .pb2 .text-body-small",
        "div.ph5 span.text-body-small"
    ]
    
    for selector in location_selectors:
        try:
            location_elem = driver.find_element(By.CSS_SELECTOR, selector)
            location = safe_text(location_elem)
            if location and len(location) > 1:
                data["Location"] = location
                break
        except:
            continue

    # Extract contact info
    # contact_info = extract_contact_info(driver)
    # data["Email"] = contact_info["Email"]
    # data["Mobile No."] = contact_info["Mobile No."]

    # Extract company info and full experience
    company_info = extract_first_company_info(driver, is_sales_navigator=False)
    if company_info["Company Name"]:
        data["Company Name"] = company_info["Company Name"]
    if company_info["Company Url"]:
        data["Company Url"] = company_info["Company Url"]
    if company_info["Company Website"]:
        data["Company Website"] = company_info["Company Website"]
    if company_info["Company Description"]:
        data["Company Description"] = company_info["Company Description"]
    if company_info["Experience"]:
        data["Experience"] = company_info["Experience"]

    # Set Current Position to first experience entry or fallback
    if company_info["Experience"]:
        data["Current Position"] = company_info["Experience"].split("\n")[0]
    elif data["Designation"] and data["Company Name"]:
        data["Current Position"] = f"{data['Designation']} at {data['Company Name']}"
    elif data["Designation"]:
        data["Current Position"] = data["Designation"]

    data["About"] = extract_about_section(driver, is_sales_navigator=False)
    return data

def extract_sales_navigator_profile(driver) -> Dict[str, str]:
    """Extract Sales Navigator profile information."""
    data = {
        "First Name": "",
        "Last Name": "",
        "Full Name": "",
        "Designation": "",
        "Current Position": "",  # New field for current position
        "About": "",
        "Location": "",
        "Email": "",
        "Mobile No.": "",
        "Experience": "",
        "Company Name": "",
        "Company Url": "",
        "Company Website": "",
        "Company Description": "",
        "Profile Url": driver.current_url
    }

    # Extract name
    name_selectors = [
        "#profile-card-section section:first-child div:first-child div:nth-child(2) h1",
        ".profile-topcard-person__name",
        "h1.profile-topcard-person__name",
        "#profile-card-section h1"
    ]
    for selector in name_selectors:
        try:
            if selector.startswith("#profile-card-section section"):
                xpath = "//*[@id='profile-card-section']/section[1]/div[1]/div[2]/h1"
                name_elem = driver.find_element(By.XPATH, xpath)
            else:
                name_elem = driver.find_element(By.CSS_SELECTOR, selector)
            
            full_name = safe_text(name_elem)
            if full_name and len(full_name) > 1:
                data["Full Name"] = full_name
                name_parts = full_name.split(" ", 1)
                data["First Name"] = name_parts[0]
                data["Last Name"] = name_parts[1] if len(name_parts) > 1 else ""
                break
        except:
            continue

    # Extract current position
    try:
        current_position_selector = "div._lockup-content-overflow-hidden_p4eb22"
        current_position_elem = driver.find_element(By.CSS_SELECTOR, current_position_selector)

        # Extract role and company
        role_company_elem = current_position_elem.find_element(By.CSS_SELECTOR, "p._current-role-item_th0xau")
        role_company_text = safe_text(role_company_elem)

        # Extract date range and duration
        date_duration_elem = current_position_elem.find_element(By.CSS_SELECTOR, "p._bodyText_1e5nen")
        date_duration_text = safe_text(date_duration_elem)

        # Combine the extracted data
        data["Current Position"] = f"{role_company_text} {date_duration_text}"
        print(f"   ✓ Current Position: {data['Current Position']}")
    except Exception as e:
        print(f"   ⚠️ Failed to extract current position: {e}")

    # Extract headline (designation) - Enhanced with XPath-derived selector
    headline_selectors = [
        "#profile-card-section .profile-topcard__headline",
        ".profile-topcard__headline",
        ".profile-topcard__headline-text",
        ".profile-topcard-person__headline",
        "[data-anonymize='headline']",
        "#profile-card-section section:first-child div:first-child div:nth-child(3)"  # XPath approximation
    ]
    for selector in headline_selectors:
        try:
            if selector.startswith("#profile-card-section section"):
                # Use explicit XPath for headline
                xpath = "//*[@id='profile-card-section']/section[1]/div[1]/div[3]"
                headline_elem = driver.find_element(By.XPATH, xpath)
            else:
                headline_elem = driver.find_element(By.CSS_SELECTOR, selector)
            
            designation = safe_text(headline_elem)
            if designation and len(designation) > 1:
                data["Designation"] = designation
                print(f"   Headline found with selector: {selector}")
                break
        except Exception as e:
            continue

    # Extract location
    location_selectors = [
        ".profile-topcard__location",
        ".profile-topcard-person__location"
    ]
    for selector in location_selectors:
        try:
            if selector.startswith("#profile-card-section section"):
                xpath = "//*[@id='profile-card-section']/section[1]/div[1]/div[4]"
                location_elem = driver.find_element(By.XPATH, xpath)
            else:
                location_elem = driver.find_element(By.CSS_SELECTOR, selector)
            
            location = safe_text(location_elem)
            if location and len(location) > 1:
                data["Location"] = location
                break
        except:
            continue


    data["About"] = extract_about_section(driver, is_sales_navigator=True)
    
    # Extract company info including website
    company_info = extract_first_company_info(driver, is_sales_navigator=True)
    if company_info["Company Name"]:
        data["Company Name"] = company_info["Company Name"]
    if company_info["Company Url"]:
        data["Company Url"] = company_info["Company Url"]
    if company_info["Company Website"]:
        data["Company Website"] = company_info["Company Website"]
    if company_info["Company Description"]:  # NEW
        data["Company Description"] = company_info["Company Description"]
    if company_info["Experience"]:
        data["Experience"] = company_info["Experience"]




    # Extract experience (first company only) - keeping original logic for Experience field
    try:
        experience_xpath = "//*[@id='scroll-to-experience-section']"
        experience_section = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.XPATH, experience_xpath))
        )
        
        exp_items = driver.find_elements(By.CSS_SELECTOR, "li._experience-entry_1irc72")
        
        if exp_items:
            first_item = exp_items[0]
            
            # Extract role
            role_selectors = [
                "h2[data-anonymize='job-title']",
                "h2._bodyText_1e5nen._default_1i6ulk._sizeMedium_1e5nen._weightBold_1e5nen"
            ]
            role = ""
            for role_sel in role_selectors:
                try:
                    role_elem = first_item.find_element(By.CSS_SELECTOR, role_sel)
                    role = safe_text(role_elem)
                    if role:
                        break
                except:
                    continue

            
    except Exception as e:
        print(f"Error extracting experience: {e}")

    return data

def visit_profile(driver, url: str) -> Dict[str, str]:
    """Visit a LinkedIn or Sales Navigator profile and extract data."""
    print(f"Visiting: {url}")
    
    try:
        driver.get(url)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "main"))
        )
        time.sleep(3)
    except TimeoutException:
        print("Page load timeout; continuing with extraction...")
    except Exception as e:
        print(f"Error loading page: {e}")
        return {"error": str(e), "Profile Url": url}

    if is_sales_navigator_url(url):
        print("Processing as Sales Navigator profile...")
        profile = extract_sales_navigator_profile(driver)
    else:
        print("Processing as LinkedIn profile...")
        profile = extract_linkedin_profile(driver)

    print(f"Extracted: {profile['Full Name']} - {profile['Designation'][:50]}...")
    if profile.get('Email'):
        print(f"Email: {profile['Email']}")
    if profile.get('Mobile No.'):
        print(f"Phone: {profile['Mobile No.']}")
    if profile.get('Company Website'):
        print(f"Company Website: {profile['Company Website']}")
    
    return profile

def main():
    """Main function to run the scraper."""
    print("LinkedIn & Sales Navigator Profile Scraper Starting...")

    try:
        # Read only the first column as raw text (no splitting on commas)
        df = pd.read_csv("profiles (1).csv", usecols=[0], names=["url"], header=0)

        urls = []
        for u in df["url"].dropna().tolist():
            if isinstance(u, str):
                clean = u.strip().strip('"').strip("'")  # remove quotes
                # if there are still commas, keep only the part before first comma
                clean = clean.split(",")[0]
                if clean.startswith("http"):
                    urls.append(clean)

    except FileNotFoundError:
        print("profiles.csv not found. Please create it with a 'url' column.")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading profiles.csv: {e}")
        sys.exit(1)

    if not urls:
        print("No valid URLs found in profiles.csv. Exiting.")
        sys.exit(1)

    # Check if any URLs are Sales Navigator
    has_sales_navigator = any(is_sales_navigator_url(url) for url in urls)
    has_linkedin = any(not is_sales_navigator_url(url) for url in urls)

    # Initialize driver
    driver = init_driver()
    
    try:
        # Handle login based on URL types
        if has_sales_navigator and has_linkedin:
            print("Profiles contain both LinkedIn and Sales Navigator URLs.")
            print("Please log in to both platforms if necessary.")
            wait_for_manual_login(driver, is_sales_navigator=True)
            print("Now please log in to LinkedIn...")
            wait_for_manual_login(driver, is_sales_navigator=False)
        elif has_sales_navigator:
            print("Opening Sales Navigator...")
            wait_for_manual_login(driver, is_sales_navigator=True)
        else:
            print("Opening LinkedIn...")
            wait_for_manual_login(driver, is_sales_navigator=False)

        output_file = "result.xlsx"

        # Define the exact column order you want
        column_order = [
            "First Name", "Last Name", "Full Name", "Designation", "Current Position", "About", "Location", 
            "Email", "Mobile No.", "Experience", "Company Name", "Company Url", 
            "Company Website", "Company Description", "Profile Url"
        ]

        # Initialize results list to collect all profiles
        all_profiles = []

        for i, url in enumerate(urls, 1):
            print(f"\nProcessing profile {i}/{len(urls)}")
            
            try:
                profile = visit_profile(driver, url.strip())
                
                # Ensure all columns exist in profile with correct order
                ordered_profile = {}
                for col in column_order:
                    ordered_profile[col] = profile.get(col, "")
                
                all_profiles.append(ordered_profile)
                print(f"Profile saved: {profile.get('Full Name', 'Unknown')}")

            except Exception as e:
                print(f"Error processing {url}: {e}")
                # Create error profile with same column structure
                error_profile = {}
                for col in column_order:
                    if col == "Profile Url":
                        error_profile[col] = url
                    elif col == "Full Name":
                        error_profile[col] = f"ERROR: {str(e)}"
                    else:
                        error_profile[col] = ""
                all_profiles.append(error_profile)

            if i < len(urls):
                print(f"Rate limiting...")
                human_delay()

        # Write all profiles to Excel at once with proper formatting
        if all_profiles:
            results_df = pd.DataFrame(all_profiles, columns=column_order)
            results_df.to_excel(output_file, index=False, engine='openpyxl')
            print(f"\n✅ Successfully saved {len(all_profiles)} profiles to {output_file}")
        else:
            print("No profiles were processed.")

    finally:
        print("Closing browser...")
        driver.quit()

if __name__ == "__main__":
    main()