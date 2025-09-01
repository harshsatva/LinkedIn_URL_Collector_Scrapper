// class PopupController {
//   constructor() {
//     this.profiles = [];
//     this.init();
//   }

//   init() {
//     this.elements = {
//       status: document.getElementById('status'),
//       profileCount: document.getElementById('profileCount'),
//       scanButton: document.getElementById('scanProfiles'),
//       results: document.getElementById('results')
//     };

//     this.elements.scanButton.addEventListener('click', () => this.scanProfiles());
//     this.checkLinkedInPage();
//   }

//   async checkLinkedInPage() {
//     try {
//       const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
//       if (!tab.url.includes('linkedin.com')) {
//         this.updateStatus('Please navigate to LinkedIn first', 'warning');
//         this.elements.scanButton.disabled = true;
//         return;
//       }

//       // Include Sales Navigator pages
//       if (tab.url.includes('/search/') || tab.url.includes('/in/') || tab.url.includes('/sales/search/')) {
//         this.updateStatus('Ready to scan profiles', 'ready');
//       } else {
//         this.updateStatus('Navigate to LinkedIn search results or Sales Navigator', 'info');
//       }
//     } catch (error) {
//       console.error('Error checking page:', error);
//       this.updateStatus('Error checking page', 'error');
//     }
//   }

//   updateStatus(message, type = 'info') {
//     this.elements.status.textContent = message;
//     this.elements.status.className = type;
//   }

//   async scanProfiles() {
//     this.updateStatus('Scanning page...', 'loading');
//     this.elements.scanButton.disabled = true;

//     try {
//       const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
//       const response = await chrome.tabs.sendMessage(tab.id, { 
//         action: 'scanProfiles' 
//       });

//       if (response && response.success) {
//         this.profiles = response.profiles;
//         this.elements.profileCount.textContent = this.profiles.length;
        
//         if (this.profiles.length > 0) {
//           this.updateStatus(`Found ${this.profiles.length} profiles. Saved to profiles.csv`, 'success');
//           this.displayProfiles();
//           this.saveProfilesToCSV();
//         } else {
//           this.updateStatus('No profiles found on this page', 'warning');
//         }
//       } else {
//         throw new Error(response?.error || 'Failed to scan profiles');
//       }
//     } catch (error) {
//       console.error('Error scanning profiles:', error);
//       this.updateStatus('Error scanning profiles', 'error');
//     } finally {
//       this.elements.scanButton.disabled = false;
//     }
//   }

//   displayProfiles() {
//     const profilesHtml = this.profiles.slice(0, 5).map(profile => {
//       const isSuspicious = profile.name.toLowerCase().includes('offline') || 
//                           profile.name.toLowerCase().includes('active') || 
//                           profile.name === 'Unknown' || 
//                           profile.name.length < 2;
//       return `<span title="${profile.url}" class="${isSuspicious ? 'warning' : ''}">${profile.name}</span>`;
//     }).join('');
    
//     const remainingCount = this.profiles.length - 5;
//     const remainingHtml = remainingCount > 0 ? `<span>+${remainingCount} more</span>` : '';
    
//     this.elements.results.innerHTML = profilesHtml + remainingHtml;
//   }

//   saveProfilesToCSV() {
//   // Only export URLs
//   const headers = ['url'];
//   const csvContent = [
//     headers.join(','), 
//     ...this.profiles.map(profile => `"${(profile.url || '').replace(/"/g, '""')}"`)
//   ].join('\n');

//   const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
//   const url = URL.createObjectURL(blob);

//   // Add timestamp to filename
//   const timestamp = new Date().toISOString()
//     .replace(/[:T]/g, '-')   // replace : and T with -
//     .split('.')[0];          // remove milliseconds
//   const fileName = `profiles.csv`;

//   const link = document.createElement('a');
//   link.setAttribute('href', url);
//   link.setAttribute('download', fileName);
//   link.click();
//   URL.revokeObjectURL(url);
//   }

// }

// document.addEventListener('DOMContentLoaded', () => {
//   new PopupController();
// });


class PopupController {
  constructor() {
    this.profiles = [];
    this.isScrapingActive = false;
    this.init();
  }

  init() {
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
      progressProfiles: document.getElementById('progressProfiles')
    };

    this.elements.scanButton.addEventListener('click', () => this.startScraping());
    this.elements.stopButton.addEventListener('click', () => this.stopScraping());
    this.elements.exportButton.addEventListener('click', () => this.exportProfiles());
    
    this.checkLinkedInPage();
  }

  async checkLinkedInPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('linkedin.com')) {
        this.updateStatus('Please navigate to LinkedIn first', 'warning');
        this.elements.scanButton.disabled = true;
        return;
      }

      if (tab.url.includes('/search/') || tab.url.includes('/in/') || tab.url.includes('/sales/search/')) {
        this.updateStatus('Ready to scan profiles', 'ready');
      } else {
        this.updateStatus('Navigate to LinkedIn search results or Sales Navigator', 'info');
      }
    } catch (error) {
      console.error('Error checking page:', error);
      this.updateStatus('Error checking page', 'error');
    }
  }

  updateStatus(message, type = 'info') {
    this.elements.status.textContent = message;
    this.elements.status.className = type;
  }

  updateProgress(pageNum, profileCount) {
    this.elements.progressPage.textContent = pageNum;
    this.elements.progressProfiles.textContent = profileCount;
    this.elements.pageNumber.textContent = pageNum;
    this.elements.profileCount.textContent = profileCount;
  }

  showScrapingUI() {
    this.elements.scanButton.classList.add('hidden');
    this.elements.controlButtons.classList.remove('hidden');
    this.elements.progressInfo.classList.add('active');
    this.elements.currentPage.style.display = 'block';
  }

  hideScrapingUI() {
    this.elements.scanButton.classList.remove('hidden');
    this.elements.controlButtons.classList.add('hidden');
    this.elements.progressInfo.classList.remove('active');
    this.elements.currentPage.style.display = 'none';
  }

  async startScraping() {
    this.isScrapingActive = true;
    this.profiles = [];
    this.updateStatus('Starting scraper...', 'loading');
    this.showScrapingUI();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Start the scraping process
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'startScraping'
      });

      if (response && response.success) {
        this.updateStatus('Scraping in progress...', 'loading');
        this.listenForProgress();
      } else {
        throw new Error(response?.error || 'Failed to start scraping');
      }
    } catch (error) {
      console.error('Error starting scraper:', error);
      this.updateStatus('Error starting scraper', 'error');
      this.hideScrapingUI();
      this.isScrapingActive = false;
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

  listenForProgress() {
    // Set up a listener for progress updates from content script
    const progressListener = (request, sender, sendResponse) => {
      if (request.action === 'scrapingProgress') {
        this.profiles = request.profiles || [];
        this.updateProgress(request.currentPage || 1, this.profiles.length);
        this.displayProfiles();
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
        
        chrome.runtime.onMessage.removeListener(progressListener);
        sendResponse({ received: true });
      }
      return true; // Keep message channel open
    };

    chrome.runtime.onMessage.addListener(progressListener);
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
    // Only export URLs
    const headers = ['url'];
    const csvContent = [
      headers.join(','), 
      ...this.profiles.map(profile => `"${(profile.url || '').replace(/"/g, '""')}"`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Add timestamp to filename
    const timestamp = new Date().toISOString()
      .replace(/[:T]/g, '-')   // replace : and T with -
      .split('.')[0];          // remove milliseconds
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