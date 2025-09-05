let currentSheetData = null;
let scrapedResults = [];
let currentScrapingState = "idle";

function getCsvUrl(sheetUrl) {
  try {
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = sheetUrl.match(/gid=(\d+)/);
    if (!match) {
      console.error("❌ Could not extract Sheet ID from URL:", sheetUrl);
      return null;
    }

    const sheetId = match[1];
    const gid = gidMatch ? gidMatch[1] : "0";

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    console.log("✅ Generated CSV URL:", csvUrl);
    return csvUrl;
  } catch (e) {
    console.error("❌ Error parsing URL:", e);
    return null;
  }
}

function parseCsv(csvText) {
  console.log("📄 Raw CSV Text length:", csvText.length);
  console.log("📄 CSV Preview:", csvText.substring(0, 200), "...");

  const rows = [];
  const lines = csvText.split('\n');

  for (let line of lines) {
    if (!line.trim()) continue;

    const row = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }

    row.push(current.trim().replace(/^"|"$/g, ''));
    rows.push(row);
  }

  console.log("📊 Parsed", rows.length, "rows");
  console.log("📊 First row:", rows[0]);

  return rows;
}

function populateDropdowns(headers) {
  console.log("📊 Headers detected:", headers);

  const dropdownIds = ["personalColumn", "companyColumn", "websiteColumn", "emailColumn"];

  dropdownIds.forEach(id => {
    const select = document.getElementById(id);
    if (!select) {
      console.error(`❌ Dropdown with ID '${id}' not found in DOM`);
      return;
    }

    select.innerHTML = "";

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "Select Column";
    select.appendChild(defaultOpt);

    headers.forEach(header => {
      const option = document.createElement("option");
      option.value = header;
      option.textContent = header;
      select.appendChild(option);
    });

    console.log(`✅ Populated dropdown '${id}' with ${headers.length} options`);
  });
}

function checkIfRowAlreadyScraped(row, headers) {
  const indicatorColumns = [
    "Designation",
    "Current Position",
    "Experience",
    "Education",
    "About"
  ];

  for (const columnName of indicatorColumns) {
    const columnIndex = headers.indexOf(columnName);

    if (columnIndex !== -1 && columnIndex < row.length) {
      const cellValue = row[columnIndex];

      if (cellValue && cellValue.toString().trim().length > 0) {
        return true;
      }
    }
  }

  return false;
}

function createProgressElements() {
  const progressHTML = `
        <div id="websiteProgress" style="display: none; margin-top: 10px;">
            <div class="progress-bar">
                <div id="websiteProgressFill" class="progress-fill"></div>
            </div>
            <div id="websiteProgressText" class="progress-text">Processing...</div>
        </div>
    `;

  const button = document.getElementById("startWebsiteScraping");
  if (button && !document.getElementById("websiteProgress")) {
    button.insertAdjacentHTML('afterend', progressHTML);
  }
}

