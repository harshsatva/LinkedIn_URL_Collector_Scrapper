// Background service worker for LinkedIn Scraper Extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn Scraper Extension installed');
});

// Handle messages between popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  // Forward progress messages to popup if it's open
  if (message.action === 'progress' || 
      message.action === 'scrapingComplete' || 
      message.action === 'scrapingError') {
    
    // Try to send to popup
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup might be closed, that's ok
      console.log('Could not send to popup - it might be closed');
    });
  }
  
  return true;
});

// Optional: Clean up any stored data on extension uninstall
chrome.runtime.onSuspend.addListener(() => {
  chrome.storage.local.clear();
});