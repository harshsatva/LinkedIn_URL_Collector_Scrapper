let accessToken = null;
let tokenExpiryTime = null;

async function authenticate() {
    return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
            {
                url: `https://accounts.google.com/o/oauth2/auth?client_id=782044237037-47bhoo6r33grovhanh9u61bjuq6kbje8.apps.googleusercontent.com&response_type=token&redirect_uri=https://${chrome.runtime.id}.chromiumapp.org/&scope=https://www.googleapis.com/auth/spreadsheets`,
                interactive: true
            },
            (redirectUrl) => {
                if (chrome.runtime.lastError || !redirectUrl) {
                    reject(new Error(chrome.runtime.lastError?.message || "Authentication failed"));
                    return;
                }

                const urlParams = new URLSearchParams(new URL(redirectUrl).hash.substring(1));
                accessToken = urlParams.get("access_token");
                const expiresIn = urlParams.get("expires_in");

                tokenExpiryTime = Date.now() + (parseInt(expiresIn || "3600") * 1000);

                console.log("✅ Got access token:", accessToken?.substring(0, 20) + "...");
                console.log("⏰ Token expires at:", new Date(tokenExpiryTime).toISOString());

                chrome.storage.local.set({
                    accessToken,
                    tokenExpiryTime
                });
                resolve(accessToken);
            }
        );
    });
}

function isTokenValid(token, expiryTime) {
    if (!token || !expiryTime) return false;
    return Date.now() < (expiryTime - 300000);
}

async function getAccessToken() {
    if (accessToken && tokenExpiryTime && isTokenValid(accessToken, tokenExpiryTime)) {
        console.log("✅ Using cached valid token");
        return accessToken;
    }

    const stored = await chrome.storage.local.get(["accessToken", "tokenExpiryTime"]);
    if (stored.accessToken && stored.tokenExpiryTime &&
        isTokenValid(stored.accessToken, stored.tokenExpiryTime)) {
        console.log("✅ Using stored valid token");
        accessToken = stored.accessToken;
        tokenExpiryTime = stored.tokenExpiryTime;
        return accessToken;
    }

    console.log("🔄 Token expired or invalid, re-authenticating...");
    return authenticate();
}

async function testTokenValidity(token) {
    try {
        const response = await fetch(
            'https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + token,
            { method: 'GET' }
        );

        if (response.ok) {
            const tokenInfo = await response.json();
            console.log("✅ Token is valid, expires in:", tokenInfo.expires_in, "seconds");
            return true;
        } else {
            console.error("❌ Token validation failed:", response.status);
            return false;
        }
    } catch (error) {
        console.error("❌ Error validating token:", error);
        return false;
    }
}

console.log("🔧 Background script loaded");

let isScrapingActive = false;
let scrapingResults = [];
let currentProfileIndex = 0;
let totalProfiles = 0;
let profileUrls = [];
let activeTabId = null;
let isPaused = false;
let scrapingState = "idle";

// Auto-push configuration
let autoPushInterval = 10;
let lastPushIndex = 0;

