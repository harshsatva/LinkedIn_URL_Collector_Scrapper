class LinkedInScraper {
  constructor() {
    this.profiles = [];
    this.isScrapingActive = false;
    this.shouldStop = false;
    this.isPaused = false;
    this.currentPage = 1;
    this.visitedUrls = new Set();
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

  async waitForPageLoad(timeout = 3000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let lastListCount = 0;
      let stableCount = 0;

      const checkPage = () => {
        if (this.shouldStop || this.isPaused) {
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

  async triggerLazyLoading() {
    if (this.shouldStop || this.isPaused) return;

    console.log('📜 Triggering lazy loading for all items...');

    const containerSelectors = [
      () => {
        const elements = document.querySelectorAll('ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI.list-style-none');
        console.log(`🔄 Lazy loading: Found ${elements.length} matching ul elements`);
        return elements[1];
      },
      'ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      'ul[role="list"].ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      'div.artdeco-card ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      'ol.artdeco-list.background-color-white._border-search-results_1igybl',
      'ol.artdeco-list.background-color-white',
      'ul.YVTLohSWFyyWBJuIJBmlBBnPZrowGAklzKkI',
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
          break;
        }
      }
    }

    if (listItems.length === 0) {
      console.log('❌ No list items found for lazy loading');
      return;
    }

    console.log(`📜 Starting lazy loading for ${listItems.length} items...`);

    for (let i = 0; i < listItems.length && !this.shouldStop && !this.isPaused; i++) {
      const item = listItems[i];
      const deferredDiv = item.querySelector('[data-x-deferred-did-intersect=""]') ||
        item.querySelector('[data-deferred]') ||
        item.querySelector('.skeleton');

      if (deferredDiv) {
        console.log(`⏳ Triggering lazy load for item ${i + 1}/${listItems.length}`);
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 500));
        const hasLinks = item.querySelectorAll('a[href*="linkedin.com/in/"], a[href*="/sales/lead/"]').length > 0;
        if (hasLinks) {
          console.log(`✅ Item ${i + 1} content loaded`);
        } else {
          console.log(`⚠️ Item ${i + 1} still deferred after scroll`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        console.log(`✓ Item ${i + 1} already loaded`);
      }
    }

    console.log('📜 Lazy loading trigger complete');
  }

  async scanCurrentPage() {
    if (this.shouldStop || this.isPaused) return [];

    console.log('🔍 Scanning current page for profiles...');
    console.log('🌐 Current URL:', window.location.href);

    if (document.querySelector('.authwall, .login-wall, .guest-homepage, .global-nav__login-wall, .sales-nav-login')) {
      console.log('❌ Not logged in to LinkedIn or Sales Navigator');
      return [];
    }

    const profileLinks = [];
    console.log('🔍 Searching for containers...');
    const containerSelectors = [
      () => {
        const elements = document.querySelectorAll('ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI.list-style-none');
        console.log(`Found ${elements.length} matching ul elements`);
        return elements[1];
      },
      () => {
        const elements = document.querySelectorAll('ul.IHZczlxfMDNMNgZZRxnAJXXmmMqTUZesYQ.list-style-none');
        console.log(`Found ${elements.length} matching IHZczlxf ul elements`);
        return elements[1];
      },
      'ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      'ul[role="list"].ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      'div.artdeco-card ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
      'ol.artdeco-list.background-color-white._border-search-results_1igybl',
      'ol.artdeco-list.background-color-white',
      'ul.YVTLohSWFyyWBJuIJBmlBBnPZrowGAklzKkI',
      'ul.IHZczlxfMDNMNgZZRxnAJXXmmMqTUZesYQ.list-style-none',
      'ul[class*="IHZczlxfMDNMNgZZRxnAJXXmmMqTUZesYQ list-style-none"]',
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
      if (this.shouldStop || this.isPaused) return [];
      const listItemSelectors = [
        'li.HjtPbIESETTemAYNBkfqOYoFbWtzQylRfmls',
        'li.BzIKaQnNkuYCLrJqnXkACTutXzdXlkQ',
        'ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI > li',
        'li.artdeco-list__item.pl3.pv3',
        'li.MrmBiOVoGtLmASsbLEyYuAKwKDzrYMriziI',
        'div.reusable-search__result-container',
        'div.entity-result__item',
        'div.artdeco-card',
        'ul.ArbTtOKwoINPvvrEwwkaaEiwvYGHeKI',
        'ul>li.BzIKaQnNkuYCLrJqnXkACTutXzdXlkQ',
        'li'
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
            break;
          }
        }
      }
      console.log(`🔎 Total list items found in container: ${listItems.length}`);
    } else {
      console.log('⚠️ No container found, falling back to document-wide scan');
      const links = [];
      const linkSelectors = [
        'a.DXNSlbosknJbpjnPjPkcXtduFQjWIw[href*="/in/"]',
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

    for (let index = 0; index < listItems.length && !this.shouldStop && !this.isPaused; index++) {
      const item = listItems[index];
      console.log(`\n🔍 Processing item ${index + 1}/${listItems.length}`);
      console.log(`📋 Item details: tagName=${item.tagName}, className="${item.className}", id="${item.id}"`);

      const linkSelectors = [
        'a.DXNSlbosknJbpjnPjPkcXtduFQjWIw[href*="/in/"]',
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
          'span[dir="ltr"] > span[aria-hidden="true"]',
          'a.DXNSlbosknJbpjnPjPkcXtduFQjWIw span[aria-hidden="true"]',
          'span.pAUMdGdZFnkRNtiSZLIJlbRFtMdOitucVsU a span[aria-hidden="true"]',
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
        profiles: profiles.map(p => ({ name: p.name, url: p.url, index: p.index }))
      });
    } catch (error) {
      console.log('Could not send progress update:', error);
    }
  }

  sendCompletionMessage(profiles, error = null) {
    try {
      chrome.runtime.sendMessage({
        action: 'scrapingComplete',
        profiles: profiles.map(p => ({ name: p.name, url: p.url, index: p.index })),
        error: error
      });
    } catch (error) {
      console.log('Could not send completion message:', error);
    }
  }

  sendPauseMessage() {
    try {
      chrome.runtime.sendMessage({
        action: 'scrapingPaused',
        profiles: this.profiles.map(p => ({ name: p.name, url: p.url, index: p.index }))
      });
    } catch (error) {
      console.log('Could not send pause message:', error);
    }
  }

  sendResumeMessage() {
    try {
      chrome.runtime.sendMessage({
        action: 'scrapingResumed',
        profiles: this.profiles.map(p => ({ name: p.name, url: p.url, index: p.index }))
      });
    } catch (error) {
      console.log('Could not send resume message:', error);
    }
  }

  async pauseScraping() {
    console.log('⏸️ Pause signal received');
    if (!this.isScrapingActive) {
      return { success: false, message: 'No active scraping session' };
    }
    this.isPaused = true;
    try {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({
          scrapingState: {
            profiles: this.profiles.map(p => ({
              name: p.name,
              url: p.url,
              index: p.index
            })),
            currentPage: this.currentPage,
            visitedUrls: Array.from(this.visitedUrls),
            isPaused: true
          }
        }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
      console.log('✅ State saved on pause');
      this.sendPauseMessage();
      return { success: true, profiles: this.profiles.map(p => ({ name: p.name, url: p.url, index: p.index })) };
    } catch (error) {
      console.error('Error saving state on pause:', error);
      return { success: false, error: error.message };
    }
  }

  async resumeScraping() {
    console.log('▶️ Resume signal received');
    if (!this.isPaused) {
      return { success: false, message: 'Scraper is not paused' };
    }
    this.isPaused = false;
    this.sendResumeMessage();
    return { success: true };
  }

  async scrapeAllPages() {
    this.isScrapingActive = true;
    this.shouldStop = false;
    this.isPaused = false;
    let allProfiles = [];
    this.currentPage = 1;
    this.visitedUrls = new Set();

    // Restore state if resuming
    try {
      const { scrapingState } = await new Promise(resolve => chrome.storage.local.get(['scrapingState'], resolve));
      if (scrapingState && scrapingState.isPaused) {
        allProfiles = scrapingState.profiles || [];
        this.profiles = allProfiles.map(p => ({ ...p, element: null })); // DOM elements can't be restored
        this.currentPage = scrapingState.currentPage || 1;
        this.visitedUrls = new Set(scrapingState.visitedUrls || []);
        this.isPaused = true; // Start paused, will resume after message
        console.log(`✅ Restored state: ${allProfiles.length} profiles, page ${this.currentPage}`);
      }
    } catch (error) {
      console.error('Error restoring state:', error);
    }

    while (this.isScrapingActive && !this.shouldStop) {
      if (this.isPaused) {
        console.log('⏸️ Scraping paused, waiting for resume...');
        this.sendPauseMessage();
        while (this.isPaused && !this.shouldStop) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (this.shouldStop) break;
        console.log('▶️ Scraping resumed');
        this.sendResumeMessage();
      }

      console.log(`📄 Scraping page ${this.currentPage}...`);
      const pageUrl = window.location.href;
      if (this.visitedUrls.has(pageUrl)) {
        console.log("🔁 Detected loop back to a previous page, stopping.");
        break;
      }
      this.visitedUrls.add(pageUrl);

      await this.waitForPageLoad(3000);
      if (this.shouldStop || this.isPaused) break;

      await new Promise(resolve => setTimeout(resolve, 2000));
      if (this.shouldStop || this.isPaused) break;

      const profiles = await this.scanCurrentPage();
      if (this.shouldStop || this.isPaused) break;

      allProfiles.push(...profiles);
      console.log(`📊 Profiles on page ${this.currentPage}: ${profiles.length}`);
      this.sendProgressUpdate(this.currentPage, allProfiles);

      if (profiles.length === 0) {
        console.log("⚠️ No profiles found on current page, stopping pagination.");
        break;
      }

      console.log("📜 Scrolling to bottom to render pagination controls...");
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (this.shouldStop || this.isPaused) break;

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

      if (!nextBtn || this.shouldStop || this.isPaused) {
        console.log("🚫 No more pages or next button not found, stopping.");
        break;
      }

      console.log("➡️ Clicking next button...");
      nextBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (this.shouldStop || this.isPaused) break;

      nextBtn.click();
      await this.waitForPageLoad(3000);
      if (this.shouldStop || this.isPaused) break;

      this.currentPage++;
    }

    const uniqueProfiles = [];
    const seen = new Set();
    for (const p of allProfiles) {
      if (!seen.has(p.url)) {
        seen.add(p.url);
        uniqueProfiles.push(p);
      }
    }

    console.log(`✅ Scraping ${this.shouldStop ? 'stopped' : this.isPaused ? 'paused' : 'completed'}. Found ${uniqueProfiles.length} unique profiles across ${this.currentPage} pages`);
    this.profiles = uniqueProfiles;
    this.isScrapingActive = false;
    this.isPaused = false;

    this.sendCompletionMessage(uniqueProfiles);
    chrome.storage.local.remove(['scrapingState'], () => {
      if (chrome.runtime.lastError) {
        console.error('Error clearing storage:', chrome.runtime.lastError);
      }
    });

    return uniqueProfiles;
  }

  stopScraping() {
    console.log('🛑 Stop signal received');
    this.shouldStop = true;
    this.isScrapingActive = false;
    this.isPaused = false;
    chrome.storage.local.remove(['scrapingState'], () => {
      if (chrome.runtime.lastError) {
        console.error('Error clearing storage:', chrome.runtime.lastError);
      }
    });
    return this.profiles.map(p => ({ name: p.name, url: p.url, index: p.index }));
  }

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
      scraper.scrapeAllPages().then((profiles) => {
        console.log(`✅ Scraping process completed with ${profiles.length} profiles`);
      }).catch((error) => {
        console.error('❌ Error during scraping:', error);
        scraper.sendCompletionMessage(scraper.profiles, error.message);
      });
      sendResponse({ success: true, message: 'Scraping started' });
    } else if (request.action === 'stopScraping') {
      console.log('🛑 Stopping scraping process...');
      const currentProfiles = scraper.stopScraping();
      sendResponse({
        success: true,
        profiles: currentProfiles,
        message: `Scraping stopped with ${currentProfiles.length} profiles`
      });
    } else if (request.action === 'pauseScraping') {
      console.log('⏸️ Pausing scraping process...');
      scraper.pauseScraping().then((response) => {
        sendResponse(response);
      });
      return true;
    } else if (request.action === 'resumeScraping') {
      console.log('▶️ Resuming scraping process...');
      scraper.resumeScraping().then((response) => {
        sendResponse(response);
      });
      return true;
    } else if (request.action === 'scanProfiles') {
      console.log('🔍 Executing single page scan...');
      scraper.scanCurrentPage().then((profiles) => {
        sendResponse({
          success: true,
          profiles: profiles.map((p) => ({
            name: p.name,
            url: p.url,
            index: p.index
          }))
        });
      }).catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
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
  return true;
});