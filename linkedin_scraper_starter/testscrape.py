import time
import random
import sys
from typing import List, Dict
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
MIN_DELAY_SECONDS = 5  # Increased for contact info extraction
MAX_DELAY_SECONDS = 10
PAGE_LOAD_TIMEOUT = 10
IMPLICIT_WAIT = 4
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

def is_sales_navigator_url(url: str) -> bool:
    """Check if the URL is a Sales Navigator URL."""
    parsed_url = urlparse(url)
    return "sales" in parsed_url.netloc or "sales" in parsed_url.path

def wait_for_manual_login(driver, is_sales_navigator: bool = False):
    """Wait for user to manually log in to LinkedIn or Sales Navigator."""
    target_url = SALES_NAVIGATOR_URL if is_sales_navigator else LINKEDIN_URL
    print("\n" + "="*60)
    print(f"🔐 MANUAL LOGIN REQUIRED {'(Sales Navigator)' if is_sales_navigator else '(LinkedIn)'}")
    print("="*60)
    print(f"The browser is now open. Please:")
    print(f"1. Log in to {'Sales Navigator' if is_sales_navigator else 'LinkedIn'} manually")
    print(f"2. Navigate to {'Sales Navigator homepage' if is_sales_navigator else 'LinkedIn homepage'}")
    print("3. Come back here and press ENTER when ready")
    print("="*60)
    driver.get(target_url)
    input("Press ENTER after you've logged in... ")
    print("Continuing with profile scraping...\n")

def extract_contact_info(driver) -> Dict[str, str]:
    """Extract publicly available contact information."""
    contact_data = {
        "email": "",
        "phone": "",
        "website": "",
        "social_links": ""
    }
    
    try:
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
                    time.sleep(2)
                    contact_clicked = True
                    break
            except:
                continue
        
        if contact_clicked:
            try:
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
                        href = email_elem.get_attribute("href")
                        if href and "mailto:" in href:
                            contact_data["email"] = href.replace("mailto:", "")
                            break
                    except:
                        continue
                
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
                        href = phone_elem.get_attribute("href")
                        if href and "tel:" in href:
                            contact_data["phone"] = href.replace("tel:", "")
                            break
                    except:
                        continue
                
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
                    contact_data["website"] = "; ".join(websites[:3])
            
            except Exception as e:
                print(f"   ⚠️ Error extracting contact details: {e}")
        
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
        "First Name": "",
        "Last Name": "",
        "headline": "",
        "location": "",
        "current_position": "",
        "profile_url": driver.current_url,
        "source": "LinkedIn"
    }

    name_selectors = [
        "h1",
        "div.text-heading-xlarge",
        "h1.text-heading-xlarge"
    ]
    
    for selector in name_selectors:
        try:
            name = driver.find_element(By.CSS_SELECTOR, selector)
            text = safe_text(name)
            if text and len(text) > 1:
                data["name"] = text
                # Split the name into First Name and Last Name
                name_parts = text.split(" ", 1)  # Split into two parts
                data["First Name"] = name_parts[0]
                data["Last Name"] = name_parts[1] if len(name_parts) > 1 else ""
                break
        except:
            continue

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
        exp_selectors = [
            "#experience ~ div li",
            ".pv-profile-section.experience li",
            "section[data-section='experience'] li"
        ]
        
        for selector in exp_selectors:
            try:
                sections = driver.find_elements(By.CSS_SELECTOR, selector)
                if sections:
                    for sec in sections[:5]:
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