function extractLinkedInUrls() {
  console.log("🔗 Starting LinkedIn URL extraction...");

  if (!currentSheetData) {
    console.error("❌ No sheet data available");
    return [];
  }

  const personalColumn = document.getElementById("personalColumn").value;
  console.log("📋 Selected personal column:", personalColumn);

  if (!personalColumn) {
    console.error("❌ No personal column selected");
    return [];
  }

  const headers = currentSheetData[0];
  const columnIndex = headers.indexOf(personalColumn);
  console.log("📍 Column index for", personalColumn, ":", columnIndex);

  if (columnIndex === -1) {
    console.error("❌ Column not found in headers");
    return [];
  }

  console.log("📊 Total rows in sheet data:", currentSheetData.length);
  console.log("📊 First few rows:", currentSheetData.slice(0, 3));
  console.log("📊 Sample URLs from column", columnIndex, ":");
  for (let i = 1; i < Math.min(5, currentSheetData.length); i++) {
    const row = currentSheetData[i];
    const url = row[columnIndex];
    console.log(`  Row ${i}: "${url}" (type: ${typeof url})`);
  }

  const linkedinUrls = [];

  for (let i = 1; i < currentSheetData.length; i++) {
    const row = currentSheetData[i];
    const url = row[columnIndex];

    if (!url || !url.trim()) {
      console.log(`⚪ Row ${i}: Empty cell, skipping`);
      continue;
    }

    const hasExistingData = checkIfRowAlreadyScraped(row, headers);
    if (hasExistingData) {
      console.log(`✅ Row ${i}: Already scraped, skipping`);
      continue;
    }

    const cleanUrl = url.trim();

    if (cleanUrl.toLowerCase().includes('chrome-extension://')) {
      console.log(`🚫 Row ${i}: Skipping chrome extension URL: ${cleanUrl}`);
    } else if (cleanUrl.toLowerCase().includes('linkedin.com/in/')) {
      if (cleanUrl.toLowerCase().endsWith('linkedin.com/in/') || cleanUrl.toLowerCase().endsWith('linkedin.com/in')) {
        console.log(`🚫 Row ${i}: Incomplete LinkedIn URL: ${cleanUrl}`);
      } else {
        linkedinUrls.push(cleanUrl);
        console.log(`✅ Found LinkedIn URL ${i}: ${cleanUrl}`);
      }
    } else {
      console.log(`⚠️ Row ${i}: Not a LinkedIn profile URL: ${cleanUrl}`);
    }
  }

  console.log("🔗 Total LinkedIn URLs extracted:", linkedinUrls.length);
  return linkedinUrls;
}

function updateStatus(message, isError = false) {
  console.log(`📱 Status update: ${message} (error: ${isError})`);
  const status = document.querySelector(".status");
  status.textContent = message;
  status.style.color = isError ? "#d93025" : "#888";
}

function updateStatusWithAutoPush(message, recordsSinceLastPush = 0, autoPushInterval = 10) {
  const pushInfo = recordsSinceLastPush > 0 ?
    ` (${recordsSinceLastPush}/${autoPushInterval} until auto-push)` : "";
  updateStatus(message + pushInfo);
}

