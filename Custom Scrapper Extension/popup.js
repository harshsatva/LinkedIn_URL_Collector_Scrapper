class PopupController {
  constructor() {
    this.profiles = [];
    this.isScrapingActive = false;
    this.currentPage = 1;
    this.init();
  }

  async init() {
    this.elements = {
      status: document.getElementById('status'),
      profileCount: document.getElementById('profileCount'),
      scanButton: document.getElementById('scanProfiles'),
      stopButton: document.getElementById('stopScraping'),
      exportButton: document.getElementById('exportProfiles'),
      controlButtons: document.getElementById('controlButtons'),
      results: document.getElementById('results'),
      progressInfo: document.getElementById('progressInfo'),
      currentPage: document.getElementById('currentPage'),
      pageNumber: document.getElementById('pageNumber'),
      progressPage: document.getElementById('progressPage'),
      progressProfiles: document.getElementById('progressProfiles'),
      pauseButton: document.getElementById('pauseScraping'),
      resumeButton: document.getElementById('resumeScraping')
    };

    this.elements.scanButton.addEventListener('click', () => this.startScraping());
    this.elements.stopButton.addEventListener('click', () => this.stopScraping());
    this.elements.exportButton.addEventListener('click', () => this.exportProfiles());
    this.elements.pauseButton.addEventListener('click', () => this.pauseScraping());
    this.elements.resumeButton.addEventListener('click', () => this.resumeScraping());
    
    // Restore state when popup opens
    await this.restoreState();
    
    // Set up message listener for updates
    this.setupMessageListener();
    
    await this.checkLinkedInPage();
  }

  async restoreState() {
    try {
      // Get stored state from chrome storage
      const result = await chrome.storage.local.get([
        'scrapingActive', 
        'scrapingProfiles', 
        'scrapingCurrentPage',
        'scrapingStatus',
        'scrapingStatusType'
      ]);

      if (result.scrapingActive) {
        this.isScrapingActive = true;
        this.profiles = result.scrapingProfiles || [];
        this.currentPage = result.scrapingCurrentPage || 1;

        // Restore UI state
        this.showScrapingUI();
        this.updateProgress(this.currentPage, this.profiles.length);
        this.displayProfiles();

        // Restore status
        const status = result.scrapingStatus || 'Scraping in progress...';
        const statusType = result.scrapingStatusType || 'loading';
        this.updateStatus(status, statusType);

        // Check if paused
        if (statusType === 'warning' && status === 'Scraper paused') {
          this.showResumeButton();
        } else {
          this.showPauseButton();
        }

        console.log('State restored: scraping active with', this.profiles.length, 'profiles');
      } else {
        console.log('No active scraping session found');
      }
    } catch (error) {
      console.error('Error restoring state:', error);
    }
  }

  async saveState() {
    try {
      await chrome.storage.local.set({
        scrapingActive: this.isScrapingActive,
        scrapingProfiles: this.profiles,
        scrapingCurrentPage: this.currentPage,
        scrapingStatus: this.elements.status.textContent,
        scrapingStatusType: this.elements.status.className
      });
    } catch (error) {
      console.error('Error saving state:', error);
    }
  }

  async clearState() {
    try {
      await chrome.storage.local.remove([
        'scrapingActive',
        'scrapingProfiles', 
        'scrapingCurrentPage',
        'scrapingStatus',
        'scrapingStatusType'
      ]);
    } catch (error) {
      console.error('Error clearing state:', error);
    }
  }

  setupMessageListener() {
    // Set up a persistent listener for progress updates
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'scrapingProgress') {
        this.profiles = request.profiles || [];
        this.currentPage = request.currentPage || 1;
        this.updateProgress(this.currentPage, this.profiles.length);
        this.displayProfiles();
        this.saveState(); // Save state on each update
        sendResponse({ received: true });
      } else if (request.action === 'scrapingComplete') {
        this.profiles = request.profiles || [];
        
        if (request.error) {
          this.updateStatus(`Scraping error: ${request.error}`, 'error');
        } else {
          this.updateStatus(`Scraping completed! Found ${this.profiles.length} profiles`, 'success');
        }
        
        this.displayProfiles();
        this.isScrapingActive = false;
        this.hideScrapingUI();
        
        // Auto-export when completed
        if (this.profiles.length > 0) {
          this.saveProfilesToCSV();
          this.updateStatus(`Completed and exported ${this.profiles.length} profiles`, 'success');
        }
        
        this.clearState(); // Clear state when scraping completes
        sendResponse({ received: true });
      } else if (request.action === 'scrapingPaused') {
        this.updateStatus('Scraper paused', 'warning');
        this.showResumeButton();
        this.isScrapingActive = false;
        this.saveState();
        sendResponse({ received: true });
      } else if (request.action === 'scrapingResumed') {
        this.updateStatus('Scraping resumed...', 'loading');
        this.showPauseButton();
        this.isScrapingActive = true;
        this.saveState();
        sendResponse({ received: true });
      }
      return true;
    });
  }

  async checkLinkedInPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('linkedin.com')) {
        if (!this.isScrapingActive) {
          this.updateStatus('Please navigate to LinkedIn first', 'warning');
          this.elements.scanButton.disabled = true;
        }
        return;
      }

      if (tab.url.includes('/search/') || tab.url.includes('/in/') || tab.url.includes('/sales/search/')) {
        if (!this.isScrapingActive) {
          this.updateStatus('Ready to scan profiles', 'ready');
        }
      } else {
        if (!this.isScrapingActive) {
          this.updateStatus('Navigate to LinkedIn search results or Sales Navigator', 'info');
        }
      }
    } catch (error) {
      console.error('Error checking page:', error);
      if (!this.isScrapingActive) {
        this.updateStatus('Error checking page', 'error');
      }
    }
  }

  updateStatus(message, type = 'info') {
    this.elements.status.textContent = message;
    this.elements.status.className = type;
    // Save state whenever status changes
    if (this.isScrapingActive) {
      this.saveState();
    }
  }

  updateProgress(pageNum, profileCount) {
    this.elements.progressPage.textContent = pageNum;
    this.elements.progressProfiles.textContent = profileCount;
    this.elements.pageNumber.textContent = pageNum;
    this.elements.profileCount.textContent = profileCount;
    this.currentPage = pageNum;
  }

  showScrapingUI() {
    this.elements.scanButton.classList.add('hidden');
    this.elements.controlButtons.classList.remove('hidden');
    this.elements.progressInfo.classList.add('active');
    this.elements.currentPage.style.display = 'block';
    this.showPauseButton(); // Show the Pause button by default
  }

  hideScrapingUI() {
    this.elements.scanButton.classList.remove('hidden');
    this.elements.controlButtons.classList.add('hidden');
    this.elements.progressInfo.classList.remove('active');
    this.elements.currentPage.style.display = 'none';
  }

  showPauseButton() {
    this.elements.pauseButton.classList.remove('hidden');
    this.elements.resumeButton.classList.add('hidden');
  }

  showResumeButton() {
    this.elements.pauseButton.classList.add('hidden');
    this.elements.resumeButton.classList.remove('hidden');
  }

  async startScraping() {
    this.isScrapingActive = true;
    this.profiles = [];
    this.currentPage = 1;
    this.updateStatus('Starting scraper...', 'loading');
    this.showScrapingUI();
    
    // Save initial state
    await this.saveState();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'startScraping'
      });

      if (response && response.success) {
        this.updateStatus('Scraping in progress...', 'loading');
      } else {
        throw new Error(response?.error || 'Failed to start scraping');
      }
    } catch (error) {
      console.error('Error starting scraper:', error);
      this.updateStatus('Error starting scraper', 'error');
      this.hideScrapingUI();
      this.isScrapingActive = false;
      await this.clearState();
    }
  }

  async stopScraping() {
    if (!this.isScrapingActive) return;

    this.updateStatus('Stopping scraper...', 'loading');
    this.elements.stopButton.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'stopScraping'
      });

      if (response && response.success) {
        this.profiles = response.profiles || [];
        this.updateStatus(`Scraping stopped. Found ${this.profiles.length} profiles`, 'warning');
        this.displayProfiles();
        this.isScrapingActive = false;
        this.hideScrapingUI();
        
        // Auto-export when stopped
        if (this.profiles.length > 0) {
          this.saveProfilesToCSV();
          this.updateStatus(`Stopped and exported ${this.profiles.length} profiles`, 'success');
        }
        
        await this.clearState();
      } else {
        throw new Error(response?.error || 'Failed to stop scraping');
      }
    } catch (error) {
      console.error('Error stopping scraper:', error);
      this.updateStatus('Error stopping scraper', 'error');
    } finally {
      this.elements.stopButton.disabled = false;
    }
  }

  async pauseScraping() {
    if (!this.isScrapingActive) return;

    this.updateStatus('Pausing scraper...', 'loading');
    this.elements.pauseButton.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'pauseScraping'
      });

      if (response && response.success) {
        this.updateStatus('Scraping paused', 'warning');
        this.showResumeButton();
      } else {
        throw new Error(response?.error || 'Failed to pause scraping');
      }
    } catch (error) {
      console.error('Error pausing scraper:', error);
      this.updateStatus('Error pausing scraper', 'error');
    } finally {
      this.elements.pauseButton.disabled = false;
    }
  }

  async resumeScraping() {
    if (!this.isScrapingActive) return;

    this.updateStatus('Resuming scraper...', 'loading');
    this.elements.resumeButton.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'resumeScraping'
      });

      if (response && response.success) {
        this.updateStatus('Scraping resumed', 'success');
        this.showPauseButton();
      } else {
        throw new Error(response?.error || 'Failed to resume scraping');
      }
    } catch (error) {
      console.error('Error resuming scraper:', error);
      this.updateStatus('Error resuming scraper', 'error');
    } finally {
      this.elements.resumeButton.disabled = false;
    }
  }

  displayProfiles() {
    if (this.profiles.length === 0) {
      this.elements.results.innerHTML = '<span>No profiles found yet...</span>';
      return;
    }

    const profilesHtml = this.profiles.slice(0, 5).map(profile => {
      const isSuspicious = profile.name.toLowerCase().includes('offline') || 
                          profile.name.toLowerCase().includes('active') || 
                          profile.name === 'Unknown' || 
                          profile.name.length < 2;
      return `<span title="${profile.url}" class="${isSuspicious ? 'warning' : ''}">${profile.name}</span>`;
    }).join('');
    
    const remainingCount = this.profiles.length - 5;
    const remainingHtml = remainingCount > 0 ? `<span>+${remainingCount} more</span>` : '';
    
    this.elements.results.innerHTML = profilesHtml + remainingHtml;
  }

  exportProfiles() {
    if (this.profiles.length === 0) {
      this.updateStatus('No profiles to export', 'warning');
      return;
    }

    this.saveProfilesToCSV();
    this.updateStatus(`Exported ${this.profiles.length} profiles to CSV`, 'success');
  }

  saveProfilesToCSV() {
    const headers = ['url'];
    const csvContent = [
      headers.join(','), 
      ...this.profiles.map(profile => `"${(profile.url || '').replace(/"/g, '""')}"`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString()
      .replace(/[:T]/g, '-')
      .split('.')[0];
    const fileName = `linkedin_profiles_${timestamp}.csv`;

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.click();
    URL.revokeObjectURL(url);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});


