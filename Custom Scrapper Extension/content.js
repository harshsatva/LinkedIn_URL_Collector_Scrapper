class LinkedInScraper {
  constructor() {
    this.profiles = [];
    this.isScrapingActive = false;
    this.shouldStop = false;
  }

  safeText(element) {
    if (!element) return '';
    try {
      const text = element.textContent?.trim() || element.innerText?.trim() || '';
      if (
        text.toLowerCase().includes('offline') ||
        text.toLowerCase().includes('active') ||
        text.toLowerCase().includes('status') ||
        text.toLowerCase().includes('view ') ||
        text.match(/^\W*\d+(st|nd|rd)\W*$/i) ||
        text.length < 2
      ) {
        return '';
      }
      return text;
    } catch {
      return '';
    }
  }

  // Enhanced wait for page to load with better detection
  async waitForPageLoad(timeout = 3000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let lastListCount = 0;
      let stableCount = 0;

      const checkPage = () => {
        // Check if scraping should stop
        if (this.shouldStop) {
          resolve();
          return;
        }

        const isLoading = document.querySelector('.loading-spinner, .artdeco-loader, [aria-busy="true"], .search-loading');
        const listItems = document.querySelectorAll('ol.artdeco-list.background-color-white li.artdeco-list__item.pl3.pv3');
        const currentCount = listItems.length;

        if (currentCount === lastListCount && currentCount > 0) {
          stableCount++;
        } else {
          stableCount = 0;
        }
        lastListCount = currentCount;

        if ((!isLoading && stableCount >= 2) || Date.now() - startTime > timeout) {
          console.log(`✅ Page load complete. Found ${currentCount} list items.`);
          resolve();
        } else {
          setTimeout(checkPage, 1000);
        }
      };
      checkPage();
    });
  }

  // Trigger lazy loading by scrolling through all items
  async triggerLazyLoading() {
    if (this.shouldStop) return;

    console.log('📜 Triggering lazy loading for all items...');

    // Use the same container detection logic as scanCurrentPage
    const containerSelectors = [
      // Function to get the second ul element by index
      () => {
        const elements = document.querySelectorAll('ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI.list-style-none');
        console.log(`🔄 Lazy loading: Found ${elements.length} matching ul elements`);
        return elements[1]; // Second element (0-based index)
      },
      'ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      'ul[role="list"].ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      'div.artdeco-card ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      // Sales Navigator containers
      'ol.artdeco-list.background-color-white._border-search-results_1igybl',
      'ol.artdeco-list.background-color-white',
      'ul.YVTLohSWFyyWBJuIJBmlBBnPZrowGAklzKkI',
      // LinkedIn search results containers
      'ul[class*="BzIKaQnNkuYCLrJqnXkACTutXzdXlkQ"]',
      'div.search-results-container',
      'div[data-chameleon-result-urn]',
      'main[id="main"]',
      '.search-results__list',
      'div.reusable-search__entity-results-list'
    ];

    let container = null;
    for (let i = 0; i < containerSelectors.length; i++) {
      const selector = containerSelectors[i];

      if (typeof selector === 'function') {
        console.log(`📜 Testing lazy loading container selector ${i + 1}: [get second ul by index]`);
        const found = selector();
        if (found) {
          container = found;
          console.log(`✅ Lazy loading container FOUND by index`);
          console.log(`📋 Container details: tagName=${container.tagName}, className="${container.className}"`);
          break;
        } else {
          console.log(`❌ Lazy loading container NOT found by index`);
        }
      } else {
        console.log(`📜 Testing lazy loading container selector ${i + 1}: "${selector}"`);
        const found = document.querySelector(selector);
        if (found) {
          container = found;
          console.log(`✅ Lazy loading container FOUND with selector: "${selector}"`);
          console.log(`📋 Container details: tagName=${container.tagName}, className="${container.className}"`);
          break;
        } else {
          console.log(`❌ Lazy loading container NOT found with selector: "${selector}"`);
        }
      }
    }

    if (!container) {
      console.log('❌ No container found for lazy loading');
      return;
    }

    // Enhanced list item detection for lazy loading
    const listItemSelectors = [
      'li.BzIKaQnNkuYCLrJqnXkACTutXzdXlkQ',
      'li.artdeco-list__item.pl3.pv3',
      'li.MrmBiOVoGtLmASsbLEyYuAKwKDzrYMriziI',
      'ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI > li',
      'div.reusable-search__result-container',
      'div.entity-result__item',
      'div.artdeco-card',
      'ul>li.BzIKaQnNkuYCLrJqnXkACTutXzdXlkQ'
    ];

    let listItems = [];
    console.log('📜 Searching for list items for lazy loading...');
    for (let i = 0; i < listItemSelectors.length; i++) {
      const selector = listItemSelectors[i];
      console.log(`📜 Testing lazy loading list item selector ${i + 1}: "${selector}"`);
      const found = container.querySelectorAll(selector);
      console.log(`📊 Found ${found.length} items for lazy loading with selector: "${selector}"`);
      if (found.length > 0) {
        if (listItems.length === 0) {
          listItems = found;
          console.log(`✅ Using ${found.length} items for lazy loading from selector: "${selector}"`);
          break; // Use the first selector that finds items
        }
      }
    }

    if (listItems.length === 0) {
      console.log('❌ No list items found for lazy loading');
      return;
    }

    console.log(`📜 Starting lazy loading for ${listItems.length} items...`);

    for (let i = 0; i < listItems.length && !this.shouldStop; i++) {
      const item = listItems[i];

      // Check for deferred content indicators
      const deferredDiv = item.querySelector('[data-x-deferred-did-intersect=""]') ||
        item.querySelector('[data-deferred]') ||
        item.querySelector('.skeleton');

      if (deferredDiv) {
        console.log(`⏳ Triggering lazy load for item ${i + 1}/${listItems.length}`);

        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if content loaded by looking for profile links
        const hasLinks = item.querySelectorAll('a[href*="linkedin.com/in/"], a[href*="/sales/lead/"]').length > 0;
        if (hasLinks) {
          console.log(`✅ Item ${i + 1} content loaded`);
        } else {
          console.log(`⚠️ Item ${i + 1} still deferred after scroll`);
          // Try a longer wait for stubborn items
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        console.log(`✓ Item ${i + 1} already loaded`);
      }
    }

    console.log('📜 Lazy loading trigger complete');
  }

  async scanCurrentPage() {
    if (this.shouldStop) return [];

    console.log('🔍 Scanning current page for profiles...');
    console.log('🌐 Current URL:', window.location.href);

    if (document.querySelector('.authwall, .login-wall, .guest-homepage, .global-nav__login-wall, .sales-nav-login')) {
      console.log('❌ Not logged in to LinkedIn or Sales Navigator');
      return [];
    }

    const profileLinks = [];

    // Enhanced container detection with debugging
    console.log('🔍 Searching for containers...');
    const containerSelectors = [
      // Function to get the second ul element by index
      () => {
        const elements = document.querySelectorAll('ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI.list-style-none');
        console.log(`Found ${elements.length} matching ul elements`);
        return elements[1]; // Second element (0-based index)
      },
      'ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      'ul[role="list"].ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      'div.artdeco-card ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      // Sales Navigator containers
      'ol.artdeco-list.background-color-white._border-search-results_1igybl',
      'ol.artdeco-list.background-color-white',
      'ul.YVTLohSWFyyWBJuIJBmlBBnPZrowGAklzKkI',
      // LinkedIn search results containers
      'ul[class*="BzIKaQnNkuYCLrJqnXkACTutXzdXlkQ"]', // Parent of the list items we found
      'div.search-results-container',
      'div[data-chameleon-result-urn]', // LinkedIn search result container
      'main[id="main"]', // Main content area
      '.search-results__list',
      'div.reusable-search__entity-results-list'
    ];

    let container = null;
    for (let i = 0; i < containerSelectors.length; i++) {
      const selector = containerSelectors[i];

      if (typeof selector === 'function') {
        console.log(`🎯 Testing container selector ${i + 1}: [get second ul by index]`);
        const found = selector();
        if (found) {
          container = found;
          console.log(`✅ Container FOUND by index`);
          console.log(`📋 Container details: tagName=${container.tagName}, className="${container.className}", id="${container.id}"`);
          break;
        } else {
          console.log(`❌ Container NOT found by index (second ul doesn't exist)`);
        }
      } else {
        console.log(`🎯 Testing container selector ${i + 1}: "${selector}"`);
        const found = document.querySelector(selector);
        if (found) {
          container = found;
          console.log(`✅ Container FOUND with selector: "${selector}"`);
          console.log(`📋 Container details: tagName=${container.tagName}, className="${container.className}", id="${container.id}"`);
          break;
        } else {
          console.log(`❌ Container NOT found with selector: "${selector}"`);
        }
      }
    }

    let listItems = [];
    if (container) {
      console.log('📋 Using container:', container.tagName, container.className);
      await this.triggerLazyLoading();

      if (this.shouldStop) return [];

      // Enhanced list items detection with debugging
      const listItemSelectors = [
        'li.BzIKaQnNkuYCLrJqnXkACTutXzdXlkQ',
        'ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI > li',
        'li.artdeco-list__item.pl3.pv3',
        'li.MrmBiOVoGtLmASsbLEyYuAKwKDzrYMriziI',
        'div.reusable-search__result-container',
        'div.entity-result__item',
        //'div#+qTMXal4RLeOK4elhX+Mmg==',
        'div.artdeco-card',
        'ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
        'ul>li.BzIKaQnNkuYCLrJqnXkACTutXzdXlkQ'
      ];

      console.log('🔍 Searching for list items in container...');
      for (let i = 0; i < listItemSelectors.length; i++) {
        const selector = listItemSelectors[i];
        console.log(`🎯 Testing list item selector ${i + 1}: "${selector}"`);
        const found = container.querySelectorAll(selector);
        console.log(`📊 Found ${found.length} items with selector: "${selector}"`);
        if (found.length > 0) {
          if (listItems.length === 0) {
            listItems = found;
            console.log(`✅ Using ${found.length} items from selector: "${selector}"`);
          }
        }
      }

      // If we still don't have items, try the combined selector
      if (listItems.length === 0) {
        const combinedSelector = listItemSelectors.join(', ');
        console.log(`🎯 Testing combined selector: "${combinedSelector}"`);
        listItems = container.querySelectorAll(combinedSelector);
        console.log(`📊 Found ${listItems.length} items with combined selector`);
      }

      console.log(`🔎 Total list items found in container: ${listItems.length}`);
    } else {
      console.log('⚠️ No container found, falling back to document-wide scan');
      const links = [];
      const linkSelectors = [
        'a.lAZDHtSLDNLtCbloPenngRMakCrATOY[href*="/in/"]',
        'a[href*="/in/"]:not([href*="/company/"]):not([href*="/school/"])',
        'a[href*="/sales/lead/"]',
        'a[href*="/sales/people/"]',
        'a[href*="linkedin.com/in/"]',
        '.result-lockup__name a',
        '.entity-result__title-text a',
        'span.QpmfdEWZYsqBMeUoLiQavPgtfWpELNoiTKubc>a.lAZDHtSLDNLtCbloPenngRMakCrATOY',
        '.reusable-search__result-container a[href*="/in/"]',
        '.search-result__wrapper a[href*="/in/"]',
        'a[data-control-name="search_srp_result"]',
        '.search-results__result-item a[href*="/in/"]',
        '.search-results__result-link[href*="/in/"]',
        '.entity-result__item a[href*="/in/"]',
        'a[data-anonymize="profile-link"]',
        'a[data-control-name="view_lead_panel_via_search_lead_image"]',
        '.presence-entity--size-4 a[href*="/sales/lead/"]'
      ];

      console.log('🔍 Document-wide scan for profile links...');
      for (let i = 0; i < linkSelectors.length; i++) {
        const selector = linkSelectors[i];
        console.log(`🎯 Testing document selector ${i + 1}: "${selector}"`);
        const foundLinks = document.querySelectorAll(selector);
        console.log(`📊 Found ${foundLinks.length} links with selector: "${selector}"`);
        if (foundLinks.length > 0) {
          links.push(...foundLinks);
          console.log(`✅ Added ${foundLinks.length} links from selector: "${selector}"`);
        } else {
          console.log(`❌ No links found with selector: "${selector}"`);
        }
      }

      listItems = Array.from(new Set(links)).map(link => link.closest('li, div.reusable-search__result-container, div.search-result__wrapper, div.entity-result__item') || link);
      console.log(`🔎 Total unique items from document-wide scan: ${listItems.length}`);
    }

    for (let index = 0; index < listItems.length && !this.shouldStop; index++) {
      const item = listItems[index];
      console.log(`\n🔍 Processing item ${index + 1}/${listItems.length}`);
      console.log(`📋 Item details: tagName=${item.tagName}, className="${item.className}", id="${item.id}"`);

      const linkSelectors = [
        'a[href*="/in/"]:not([href*="/company/"]):not([href*="/school/"])',
        'a[href*="/sales/lead/"]',
        'a[href*="/sales/people/"]',
        'a[href*="linkedin.com/in/"]',
        '.result-lockup__name a',
        '.entity-result__title-text a',
        '.reusable-search__result-container a[href*="/in/"]',
        '.search-result__wrapper a[href*="/in/"]',
        'a[data-control-name="search_srp_result"]',
        '.search-results__result-item a[href*="/in/"]',
        '.search-results__result-link[href*="/in/"]',
        '.entity-result__item a[href*="/in/"]',
        'a[data-anonymize="profile-link"]',
        'a[data-control-name="view_lead_panel_via_search_lead_image"]',
        '.presence-entity--size-4 a[href*="/sales/lead/"]'
      ];

      let link = null;
      console.log(`🔍 Searching for profile link in item ${index + 1}...`);
      for (let i = 0; i < linkSelectors.length; i++) {
        const selector = linkSelectors[i];
        console.log(`🎯 Testing link selector ${i + 1}: "${selector}"`);

        const foundLink = item.querySelector ? item.querySelector(selector) : (item.matches && item.matches(selector) ? item : null);

        if (foundLink) {
          console.log(`✅ Link FOUND with selector: "${selector}"`);
          console.log(`🔗 Link href: ${foundLink.href}`);
          console.log(`📝 Link text: "${foundLink.textContent?.trim() || 'No text'}"`);

          if (foundLink.href && foundLink.href.includes('linkedin.com')) {
            link = foundLink;
            console.log(`✅ Valid LinkedIn link confirmed with selector: "${selector}"`);
            break;
          } else {
            console.log(`❌ Invalid or non-LinkedIn link with selector: "${selector}"`);
          }
        } else {
          console.log(`❌ No link found with selector: "${selector}"`);
        }
      }

      if (!link) {
        console.log(`❌ No valid link found in item ${index + 1}`);
        continue;
      }

      let cleanUrl = link.href.split('?')[0].split('#')[0].replace(/\/$/, '');
      if (cleanUrl.match(/\/in\/ACoA/)) {
        console.log(`🚫 Skipping anonymized URL: ${cleanUrl}`);
        continue;
      }

      if (!profileLinks.some((p) => p.url === cleanUrl)) {
        let name = 'Unknown';
        const nameSelectors = [
          'span.QpmfdEWZYsqBMeUoLiQavPgtfWpELNoiTKubc a span[dir="ltr"] span[aria-hidden="true"]',
          'a.lAZDHtSLDNLtCbloPenngRMakCrATOY span[aria-hidden="true"]',
          'span.QpmfdEWZYsqBMeUoLiQavPgtfWpELNoiTKubc span[aria-hidden="true"]',
          'span[dir="ltr"] > span[aria-hidden="true"]:not(.visually-hidden)',
          '.entity-result__title-text a span:first-child',
          '.result-lockup__name a span',
          '.actor-name',
          'span:not(.visually-hidden):not([aria-hidden="true"])',
          '[data-anonymize="person-name"]',
          '.search-result__info .search-result__title a',
          '.entity-result__title-text a',
          ':scope .entity-result__title-text a span',
          ':scope .actor-name',
          ':scope [data-anonymize="person-name"]',
          ':scope img[data-anonymize="headshot-photo"]'
        ];

        console.log(`🔍 Searching for name in item ${index + 1}...`);
        const searchContainer = link.closest('.reusable-search__result-container, .search-result__wrapper, .entity-result__item, .search-results__result-item') || item;
        console.log(`📦 Name search container: tagName=${searchContainer.tagName}, className="${searchContainer.className}"`);

        for (let i = 0; i < nameSelectors.length; i++) {
          const selector = nameSelectors[i];
          console.log(`🎯 Testing name selector ${i + 1}: "${selector}"`);

          const element = searchContainer.querySelector ? searchContainer.querySelector(selector) : null;

          if (element) {
            console.log(`✅ Name element FOUND with selector: "${selector}"`);
            console.log(`📝 Element tagName: ${element.tagName}, className: "${element.className}", textContent: "${element.textContent?.trim() || 'No text'}"`);

            let text = this.safeText(element);
            if (element.tagName === 'IMG' && element.alt) {
              console.log(`🖼️ Image alt text: "${element.alt}"`);
              if (element.alt.includes('Go to') && element.alt.includes("'s profile")) {
                text = element.alt.replace(/^Go to /, '').replace(/'s profile$/, '');
                console.log(`🔄 Processed alt text: "${text}"`);
              }
            }
            if (text && text !== 'Unknown' && text.length > 2) {
              name = text;
              console.log(`✅ Name extracted: "${name}" using selector: "${selector}"`);
              break;
            } else {
              console.log(`❌ Invalid name text: "${text}" from selector: "${selector}"`);
            }
          } else {
            console.log(`❌ No name element found with selector: "${selector}"`);
          }
        }

        if (name === 'Unknown' && link.textContent) {
          console.log('🔄 Fallback: trying to extract name from link text');
          const linkText = this.safeText(link);
          console.log(`🔗 Link text content: "${linkText}"`);
          if (linkText && linkText.length > 2) {
            name = linkText;
            console.log(`✅ Name extracted from link text: "${name}"`);
          }
        }

        console.log(`📋 Profile ${index + 1}: URL=${cleanUrl}, Name=${name}`);
        profileLinks.push({
          url: cleanUrl,
          name: name,
          element: link,
          index: index + 1
        });
      } else {
        console.log(`⏩ Duplicate URL skipped: ${cleanUrl}`);
      }
    }

    console.log(`📋 Total unique profiles found on page: ${profileLinks.length}`);
    return profileLinks;
  }

  sendProgressUpdate(currentPage, profiles) {
    try {
      chrome.runtime.sendMessage({
        action: 'scrapingProgress',
        currentPage: currentPage,
        profiles: profiles
      });
    } catch (error) {
      console.log('Could not send progress update:', error);
    }
  }

  // Send completion message to popup
  sendCompletionMessage(profiles) {
    try {
      chrome.runtime.sendMessage({
        action: 'scrapingComplete',
        profiles: profiles
      });
    } catch (error) {
      console.log('Could not send completion message:', error);
    }
  }

  // Enhanced scrape with better stop conditions and progress reporting
  async scrapeAllPages() {
    this.isScrapingActive = true;
    this.shouldStop = false;

    let allProfiles = [];
    let currentPage = 1;
    let visitedUrls = new Set();

    while (this.isScrapingActive && !this.shouldStop) {
      console.log(`📄 Scraping page ${currentPage}...`);

      // Track page URL to detect loops
      const pageUrl = window.location.href;
      if (visitedUrls.has(pageUrl)) {
        console.log("🔁 Detected loop back to a previous page, stopping.");
        break;
      }
      visitedUrls.add(pageUrl);

      // 1. Wait for page to stabilize
      await this.waitForPageLoad(3000);
      if (this.shouldStop) break;

      await new Promise(resolve => setTimeout(resolve, 2000));
      if (this.shouldStop) break;

      // 2. Scrape current page
      const profiles = await this.scanCurrentPage();
      if (this.shouldStop) break;

      allProfiles.push(...profiles);
      console.log(`📊 Profiles on page ${currentPage}: ${profiles.length}`);

      // Send progress update to popup
      this.sendProgressUpdate(currentPage, allProfiles);

      if (profiles.length === 0) {
        console.log("⚠️ No profiles found on current page, stopping pagination.");
        break;
      }

      console.log("📜 Scrolling to bottom to render pagination controls...");
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (this.shouldStop) break;


      // 3. Find next button
      const nextBtnSelectors = [
        'button[aria-label="Next"]',
        '.artdeco-pagination__button--next',
        'button[data-test-pagination-page-btn="next"]',
      ];
      let nextBtn = null;
      for (const selector of nextBtnSelectors) {
        const candidate = document.querySelector(selector);
        if (candidate && !candidate.disabled && candidate.getAttribute("aria-disabled") !== "true") {
          nextBtn = candidate;
          break;
        }
      }

      if (!nextBtn || this.shouldStop) {
        console.log("🚫 No more pages or next button not found, stopping.");
        break;
      }

      // 4. Click next
      console.log("➡️ Clicking next button...");
      nextBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (this.shouldStop) break;

      nextBtn.click();

      // 5. Wait for next page to load
      await this.waitForPageLoad(3000);
      if (this.shouldStop) break;

      currentPage++;
    }

    // Deduplicate
    const uniqueProfiles = [];
    const seen = new Set();
    for (const p of allProfiles) {
      if (!seen.has(p.url)) {
        seen.add(p.url);
        uniqueProfiles.push(p);
      }
    }

    console.log(`✅ Scraping ${this.shouldStop ? 'stopped' : 'completed'}. Found ${uniqueProfiles.length} unique profiles across ${currentPage} pages`);
    this.profiles = uniqueProfiles;
    this.isScrapingActive = false;

    // Send completion message to popup
    this.sendCompletionMessage(uniqueProfiles);

    return uniqueProfiles;
  }

  // Stop the scraping process
  stopScraping() {
    console.log('🛑 Stop signal received');
    this.shouldStop = true;
    this.isScrapingActive = false;
    return this.profiles;
  }

  // Manual debug function to check what's on the page
  debugCurrentPage() {
    const container = document.querySelector('ol.artdeco-list.background-color-white');
    const listItems = container ? container.querySelectorAll('li.artdeco-list__item.pl3.pv3') : [];

    console.log('🐛 DEBUG INFO:');
    console.log(`Container found: ${!!container}`);
    console.log(`List items found: ${listItems.length}`);

    if (container) {
      console.log('Container classes:', container.className);
    }

    listItems.forEach((item, index) => {
      const links = item.querySelectorAll('a[href*="linkedin.com"]');
      console.log(`Item ${index + 1}: ${links.length} LinkedIn links found`);
      links.forEach((link, linkIndex) => {
        console.log(`  Link ${linkIndex + 1}: ${link.href}`);
      });
    });
  }
}

const scraper = new LinkedInScraper();
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Content script received message:', request);

  try {
    if (request.action === 'startScraping') {
      console.log('🔍 Starting multi-page scraping...');

      // Start scraping asynchronously
      scraper.scrapeAllPages().then((profiles) => {
        // This will be handled by the completion message sent from scrapeAllPages
        console.log(`✅ Scraping process completed with ${profiles.length} profiles`);
      }).catch((error) => {
        console.error('❌ Error during scraping:', error);
        chrome.runtime.sendMessage({
          action: 'scrapingComplete',
          profiles: scraper.profiles,
          error: error.message
        });
      });

      // Send immediate response to confirm start
      sendResponse({
        success: true,
        message: 'Scraping started'
      });

    } else if (request.action === 'stopScraping') {
      console.log('🛑 Stopping scraping process...');
      const currentProfiles = scraper.stopScraping();

      sendResponse({
        success: true,
        profiles: currentProfiles.map((p) => ({
          name: p.name,
          url: p.url,
          index: p.index
        })),
        message: `Scraping stopped with ${currentProfiles.length} profiles`
      });

    } else if (request.action === 'scanProfiles') {
      // Legacy single-page scan for backward compatibility
      console.log('🔍 Executing single page scan...');
      scraper.scanCurrentPage().then((profiles) => {
        sendResponse({
          success: true,
          profiles: profiles.map((p) => ({
            name: p.name,
            url: p.url,
            index: p.index
          })),
        });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

    } else if (request.action === 'debug') {
      scraper.debugCurrentPage();
      sendResponse({ success: true, message: 'Debug info logged to console' });

    } else {
      sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('❌ Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }

  return true; // Keep port alive for async responses
});