def extract_sales_navigator_profile(driver) -> Dict[str, str]:
    """Extract profile information from Sales Navigator with enhanced selectors."""
    data = {
        "name": "",
        "First Name": "",
        "Last Name": "",
        "headline": "",
        "location": "",
        "current_position": "",
        "experience": "",
        "relationship": "",
        "lead_contact_info": "",
        "email": "",
        "phone": "",
        "website": "",
        "social_links": "",
        # Separate company data columns
        "companies": "",
        "employees_count": "",
        "employees_link": "",
        "decision_makers_count": "",
        "decision_makers_link": "",
        "personas_cxo": "",
        "personas_director": "",
        "profile_url": driver.current_url,
        "source": "Sales Navigator"
    }

    # Name - Enhanced with XPath-derived selectors
    name_selectors = [
        "#profile-card-section section:first-child div:first-child div:nth-child(2) h1",  # From XPath
        ".profile-topcard-person__name",
        "h1.profile-topcard-person__name",
        "#profile-card-section h1",
        "[data-anonymize='person-name']"
    ]
    for selector in name_selectors:
        try:
            if selector.startswith("#profile-card-section section"):
                # Use XPath for more complex selectors
                xpath = "//*[@id='profile-card-section']/section[1]/div[1]/div[2]/h1"
                name = driver.find_element(By.XPATH, xpath)
            else:
                name = driver.find_element(By.CSS_SELECTOR, selector)
            text = safe_text(name)
            if text and len(text) > 1:
                data["name"] = text
                # Split the name into First Name and Last Name
                name_parts = text.split(" ", 1)  # Split into two parts
                data["First Name"] = name_parts[0]
                data["Last Name"] = name_parts[1] if len(name_parts) > 1 else ""
                print(f"   ✓ Name found with selector: {selector}")
                break
        except Exception as e:
            continue

    # Headline/Title - Enhanced with XPath-derived selector
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
                headline = driver.find_element(By.XPATH, xpath)
            else:
                headline = driver.find_element(By.CSS_SELECTOR, selector)

            text = safe_text(headline)
            if text and len(text) > 1:
                data["headline"] = text
                print(f"   ✓ Headline found with selector: {selector}")
                break
        except Exception as e:
            continue

    # Location - Enhanced with XPath-derived selector
    location_selectors = [
        "#profile-card-section section:first-child div:first-child div:nth-child(4)",  # From XPath approximation
        ".profile-topcard__location",
        ".profile-topcard-person__location",
        ".profile-topcard__location-data",
        "[data-anonymize='location']"
    ]
    for selector in location_selectors:
        try:
            if selector.startswith("#profile-card-section section"):
                # Use XPath for the specific location
                xpath = "//*[@id='profile-card-section']/section[1]/div[1]/div[4]"
                location = driver.find_element(By.XPATH, xpath)
            else:
                location = driver.find_element(By.CSS_SELECTOR, selector)
            text = safe_text(location)
            if text and len(text) > 1:
                data["location"] = text
                print(f"   ✓ Location found with selector: {selector}")
                break
        except Exception as e:
            continue

    # Current Position - Enhanced with XPath-derived selector
    position_selectors = [
        "#profile-card-section section:nth-child(3) div",  # From XPath approximation
        ".profile-topcard__current-position",
        ".profile-topcard__summary-position",
        ".profile-topcard-person__current-position",
        ".current-position"
    ]
    for selector in position_selectors:
        try:
            if selector.startswith("#profile-card-section section:nth-child(3)"):
                # Use XPath for current role
                xpath = "//*[@id='profile-card-section']/section[3]/div"
                position = driver.find_element(By.XPATH, xpath)
            else:
                position = driver.find_element(By.CSS_SELECTOR, selector)
            text = safe_text(position)
            if text and len(text) > 1:
                data["current_position"] = text
                print(f"   ✓ Current position found with selector: {selector}")
                break
        except Exception as e:
            continue

    # # Lead Contact Info - Extract Specific Links
    # try:
    #     lead_contact_xpath = "//*[@id='profile-card-section']/section[3]/section"
    #     lead_contact_section = driver.find_element(By.XPATH, lead_contact_xpath)
        
    #     # Find all <a> tags within the section
    #     contact_links = lead_contact_section.find_elements(By.TAG_NAME, "a")
        
    #     contact_info = []
    #     for link in contact_links:
    #         try:
    #             label = safe_text(link)  # Extract the visible text
    #             href = link.get_attribute("href")  # Extract the URL
    #             if label and href:
    #                 contact_info.append(f"{label}: {href}")
    #         except:
    #             continue
        
    #     if contact_info:
    #         data["lead_contact_info"] = "; ".join(contact_info)
    #         print(f"   ✓ Lead contact info extracted: {data['lead_contact_info']}")
    #     else:
    #         print("   ⚠️ No specific contact info found")
    # except Exception as e:
    #     print(f"   ⚠️ Failed to extract lead contact info: {e}")

    # # Contact Info extraction (Sales Navigator specific) - MOVED OUTSIDE THE EXCEPT BLOCK
    # try:
    #     print("   → Attempting to extract contact info")
    #     contact_selectors = [
    #         "button[aria-label*='Contact info']",
    #         "button[aria-label*='contact info']",
    #         ".profile-topcard__contact-info-link",
    #         "a[data-control-name='contact_see_more']"
    #     ]
    #     contact_clicked = False
        
    #     for selector in contact_selectors:
    #         try:
    #             contact_button = driver.find_element(By.CSS_SELECTOR, selector)
    #             if contact_button and contact_button.is_displayed():  # Added None check
    #                 driver.execute_script("arguments[0].click();", contact_button)
    #                 time.sleep(3)
    #                 contact_clicked = True
    #                 print(f"   ✓ Contact info modal opened")
    #                 break
    #         except Exception as e:
    #             continue
        
    #     if contact_clicked:
    #         try:
    #             # Email extraction
    #             email_selectors = [
    #                 "a[href^='mailto:']",
    #                 ".contact-info__email",
    #                 "[data-test='email']"
    #             ]
    #             for selector in email_selectors:
    #                 try:
    #                     email_elem = driver.find_element(By.CSS_SELECTOR, selector)
    #                     if email_elem:  # Added None check
    #                         email_text = safe_text(email_elem)
    #                         if email_text and "@" in email_text:
    #                             data["email"] = email_text
    #                             print(f"   ✓ Email found: {email_text}")
    #                             break
    #                         href = email_elem.get_attribute("href")
    #                         if href and "mailto:" in href:
    #                             data["email"] = href.replace("mailto:", "")
    #                             print(f"   ✓ Email found via href: {data['email']}")
    #                             break
    #                 except:
    #                     continue
                
    #             # Phone extraction
    #             phone_selectors = [
    #                 "a[href^='tel:']",
    #                 ".contact-info__phone",
    #                 "[data-test='phone']"
    #             ]
    #             for selector in phone_selectors:
    #                 try:
    #                     phone_elem = driver.find_element(By.CSS_SELECTOR, selector)
    #                     if phone_elem:  # Added None check
    #                         phone_text = safe_text(phone_elem)
    #                         if phone_text and any(char.isdigit() for char in phone_text):
    #                             data["phone"] = phone_text
    #                             print(f"   ✓ Phone found: {phone_text}")
    #                             break
    #                         href = phone_elem.get_attribute("href")
    #                         if href and "tel:" in href:
    #                             data["phone"] = href.replace("tel:", "")
    #                             print(f"   ✓ Phone found via href: {data['phone']}")
    #                             break
    #                 except:
    #                     continue
                
    #             # Website extraction
    #             website_selectors = [
    #                 ".contact-info__website a",
    #                 "a[href^='http']:not([href*='linkedin.com'])",
    #                 "[data-test='website'] a"
    #             ]
    #             websites = []
    #             for selector in website_selectors:
    #                 try:
    #                     website_elems = driver.find_elements(By.CSS_SELECTOR, selector)
    #                     for elem in website_elems:
    #                         if elem:  # Added None check
    #                             href = elem.get_attribute("href")
    #                             if href and "linkedin.com" not in href and href.startswith("http"):
    #                                 websites.append(href)
    #                 except:
    #                     continue
    #             if websites:
    #                 data["website"] = "; ".join(websites[:3])
    #                 print(f"   ✓ Websites found: {data['website']}")
            
    #         except Exception as e:
    #             print(f"   ⚠️ Error extracting contact details: {e}")
            
    #         # Close contact modal
    #         try:
    #             close_selectors = [
    #                 "button[aria-label='Dismiss']",
    #                 ".artdeco-modal__dismiss",
    #                 "button.artdeco-button--circle"
    #             ]
    #             for selector in close_selectors:
    #                 try:
    #                     close_btn = driver.find_element(By.CSS_SELECTOR, selector)
    #                     if close_btn and close_btn.is_displayed():  # Added None check
    #                         close_btn.click()
    #                         time.sleep(1)
    #                         print("   ✓ Contact modal closed")
    #                         break
    #                 except:
    #                     continue
    #         except Exception as e:
    #             print(f"   ⚠️ Could not close contact modal: {e}")
    # except Exception as e:
    #     print(f"   ⚠️ Could not access contact info: {e}")

    # Experience extraction
    try:
        print("   → Starting Experience + Company Scraping")
        experience_xpath = "//*[@id='scroll-to-experience-section']"
        experience_section = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.XPATH, experience_xpath))
        )
        
        experiences = []
        company_links = []
        
        # Try to expand "Show more" if present
        try:
            show_more = driver.find_element(By.CSS_SELECTOR, "button[aria-label*='Show more']")
            if show_more.is_displayed():
                driver.execute_script("arguments[0].click();", show_more)
                time.sleep(2)
        except:
            pass

        # Primary extraction method - collect ALL data first
        exp_items = WebDriverWait(driver, 10).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "li._experience-entry_1irc72"))
        )
        
        print(f"   → Found {len(exp_items)} experience entries")
        
        for idx, item in enumerate(exp_items[:5], 1):
            try:
                role = ""
                company = ""
                company_link = ""
                
                # Role extraction
                role_selectors = [
                    "h2[data-anonymize='job-title']",
                    "h2._bodyText_1e5nen._default_1i6ulk._sizeMedium_1e5nen._weightBold_1e5nen"
                ]
                for role_sel in role_selectors:
                    try:
                        role_elem = item.find_element(By.CSS_SELECTOR, role_sel)
                        role = safe_text(role_elem)
                        if role:
                            break
                    except:
                        continue
                
                # Company extraction
                company_name_selectors = [
                    "p[data-anonymize='company-name']",
                    ".position-item__company"
                ]
                for comp_sel in company_name_selectors:
                    try:
                        comp_elem = item.find_element(By.CSS_SELECTOR, comp_sel)
                        company = safe_text(comp_elem)
                        if company:
                            break
                    except:
                        continue
                
                # Company link extraction
                company_icon_selectors = [
                    "a[href*='/sales/company/']",
                    "a.ember-view._company-icon_p4eb22"
                ]
                for icon_sel in company_icon_selectors:
                    try:
                        company_icon = item.find_element(By.CSS_SELECTOR, icon_sel)
                        company_link = company_icon.get_attribute("href")
                        if company_link:
                            if company_link.startswith("/"):
                                company_link = "https://www.linkedin.com" + company_link
                            break
                    except:
                        continue

                # Store experience info
                if role and company:
                    experiences.append(f"{role} at {company}")
                    print(f"   ✓ Experience {idx}: {role} at {company}")
                elif role:
                    experiences.append(role)
                    print(f"   ✓ Experience {idx}: {role}")
                
                # Store company link info (avoid duplicates)
                if company_link and company:
                    existing_company = next((c for c in company_links if c["name"] == company), None)
                    if not existing_company:
                        company_links.append({
                            "name": company,
                            "link": company_link,
                            "experience_index": idx
                        })
                        print(f"   ✓ Company link {len(company_links)}: {company} -> {company_link}")
                    else:
                        print(f"   ⚠️ Duplicate company skipped: {company}")
                        
            except Exception as e:
                print(f"   ⚠️ Error processing experience {idx}: {str(e)}")
                continue

        # Store experience results
        if experiences:
            data["experience"] = "; ".join(experiences)
            print(f"   ✅ Total experiences collected: {len(experiences)}")
        
        # NOW scrape all company pages in batch
        if company_links:
            print(f"\n   🏢 Starting batch company scraping for {len(company_links)} companies...")
            
            # Initialize company data storage lists
            companies_info = []
            employees_counts = []
            employees_links = []
            decision_makers_counts = []
            decision_makers_links = []
            cxo_personas = []
            director_personas = []
            
            for idx, comp in enumerate(company_links, 1):
                try:
                    print(f"   → [{idx}/{len(company_links)}] Scraping company: {comp['name']}")
                    print(f"   → Loading: {comp['link']}")
                    
                    company_data = scrape_salesnav_company_page(driver, comp["link"])
                    
                    if company_data and not company_data.get("error"):
                        # Extract company ID from URL
                        company_id = comp["link"].split('/')[-1] if '/' in comp["link"] else ""
                        
                        # Store basic company info (ID, Name, Website)
                        companies_info.append(f"{company_id}|{comp['name']}|{company_data.get('website', '')}")
                        
                        # Store employees info
                        if company_data.get("employees"):
                            employees_counts.append(company_data["employees"])
                            employees_links.append(company_data.get("employees_link", ""))
                        
                        # Store decision makers info
                        if company_data.get("decision_makers"):
                            decision_makers_counts.append(company_data["decision_makers"])
                            decision_makers_links.append(company_data.get("decision_makers_link", ""))
                        
                        # Store personas info
                        if company_data.get("personas"):
                            for persona_label, persona_link in company_data["personas"].items():
                                if "CXO" in persona_label or "C-level" in persona_label:
                                    cxo_personas.append(f"{persona_label}|{persona_link}")
                                elif "Director" in persona_label or "VP" in persona_label:
                                    director_personas.append(f"{persona_label}|{persona_link}")
                        
                        print(f"   ✅ Successfully scraped: {comp['name']}")
                        
                        if idx < len(company_links):
                            time.sleep(2)
                    else:
                        print(f"   ⚠️ No data returned for: {comp['name']}")
                        
                except Exception as e:
                    print(f"   ❌ Failed to scrape company {comp['name']}: {str(e)}")
                    continue
            
            # Store all company data in separate columns
            if companies_info:
                data["companies"] = "; ".join(companies_info)
            if employees_counts:
                data["employees_count"] = "; ".join(employees_counts)
            if employees_links:
                data["employees_link"] = "; ".join(employees_links)
            if decision_makers_counts:
                data["decision_makers_count"] = "; ".join(decision_makers_counts)
            if decision_makers_links:
                data["decision_makers_link"] = "; ".join(decision_makers_links)
            if cxo_personas:
                data["personas_cxo"] = "; ".join(cxo_personas)
            if director_personas:
                data["personas_director"] = "; ".join(director_personas)
            
            print(f"   ✅ Batch company scraping completed. Successfully scraped {len(companies_info)} out of {len(company_links)} companies")
        else:
            print("   ⚠️ No company links found to scrape")
    except Exception as main_exp_error:
        print(f"   ❌ Experience extraction failed: {str(main_exp_error)}")

    # Company extraction
    company_name_selectors = [
        "p[data-anonymize='company-name']",
        ".position-item__company"
    ]
    for comp_sel in company_name_selectors:
        try:
            comp_elem = item.find_element(By.CSS_SELECTOR, comp_sel)
            company = safe_text(comp_elem)
            if company:
                break
        except:
            continue
    
    # Company link extraction
    company_icon_selectors = [
        "a[href*='/sales/company/']",
        "a.ember-view._company-icon_p4eb22"
    ]
    for icon_sel in company_icon_selectors:
        try:
            company_icon = item.find_element(By.CSS_SELECTOR, icon_sel)
            company_link = company_icon.get_attribute("href")
            if company_link:
                if company_link.startswith("/"):
                    company_link = "https://www.linkedin.com" + company_link
                break
        except:
            continue

    # Ensure data integrity before returning
    if not isinstance(data, dict):
        print(f"   ⚠️ WARNING: data is not a dict, creating new dict")
        data = {"error": "Data structure corrupted", "profile_url": driver.current_url}
    
    # Ensure required keys exist
    required_keys = ["name", "companies", "employees_count", "employees_link", 
                     "decision_makers_count", "decision_makers_link", 
                     "personas_cxo", "personas_director"]
    for key in required_keys:
        if key not in data or data[key] is None:
            data[key] = ""

    print(f"   ✅ Profile extraction completed for: {data.get('name', 'Unknown')}")
    return data