// FIXED: Prevent duplicate message handling
let isProcessingStartScraping = false;

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    console.log("📥 Background received message:", request.action);

    if (request.action === "startScraping") {
        console.log("🚀 Processing startScraping request...");

        // FIXED: Prevent duplicate processing
        if (isProcessingStartScraping) {
            console.warn("⚠️ Already processing startScraping, ignoring duplicate");
            sendResponse({ status: "processing", message: "Already processing start request" });
            return true;
        }

        if (isScrapingActive && scrapingState === "scraping") {
            console.warn("⚠️ Scraping already in progress");
            sendResponse({ status: "already_running", message: "Scraping already in progress" });
            return true;
        }

        // FIXED: Set processing flag
        isProcessingStartScraping = true;

        try {
            profileUrls = request.urls || [];
            console.log("📋 Received URLs:", profileUrls.length);

            if (!profileUrls.length) {
                console.error("❌ No URLs provided");
                sendResponse({ status: "error", message: "No URLs provided" });
                return true;
            }

            activeTabId = request.tabId;
            console.log("📱 Using tab ID:", activeTabId);

            if (!activeTabId) {
                console.error("❌ No tab ID provided");
                sendResponse({ status: "error", message: "No tab ID provided" });
                return true;
            }

            // FIXED: Validate tab synchronously first
            chrome.tabs.get(activeTabId, (tab) => {
                if (chrome.runtime.lastError) {
                    console.error("❌ Tab not found:", chrome.runtime.lastError);
                    isProcessingStartScraping = false; // Reset flag
                    sendResponse({ status: "error", message: "Invalid tab ID" });
                    return;
                }

                console.log("✅ Tab verified:", tab.id, tab.url);

                // Check if we're truly resuming vs starting fresh
                const wasResuming = scrapingState === "paused" && currentProfileIndex > 0;
                const isStartingFresh = !wasResuming || scrapingResults.length === 0;

                if (isStartingFresh) {
                    console.log("🔄 Starting completely fresh scraping session");
                    scrapingResults = [];
                    currentProfileIndex = 0;
                    lastPushIndex = 0;
                    totalProfiles = profileUrls.length;
                } else {
                    console.log("▶️ Resuming from paused state at index:", currentProfileIndex);
                }

                // Update scraping session state
                isScrapingActive = true;
                isPaused = false;
                scrapingState = "scraping";

                console.log(`🎯 Scraping state: fresh=${isStartingFresh}, resuming=${wasResuming}`);
                console.log(`🎯 Will ${isStartingFresh ? 'start' : 'resume'} at profile ${currentProfileIndex + 1}/${totalProfiles}`);

                // Validate before starting
                if (currentProfileIndex >= profileUrls.length) {
                    console.error("❌ Current index exceeds URL array length");
                    isProcessingStartScraping = false; // Reset flag
                    sendResponse({ status: "error", message: "Invalid profile index" });
                    return;
                }

                // FIXED: Reset processing flag before starting scraping
                isProcessingStartScraping = false;

                // Start scraping
                scrapeNextProfile();

                sendResponse({
                    status: "started",
                    resuming: wasResuming,
                    currentIndex: currentProfileIndex,
                    totalProfiles: totalProfiles
                });
            });

        } catch (error) {
            console.error("❌ Error in startScraping:", error);
            isProcessingStartScraping = false; // Reset flag
            sendResponse({ status: "error", message: error.message });
        }

        return true; // Keep message channel open for async response
    }
    else if (request.action === "profileScraped") {
        console.log("📊 Profile scraped:", request.profile?.Name || "Unknown");
        handleProfileResult(request.profile, request.url);
        sendResponse({ status: "received" });
        return true;
    }
    else if (request.action === "pauseScraping") {
        console.log("⏸️ Pause scraping requested");
        isScrapingActive = false;
        isPaused = true;
        scrapingState = "paused";

        chrome.runtime.sendMessage({
            action: "scrapingStopped",
            completed: currentProfileIndex,
            total: totalProfiles,
            state: "paused",
            recordsSinceLastPush: scrapingResults.length - lastPushIndex
        }).catch(err => console.warn("Could not send pause update:", err));

        sendResponse({ status: "paused", completed: currentProfileIndex });
        return true;
    }
    else if (request.action === "resumeScraping") {
        console.log("▶️ Resume scraping requested");

        if (scrapingState !== "paused") {
            sendResponse({ status: "error", message: "No paused session to resume" });
            return true;
        }

        if (currentProfileIndex >= totalProfiles) {
            sendResponse({ status: "error", message: "All profiles already completed" });
            return true;
        }

        isScrapingActive = true;
        isPaused = false;
        scrapingState = "scraping";

        console.log(`▶️ Resuming scraping from profile ${currentProfileIndex + 1}/${totalProfiles}`);

        chrome.runtime.sendMessage({
            action: "scrapingResumed",
            currentIndex: currentProfileIndex,
            total: totalProfiles,
            recordsSinceLastPush: scrapingResults.length - lastPushIndex
        }).catch(err => console.warn("Could not send resume update:", err));

        scrapeNextProfile();
        sendResponse({ status: "resumed", currentIndex: currentProfileIndex });
        return true;
    }
    else if (request.action === "getStatus") {
        console.log("📊 Status requested");
        sendResponse({
            isActive: isScrapingActive,
            currentIndex: currentProfileIndex,
            total: totalProfiles,
            results: scrapingResults.length,
            state: scrapingState,
            recordsSinceLastPush: scrapingResults.length - lastPushIndex,
            autoPushInterval: autoPushInterval
        });
        return true;
    }
    else if (request.action === "getScrapingResults") {
        console.log("📥 Scraping results requested");
        sendResponse({
            results: scrapingResults,
            count: scrapingResults.length,
            isActive: isScrapingActive,
            currentIndex: currentProfileIndex,
            total: totalProfiles,
            state: scrapingState,
            recordsSinceLastPush: scrapingResults.length - lastPushIndex,
            lastPushIndex: lastPushIndex
        });
        return true;
    }
    else if (request.action === "stopScraping") {
        console.log("⏹️ Stop scraping requested");
        stopScraping();
        sendResponse({ status: "stopped" });
        return true;
    }
    else if (request.action === "authGoogle") {
        authenticate()
            .then(token => sendResponse({ success: true, token }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    else if (request.action === "updateSheet") {
        updateSheet(request.spreadsheetId, request.range, request.values)
            .then(data => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    else if (request.action === "pushToSheets") {
        console.log("📤 Manual push to sheets requested");
        const previousState = scrapingState;

        pushDataToSheets()
            .then(() => {
                lastPushIndex = scrapingResults.length;
                console.log(`📌 Manual push completed. Last push index updated to: ${lastPushIndex}`);

                sendResponse({ success: true });
                chrome.runtime.sendMessage({
                    action: "pushCompleted",
                    preservedState: previousState,
                    resultCount: scrapingResults.length,
                    recordsSinceLastPush: 0
                }).catch(err => console.warn("Could not send push completion:", err));
            })
            .catch(err => {
                console.error("❌ Push failed:", err);
                sendResponse({ success: false, error: err.message });
            });
        return true;
    }
    else if (request.action === "setAutoPushInterval") {
        autoPushInterval = request.interval || 10;
        console.log(`⚙️ Auto-push interval set to: ${autoPushInterval} records`);
        sendResponse({ status: "success", interval: autoPushInterval });
        return true;
    }
});

async function pushDataToSheets() {
    console.log("📌 Starting push to Google Sheets…");

    if (scrapingResults.length === 0) {
        throw new Error("No scraped data to push");
    }

    try {
        console.log("🔐 Getting access token...");
        const token = await getAccessToken();
        if (!token) {
            throw new Error("Failed to get access token");
        }

        console.log("🧪 Testing token validity...");
        const isValid = await testTokenValidity(token);
        if (!isValid) {
            console.log("🔄 Token invalid, re-authenticating...");
            accessToken = null;
            const newToken = await authenticate();
            if (!newToken) {
                throw new Error("Re-authentication failed");
            }
        }

        // Load sheetId and gid from storage
        const { sheetId, gid } = await new Promise(resolve =>
            chrome.storage.local.get(["sheetId", "gid"], resolve)
        );

        if (!sheetId || !gid) {
            throw new Error("Missing sheet ID or GID in storage");
        }

        // ✅ Dynamically resolve the sheet name using metadata
        let workingSheetName = null;
        let sheetData = null;

        try {
            console.log(`🔍 Getting spreadsheet metadata for GID: ${gid}`);

            const metadataResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${await getAccessToken()}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            if (!metadataResponse.ok) {
                throw new Error(`Failed to get spreadsheet metadata: ${metadataResponse.status}`);
            }

            const metadata = await metadataResponse.json();
            console.log("📊 Spreadsheet metadata:", metadata);

            const targetSheet = metadata.sheets.find(
                sheet => sheet.properties.sheetId.toString() === gid.toString()
            );

            if (!targetSheet) {
                throw new Error(`Sheet with GID ${gid} not found`);
            }

            workingSheetName = targetSheet.properties.title;
            console.log(`✅ Found actual sheet name: "${workingSheetName}" for GID: ${gid}`);

            // Fetch sheet data
            const sheetRange = `'${workingSheetName}'!A:Z`;
            const sheetResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetRange)}?majorDimension=ROWS`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${await getAccessToken()}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            if (!sheetResponse.ok) {
                throw new Error(`Failed to fetch sheet data: ${sheetResponse.status}`);
            }

            sheetData = await sheetResponse.json();
            console.log(`✅ Successfully fetched data from sheet: "${workingSheetName}"`);
        } catch (error) {
            console.error("❌ Error getting dynamic sheet name:", error);
            throw new Error(`Could not determine sheet name for GID ${gid}: ${error.message}`);
        }

        // Now update rows like before
        const rows = sheetData.values || [];
        const headerRow = rows[0];
        const urlIndex = headerRow.indexOf("Person - LinkedIn");

        if (urlIndex === -1) {
            throw new Error("'Person - LinkedIn' column not found in sheet headers");
        }

        const columnsToUpdate = [
            "Designation", "Current Position", "Location",
            "City", "State", "Country", "Experience", "Education", "About"
        ];

        for (const profile of scrapingResults) {
            const matchIndex = rows.findIndex(
                (r, i) => i > 0 && r[urlIndex] && r[urlIndex].trim() === profile["Profile Url"]?.trim()
            );

            if (matchIndex === -1) continue;

            let currentRow = [...rows[matchIndex]];
            while (currentRow.length < headerRow.length) {
                currentRow.push("");
            }

            let updatesCount = 0;
            headerRow.forEach((header, colIndex) => {
                if (columnsToUpdate.includes(header) && profile[header]) {
                    if (currentRow[colIndex] !== profile[header]) {
                        currentRow[colIndex] = profile[header];
                        updatesCount++;
                    }
                }
            });

            if (updatesCount > 0) {
                const lastCol = String.fromCharCode(65 + headerRow.length - 1);
                const updateRange = `'${workingSheetName}'!A${matchIndex + 1}:${lastCol}${matchIndex + 1}`;
                await updateSheet(sheetId, updateRange, [currentRow]);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log("✅ Push to sheets completed successfully!");
    } catch (error) {
        console.error("❌ Error in push to sheets:", error);
        throw error;
    }
}


let currentTabListener = null;

function scrapeNextProfile() {
    if (!isScrapingActive) {
        console.log("⏹️ Scraping stopped, not proceeding to next profile");
        return;
    }

    if (currentProfileIndex >= profileUrls.length) {
        console.log("✅ All profiles completed");
        finalizeScraping();
        return;
    }

    // FIXED: Clean up any existing listener first
    if (currentTabListener) {
        chrome.tabs.onUpdated.removeListener(currentTabListener);
        currentTabListener = null;
    }

    const url = profileUrls[currentProfileIndex].trim();
    console.log(`🌐 Navigating to profile ${currentProfileIndex + 1}/${totalProfiles}: ${url}`);

    chrome.tabs.update(activeTabId, { url }, (tab) => {
        if (chrome.runtime.lastError) {
            console.error("❌ Failed to navigate tab:", chrome.runtime.lastError);

            const errorProfile = {
                "Name": `ERROR: Failed to navigate to profile`,
                "Profile Url": url
            };

            handleProfileResult(errorProfile, url);
            return;
        }

        console.log("✅ Navigation initiated, waiting for page load...");

        // FIXED: Create and store the listener reference
        currentTabListener = (tabId, changeInfo, tab) => {
            if (tabId === activeTabId && changeInfo.status === "complete") {
                console.log("📄 Page loaded completely:", tab.url);

                // FIXED: Clean up listener immediately
                chrome.tabs.onUpdated.removeListener(currentTabListener);
                currentTabListener = null;

                setTimeout(() => {
                    console.log("📤 Sending scrape command to content script...");

                    chrome.tabs.sendMessage(activeTabId, { action: "scrapeProfile" }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error("❌ Failed to send message to content script:", chrome.runtime.lastError);

                            const errorProfile = {
                                "Name": `ERROR: Content script communication failed`,
                                "Profile Url": url
                            };

                            handleProfileResult(errorProfile, url);
                        } else {
                            console.log("✅ Scrape command sent successfully");
                        }
                    });
                }, 2000);
            }
        };

        chrome.tabs.onUpdated.addListener(currentTabListener);

        // FIXED: Improved timeout handling
        setTimeout(() => {
            if (currentTabListener) {
                chrome.tabs.onUpdated.removeListener(currentTabListener);
                currentTabListener = null;
                console.warn("⚠️ Page load timeout, proceeding anyway...");

                const timeoutProfile = {
                    "Name": `ERROR: Page load timeout`,
                    "Profile Url": url
                };

                handleProfileResult(timeoutProfile, url);
            }
        }, 30000);
    });
}

// Add this variable at the top with other global variables
let processingProfileIndex = -1; // Track which profile is currently being processed

function handleProfileResult(profile, url) {
    // FIXED: Prevent duplicate processing of the same profile
    if (processingProfileIndex === currentProfileIndex) {
        console.log(`⚠️ Duplicate result for profile ${currentProfileIndex + 1}, ignoring...`);
        return;
    }

    // Mark this profile as being processed
    processingProfileIndex = currentProfileIndex;

    scrapingResults.push(profile);
    console.log(`✅ Profile ${currentProfileIndex + 1}/${totalProfiles} processed: ${profile.Name || 'Unknown'}`);

    const recordsSinceLastPush = scrapingResults.length - lastPushIndex;

    // Handle auto-push logic
    if (recordsSinceLastPush >= autoPushInterval) {
        chrome.runtime.sendMessage({
            action: "autoPushStarted",
            currentIndex: currentProfileIndex + 1,
            total: totalProfiles,
            recordCount: scrapingResults.length
        }).catch(err => console.warn("⚠️ Could not send auto-push notification:", err));

        pushDataToSheets()
            .then(() => {
                lastPushIndex = scrapingResults.length;
                currentProfileIndex++; // FIXED: Only increment once
                processingProfileIndex = -1; // Reset processing flag

                chrome.runtime.sendMessage({
                    action: "autoPushCompleted",
                    currentIndex: currentProfileIndex,
                    total: totalProfiles,
                    recordCount: scrapingResults.length
                }).catch(err => console.warn("⚠️ Could not send auto-push completion:", err));

                continueToNextProfile();
            })
            .catch(error => {
                console.error("❌ Auto-push failed:", error);
                currentProfileIndex++; // Still increment even if push failed
                processingProfileIndex = -1; // Reset processing flag

                chrome.runtime.sendMessage({
                    action: "autoPushError",
                    error: error.message,
                    currentIndex: currentProfileIndex,
                    total: totalProfiles
                }).catch(err => console.warn("⚠️ Could not send auto-push error:", err));

                continueToNextProfile();
            });
    } else {
        // No auto-push needed, increment and continue
        currentProfileIndex++;
        processingProfileIndex = -1; // Reset processing flag

        chrome.runtime.sendMessage({
            action: "scrapingProgress",
            currentIndex: currentProfileIndex,
            total: totalProfiles,
            currentUrl: url,
            profile: profile,
            recordsSinceLastPush: scrapingResults.length - lastPushIndex
        }).catch(err => console.warn("⚠️ Could not send progress update:", err));

        continueToNextProfile();
    }
}

function continueToNextProfile() {
    if (currentProfileIndex < totalProfiles && isScrapingActive) {
        const delay = Math.random() * 1000 + 3000;
        console.log(`⏳ Waiting ${delay.toFixed(0)}ms before next profile...`);
        setTimeout(scrapeNextProfile, delay);
    } else {
        console.log("🏁 All profiles processed, finalizing...");
        finalizeScraping();
    }
}

function stopScraping() {
    console.log("🛑 Stopping scraping process...");
    isScrapingActive = false;
    finalizeScraping();
}

async function finalizeScraping() {
    console.log("📌 Finalizing scraping session...");

    isScrapingActive = false;
    isPaused = false;
    scrapingState = "completed";

    const remainingRecords = scrapingResults.length - lastPushIndex;

    console.log(`📊 Final check: ${scrapingResults.length} total results, ${lastPushIndex} already pushed, ${remainingRecords} remaining`);

    if (remainingRecords > 0) {
        console.log(`📤 Final auto-push: ${remainingRecords} remaining records...`);

        chrome.runtime.sendMessage({
            action: "autoPushStarted",
            currentIndex: currentProfileIndex,
            total: totalProfiles,
            recordCount: remainingRecords,
            isFinalPush: true
        }).catch(err => console.warn("⚠️ Could not send final auto-push start notification:", err));

        try {
            await pushDataToSheets();
            lastPushIndex = scrapingResults.length;
            console.log("✅ Final auto-push completed");

            chrome.runtime.sendMessage({
                action: "autoPushCompleted",
                currentIndex: currentProfileIndex,
                total: totalProfiles,
                recordCount: scrapingResults.length,
                isFinalPush: true
            }).catch(err => console.warn("⚠️ Could not send final auto-push completion:", err));

        } catch (error) {
            console.error("❌ Final auto-push failed:", error);
            chrome.runtime.sendMessage({
                action: "autoPushError",
                error: error.message,
                isFinalPush: true,
                currentIndex: currentProfileIndex,
                total: totalProfiles
            }).catch(err => console.warn("Could not send final auto-push error:", err));
        }
    } else {
        console.log("✅ No remaining records to push");
    }

    chrome.runtime.sendMessage({
        action: "scrapingCompleted",
        total: scrapingResults.length,
        results: scrapingResults,
        state: "completed",
        recordsSinceLastPush: 0
    }).catch(err => console.warn("Could not send completion message:", err));

    console.log("✅ Scraping session finalized");
}

async function updateSheet(spreadsheetId, range, values) {
    const token = await getAccessToken();

    console.log(`📤 Updating sheet range: ${range}`);

    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ values })
        }
    );

    if (!response.ok) {
        const errText = await response.text();
        console.error("❌ Sheet update failed:", response.status, errText);
        throw new Error(`Google Sheets API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    console.log("✅ Sheet updated successfully:", result);
    return result;
}