function updateButtonStates(state, preserveState = false) {
  const enrichBtn = document.getElementById("enrichBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const pushBtn = document.getElementById("pushBtn");

  if (!preserveState) {
    currentScrapingState = state;
  }

  console.log("🔄 Updating button states to:", currentScrapingState);

  switch (currentScrapingState) {
    case "scraping":
      enrichBtn.disabled = true;
      enrichBtn.textContent = "Enriching...";
      pauseBtn.disabled = false;
      pauseBtn.textContent = "Pause Scraping";
      pushBtn.disabled = true;
      break;

    case "paused":
      enrichBtn.disabled = false;
      enrichBtn.textContent = "Resume Scraping";
      pauseBtn.disabled = false;
      pauseBtn.textContent = "Resume Scraping";
      pushBtn.disabled = false;
      break;

    case "completed":
      enrichBtn.disabled = false;
      enrichBtn.textContent = "Enrich Data";
      pauseBtn.disabled = true;
      pauseBtn.textContent = "Pause Scraping";
      pushBtn.disabled = false;
      break;

    case "idle":
    default:
      enrichBtn.disabled = false;
      enrichBtn.textContent = "Enrich Data";
      pauseBtn.disabled = true;
      pauseBtn.textContent = "Pause Scraping";
      pushBtn.disabled = true;
      break;
  }
}

function addResult(profile) {
  scrapedResults.push(profile);
  const resultsSection = document.getElementById("resultsSection");
  const resultsCounter = document.getElementById("resultsCounter");
  resultsSection.classList.remove("hidden");
  resultsCounter.textContent = `Results: ${scrapedResults.length}`;
}

function clearResults() {
  scrapedResults = [];
  const resultsCounter = document.getElementById("resultsCounter");
  const resultsSection = document.getElementById("resultsSection");
  resultsCounter.textContent = "Results: 0";
  resultsSection.classList.add("hidden");
}

async function downloadResults() {
  console.log("📥 Download button clicked");

  try {
    const response = await chrome.runtime.sendMessage({
      action: "getScrapingResults"
    });

    console.log("📊 Background response:", response);

    if (response.results && response.results.length > 0) {
      const jsonData = JSON.stringify(response.results, null, 2);
      const blob = new Blob([jsonData], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `linkedin_profiles_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
      console.log("✅ Manual download completed");
    } else {
      console.warn("⚠️ No results available for download");
      alert("No results to download. Please scrape some profiles first.");
    }
  } catch (error) {
    console.error("❌ Error downloading results:", error);
    alert("Error downloading results. Please try again.");
  }
}

document.getElementById("sheetUrl").addEventListener("change", async (e) => {
  const url = e.target.value.trim();
  console.log("🔗 Sheet URL entered:", url);
  updateStatus("Loading...");

  const csvUrl = getCsvUrl(url);
  if (!csvUrl) {
    updateStatus("Invalid URL", true);
    return;
  }

  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/gid=(\d+)/);
  const sheetId = match ? match[1] : "";
  const gid = gidMatch ? gidMatch[1] : "0";

  await chrome.storage.local.set({
    sheetUrl: csvUrl,
    sheetId: sheetId,
    gid: gid
  });
  console.log("✅ Stored sheet data:", { csvUrl, sheetId, gid });

  try {
    console.log("🌐 Fetching CSV from:", csvUrl);
    const res = await fetch(csvUrl);
    console.log("🌐 Fetch response status:", res.status, res.statusText);

    if (!res.ok) throw new Error(`Failed to fetch. Status: ${res.status}`);

    const csvText = await res.text();
    console.log("📄 CSV text received, length:", csvText.length);

    const rows = parseCsv(csvText);
    console.log("📊 Parsed rows:", rows.length);

    currentSheetData = rows;

    if (rows.length > 0) {
      const headers = rows[0];
      populateDropdowns(headers);
      updateStatus("Loaded ✅");
      console.log("✅ Sheet data loaded successfully");
    } else {
      updateStatus("No data found", true);
      console.warn("⚠️ CSV contained no rows");
    }
  } catch (err) {
    console.error("❌ Fetch/Parsing error:", err);
    updateStatus("Error loading", true);
  }
});

document.getElementById("startWebsiteScraping").addEventListener("click", async () => {
  const websiteColumn = document.getElementById("websiteColumn").value;
  const button = document.getElementById("startWebsiteScraping");

  if (!websiteColumn) {
    alert("❌ Please select a website column first!");
    return;
  }

  if (!currentSheetData || currentSheetData.length === 0) {
    alert("❌ No sheet data loaded. Please load a sheet first!");
    return;
  }

  const headers = currentSheetData[0];
  const colIndex = headers.indexOf(websiteColumn);

  if (colIndex === -1) {
    console.error("❌ Column not found in headers");
    alert("❌ Selected column not found in sheet headers!");
    return;
  }

  // Regular expression to validate URLs
  const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/;

  const websites = [];
  for (let i = 1; i < currentSheetData.length; i++) {
    const row = currentSheetData[i];
    const site = row[colIndex]?.trim(); // Safely access and trim the website column value
    if (site && site !== "N/A" && site !== "-" && urlRegex.test(site)) {
      websites.push(site);
    }
  }

  if (websites.length === 0) {
    alert("❌ No valid websites found in the selected column!");
    return;
  }

  if (websites.length === 0) {
    alert("❌ No valid websites found in the selected column!");
    return;
  }

  console.log("🌐 Extracted websites:", websites);

  const confirmMessage = `🌐 Found ${websites.length} websites to scrape.\n\nThis may take ${Math.ceil(websites.length * 2)} seconds.\n\nProceed?`;
  if (!confirm(confirmMessage)) return;

  button.disabled = true;
  button.textContent = "🔄 Scraping Websites...";

  createProgressElements();
  const progressContainer = document.getElementById("websiteProgress");
  const progressFill = document.getElementById("websiteProgressFill");
  const progressText = document.getElementById("websiteProgressText");

  if (progressContainer) {
    progressContainer.style.display = "block";
    progressText.textContent = `Starting to scrape ${websites.length} websites...`;
  }

  try {
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Scraping timed out after 5 minutes"));
      }, 300000);

      chrome.runtime.sendMessage(
        { action: "startWebsiteScraping", websites },
        (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    console.log("🌐 Website scraping response:", response);

    if (response.status === "completed") {
      if (progressFill) progressFill.style.width = "100%";
      if (progressText) {
        progressText.textContent = `✅ Completed! ${response.successful}/${response.total} sites scraped successfully`;
      }

      const successMsg = `✅ Website scraping completed!\n\n` +
        `• Total sites: ${response.total}\n` +
        `• Successful: ${response.successful}\n` +
        `• Failed: ${response.failed}\n\n` +
        `Data has been saved to your Google Sheet!`;

      alert(successMsg);

    } else if (response.status === "error") {
      throw new Error(response.message || "Unknown error occurred");
    }

  } catch (error) {
    console.error("❌ Website scraping error:", error);

    if (progressText) {
      progressText.textContent = `❌ Error: ${error.message}`;
    }

    alert(`❌ Error during website scraping:\n${error.message}`);

  } finally {
    button.disabled = false;
    button.textContent = "🌐 Start Website Scraping";

    setTimeout(() => {
      if (progressContainer) {
        progressContainer.style.display = "none";
      }
    }, 3000);
  }
});

async function handleEnrichButton() {
  console.log("🚀 Enrich button clicked, current state:", currentScrapingState);

  const personalColumn = document.getElementById("personalColumn").value;
  if (!personalColumn) {
    updateStatus("Please select personal LinkedIn column", true);
    return;
  }

  if (currentScrapingState === "paused") {
    console.log("▶️ Resuming paused scraping...");
    updateStatus("Resuming scraping...");

    try {
      const response = await chrome.runtime.sendMessage({ action: "resumeScraping" });

      if (response.status === "resumed") {
        updateButtonStates("scraping");
      } else {
        updateStatus("Error resuming scraping", true);
      }
    } catch (error) {
      console.error("❌ Error resuming scraping:", error);
      updateStatus("Error resuming scraping", true);
    }
    return;
  }

  const urls = extractLinkedInUrls();
  if (urls.length === 0) {
    updateStatus("No valid LinkedIn URLs found", true);
    return;
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      updateStatus("No active tab found", true);
      return;
    }

    const currentTab = tabs[0];
    updateStatus(`Starting scraping for ${urls.length} profiles...`);

    console.log("📤 Sending message to background script...");

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: "startScraping",
        urls: urls,
        tabId: currentTab.id
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    console.log("📥 Response from background:", response);

    if (response && response.status === "started") {
      console.log("✅ Scraping started successfully");
      updateStatus(`Scraping ${urls.length} profiles...`);
      updateButtonStates("scraping");
    } else {
      console.error("❌ Failed to start scraping:", response);
      updateStatus(`Error: ${response?.message || "Failed to start scraping"}`, true);
    }
  } catch (error) {
    console.error("❌ Error in enrich button handler:", error);
    updateStatus("Error starting scraping", true);
  }
}

chrome.runtime.onMessage.addListener((request) => {
  console.log("📥 Message received from background:", request);

  if (request.action === "scrapingProgress") {
    const recordsSinceLastPush = request.recordsSinceLastPush || 0;
    const message = `Processing ${request.currentIndex}/${request.total}`;
    console.log("📊 Progress update:", message);

    updateStatusWithAutoPush(message, recordsSinceLastPush);
    currentScrapingState = "scraping";
    updateButtonStates("scraping", true);

    if (request.profile) {
      addResult(request.profile);
    }
  }
  else if (request.action === "scrapingCompleted") {
    const message = `Completed: ${request.total} profiles scraped`;
    console.log("✅ Scraping completed:", message);
    updateStatus(message);
    updateButtonStates("completed");

    if (request.results && request.results.length > 0) {
      scrapedResults = request.results;
      const resultsSection = document.getElementById("resultsSection");
      const resultsCounter = document.getElementById("resultsCounter");
      resultsSection.classList.remove("hidden");
      resultsCounter.textContent = `Results: ${request.results.length}`;
    }
  }
  else if (request.action === "scrapingStopped") {
    const recordsSinceLastPush = request.recordsSinceLastPush || 0;
    const message = `Paused: ${request.completed}/${request.total} profiles`;
    console.log("⏸️ Scraping paused:", message);

    updateStatusWithAutoPush(message, recordsSinceLastPush);
    updateButtonStates("paused");
  }
  else if (request.action === "scrapingResumed") {
    const recordsSinceLastPush = request.recordsSinceLastPush || 0;
    const message = `Resumed: ${request.currentIndex + 1}/${request.total} profiles`;
    console.log("▶️ Scraping resumed:", message);

    updateStatusWithAutoPush(message, recordsSinceLastPush);
    updateButtonStates("scraping");
  }
  else if (request.action === "autoPushStarted") {
    const message = `Auto-pushing ${request.recordCount} records to sheets...`;
    console.log("🔄 Auto-push started:", message);
    updateStatus(message);
  }
  else if (request.action === "autoPushCompleted") {
    const message = `Processing ${request.currentIndex}/${request.total} (Auto-push completed ✅)`;
    console.log("✅ Auto-push completed:", message);
    updateStatus(message);
  }
  else if (request.action === "autoPushError") {
    const errorMsg = request.isFinalPush ?
      `Final auto-push failed: ${request.error}` :
      `Auto-push failed: ${request.error}`;
    console.error("❌ Auto-push error:", errorMsg);
    updateStatus(errorMsg, true);
  }
  else if (request.action === "pushCompleted") {
    const pushMsg = "Data pushed to sheets successfully! ✅";
    updateStatus(pushMsg);
    updateButtonStates(request.preservedState || "completed");
  }
});

document.addEventListener('DOMContentLoaded', () => {
  console.log("📱 DOM loaded - Setting up event listeners");

  const enrichBtn = document.getElementById("enrichBtn");
  if (enrichBtn) {
    enrichBtn.addEventListener("click", handleEnrichButton);
  }

  const pauseBtn = document.getElementById("pauseBtn");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", async () => {
      const currentText = pauseBtn.textContent;

      if (currentText === "Pause Scraping") {
        console.log("⏸️ Pausing scraping...");
        await chrome.runtime.sendMessage({ action: "pauseScraping" });
        updateStatus("Scraping paused");
        updateButtonStates("paused");
      } else if (currentText === "Resume Scraping") {
        console.log("▶️ Resuming scraping...");
        updateStatus("Resuming scraping...");

        const response = await chrome.runtime.sendMessage({ action: "resumeScraping" });

        if (response.status === "resumed") {
          updateButtonStates("scraping");
        } else {
          updateStatus("Error resuming scraping", true);
        }
      }
    });
  }

  const pushBtn = document.getElementById("pushBtn");
  if (pushBtn) {
    pushBtn.addEventListener("click", async () => {
      const previousState = currentScrapingState;
      updateStatus("Pushing data to sheets...");

      const response = await chrome.runtime.sendMessage({ action: "pushToSheets" });

      if (response.success) {
        updateStatus("Data pushed successfully!");
        if (previousState === "paused") {
          updateButtonStates("paused");
        } else if (previousState === "completed") {
          updateButtonStates("completed");
        }
      } else {
        updateStatus("Error pushing data", true);
      }
    });
  }

  const downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadResults);
  }

  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", clearResults);
  }

  const autoPushSelect = document.getElementById("autoPushInterval");
  if (autoPushSelect) {
    autoPushSelect.addEventListener("change", async (e) => {
      const interval = parseInt(e.target.value);
      console.log("⚙️ Auto-push interval changed to:", interval);

      await chrome.runtime.sendMessage({
        action: "setAutoPushInterval",
        interval: interval
      });

      updateStatus(`Auto-push set to every ${interval} records`);
    });
  }

  console.log("✅ Event listeners setup completed");
});