def scrape_salesnav_company_page(driver, company_url):
    """Enhanced company page scraping with better error handling."""
    print(f"   → Loading company page: {company_url}")
    
    try:
        driver.get(company_url)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        time.sleep(3)  # Wait for dynamic content
    except Exception as e:
        print(f"   ⚠️ Failed to load company page: {e}")
        return {"error": f"Failed to load page: {e}"}

    company_data = {"scraped_at": time.strftime("%Y-%m-%d %H:%M:%S")}

    # Company Name
    try:
        name_selectors = [
            "h1[data-anonymize='company-name']",
            ".company-name h1"
            # ⚠️ removed plain "h1" catch-all to avoid grabbing "7 yrs" etc.
        ]
        company_data["name"] = ""
        for selector in name_selectors:
            try:
                name_elem = driver.find_element(By.CSS_SELECTOR, selector)
                company_data["name"] = safe_text(name_elem)
                if company_data["name"]:
                    break
            except:
                continue
    except:
        company_data["name"] = ""

    # Fallback if no clean name found
    if not company_data.get("name"):
        # try fallback from URL (last segment of the URL path)
        from urllib.parse import urlparse
        path_parts = urlparse(company_url).path.strip("/").split("/")
        fallback_name = path_parts[-1] if path_parts else "Unknown_Company"
        company_data["name"] = fallback_name.replace("-", " ").title()

    # Company Website
    try:
        website_elem = driver.find_element(
            By.CSS_SELECTOR, "a[data-control-name='visit_company_website']"
        )
        company_data["website"] = website_elem.get_attribute("href")
    except:
        company_data["website"] = ""

    # About / Description
    try:
        about_selectors = [
            "p[data-anonymize='company-blurb']",
            ".company-description",
            ".about-company"
        ]
        for selector in about_selectors:
            try:
                about_elem = driver.find_element(By.CSS_SELECTOR, selector)
                company_data["about"] = safe_text(about_elem)
                if company_data["about"]:
                    break
            except:
                continue
    except:
        pass

    # Company Type
    try:
        type_elem = driver.find_element(By.XPATH, "//dt[contains(., 'Type')]/following-sibling::dd")
        company_data["type"] = safe_text(type_elem)
    except:
        pass

    # Industry
    try:
        industry_elem = driver.find_element(By.XPATH, "//dt[contains(., 'Industry')]/following-sibling::dd")
        company_data["industry"] = safe_text(industry_elem)
    except:
        pass

    # Company Size
    try:
        size_elem = driver.find_element(By.XPATH, "//dt[contains(., 'Company size')]/following-sibling::dd")
        company_data["size"] = safe_text(size_elem)
    except:
        pass

    # Employees count link
    try:
        employees_selectors = [
            "a[aria-label*='All employees']",
            "a[aria-label*='employees']"
        ]
        for selector in employees_selectors:
            try:
                employees_elem = driver.find_element(By.CSS_SELECTOR, selector)
                company_data["employees"] = safe_text(employees_elem)
                company_data["employees_link"] = employees_elem.get_attribute("href")
                if company_data["employees"]:
                    break
            except:
                continue
    except:
        pass

    # Decision makers
    try:
        decision_selectors = [
            "a[aria-label*='Decision makers']",
            "a[aria-label*='decision makers']"
        ]
        for selector in decision_selectors:
            try:
                decision_elem = driver.find_element(By.CSS_SELECTOR, selector)
                company_data["decision_makers"] = safe_text(decision_elem)
                company_data["decision_makers_link"] = decision_elem.get_attribute("href")
                if company_data["decision_makers"]:
                    break
            except:
                continue
    except:
        pass

    # Personas (CXO, Director+, etc.)
    try:
        personas_elems = driver.find_elements(By.CSS_SELECTOR, "a[aria-label*='leads for persona']")
        personas = {}
        for pe in personas_elems:
            label = safe_text(pe)
            href = pe.get_attribute("href")
            if label and href:
                personas[label] = href
        if personas:
            company_data["personas"] = personas
    except:
        pass

    print(f"   ✓ Company data extracted: {company_data.get('name', 'Unknown Company')}")
    return company_data

def visit_profile(driver, url: str) -> Dict[str, str]:
    """Visit a LinkedIn or Sales Navigator profile and extract data."""
    print(f"🔍 Visiting: {url}")
    
    try:
        driver.get(url)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "main"))
        )
        time.sleep(3)
    except TimeoutException:
        print("⚠️  Page load timeout; continuing with extraction...")
    except Exception as e:
        print(f"⚠️  Error loading page: {e}")
        return {"error": str(e), "profile_url": url, "source": "Unknown"}

    if is_sales_navigator_url(url):
        print("   📊 Processing as Sales Navigator profile...")
        profile = extract_sales_navigator_profile(driver)
    else:
        print("   📊 Processing as LinkedIn profile...")
        profile = extract_top_card(driver)
        contact_info = extract_contact_info(driver)
        profile.update(contact_info)
        experiences = extract_experience(driver)
        if experiences:
            profile["experience"] = "; ".join(experiences)
        else:
            profile["experience"] = ""

    print(f"✅ Extracted: {profile['name']} - {profile['headline'][:50]}...")
    if profile.get('email'):
        print(f"   📧 Email: {profile['email']}")
    if profile.get('phone'):
        print(f"   📱 Phone: {profile['phone']}")
    
    return profile

def main():
    """Main function to run the scraper."""
    print("🚀 LinkedIn & Sales Navigator Profile Scraper Starting...")
    
    try:
        df = pd.read_csv("profiles (1).csv")
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
    
    # Check if any URLs are Sales Navigator
    has_sales_navigator = any(is_sales_navigator_url(url) for url in urls)
    has_linkedin = any(not is_sales_navigator_url(url) for url in urls)

    # Initialize driver
    driver = init_driver()
    
    try:
        # Handle login based on URL types
        if has_sales_navigator and has_linkedin:
            print("🌐 Profiles contain both LinkedIn and Sales Navigator URLs.")
            print("   Please log in to both platforms if necessary.")
            wait_for_manual_login(driver, is_sales_navigator=True)
            print("   Now please log in to LinkedIn...")
            wait_for_manual_login(driver, is_sales_navigator=False)
        elif has_sales_navigator:
            print("🌐 Opening Sales Navigator...")
            wait_for_manual_login(driver, is_sales_navigator=True)
        else:
            print("🌐 Opening LinkedIn...")
            wait_for_manual_login(driver, is_sales_navigator=False)

        results = []
        for i, url in enumerate(urls, 1):
            print(f"\n📊 Processing profile {i}/{len(urls)}")
            
            try:
                profile = visit_profile(driver, url.strip())
                results.append(profile)
            except Exception as e:
                print(f"❌ Error processing {url}: {e}")
                results.append({"error": str(e), "profile_url": url, "source": "Unknown"})

            if i < len(urls):
                print(f"⏳ Rate limiting...")
                human_delay()

        print(f"\n💾 Saving results...")
        output_file = "result.xlsx"
        out_df = pd.DataFrame(results)

        if os.path.exists(output_file):
            old_df = pd.read_excel(output_file)
            final_df = pd.concat([old_df, out_df], ignore_index=True)
        else:
            final_df = out_df

        final_df.to_excel(output_file, index=False)
        print(f"✅ Saved {len(final_df)} total profiles to {output_file}")
        
        successful = len([r for r in results if "error" not in r])
        print(f"\n📈 Summary: {successful}/{len(urls)} profiles scraped successfully")

    finally:
        print("🔄 Closing browser...")
        driver.quit()

if __name__ == "__main__":
    main()