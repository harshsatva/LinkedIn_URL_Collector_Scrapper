// ---------------------------
// Guardrails & configuration
// ---------------------------
const MIN_DELAY_SECONDS = 3;
const MAX_DELAY_SECONDS = 4;

// Utility functions
function humanDelay() {
    const delay = Math.random() * (MAX_DELAY_SECONDS - MIN_DELAY_SECONDS) + MIN_DELAY_SECONDS;
    console.log(`Waiting ${delay.toFixed(1)} seconds...`);
    return new Promise(resolve => setTimeout(resolve, delay * 1000));
}

function safeText(element) {
    try {
        return element && element.textContent ? element.textContent.trim() : "";
    } catch {
        return "";
    }
}

function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
}

async function extractAboutSection() {
    let aboutText = "";

    try {
        // --- STEP 1: Try robust selector first (visually-hidden span always has full text) ---
        const hiddenElem = document.querySelector(
            ".inline-show-more-text--is-collapsed span.visually-hidden"
        );
        if (hiddenElem) {
            aboutText = safeText(hiddenElem);
        }

        // --- STEP 2: If nothing found, use the old 'see more' logic ---
        if (!aboutText) {
            // Try to click "see more" if present
            const showMoreSelectors = [
                ".pv-about-section a.lt-line-clamp__more",
                "a.lt-line-clamp__more",
                "a[aria-label*='see more']",
                ".lt-line-clamp__more"
            ];

            for (const selector of showMoreSelectors) {
                try {
                    const btn = document.querySelector(selector);
                    if (btn && btn.offsetParent !== null) {
                        btn.click();
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        console.log("   → Clicked 'see more' in LinkedIn About section");
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            // Try selectors for expanded text
            const textSelectors = [
                ".pv-about__summary-text .lt-line-clamp__raw-line",
                "div.full-width.t-14.t-normal.t-black span[aria-hidden='true']",
                ".pv-about__summary-text",
                "div[class*='full-width t-14 t-normal t-black'] span[aria-hidden='true']",
                "div.qmdGMKYuIypnxyEHNTIvfxuATDBMXQom span[aria-hidden='true']",
                "div.FwOlsjQqkKryZHlZOACWZtVIHRMuhoM span"
            ];

            for (const selector of textSelectors) {
                try {
                    const elem = document.querySelector(selector);
                    const text = safeText(elem);
                    if (text && text.length > 20) {
                        aboutText = text;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            // Fallback: reconstruct from clamped lines
            if (!aboutText) {
                try {
                    const lines = document.querySelectorAll(
                        ".lt-line-clamp__raw-line, .lt-line-clamp__line"
                    );
                    if (lines.length > 0) {
                        aboutText = Array.from(lines)
                            .map(l => safeText(l))
                            .filter(text => text)
                            .join("\n")
                            .trim();
                    }
                } catch (e) {
                    // ignore
                }
            }
        }
    } catch (error) {
        console.log(`   ⚠️ Error extracting About section: ${error}`);
    }

    // --- STEP 3: Clean up formatting ---
    if (aboutText) {
        aboutText = aboutText
            .split("\n\n")
            .map(para => para.trim())
            .filter(para => para)
            .join("\n\n");
        console.log(`   ✅ Extracted About: ${aboutText.substring(0, 100)}...`);
    }

    return aboutText;
}

async function extractExperience() {
    const experienceData = {
        "Experience": "",
        "Current Position": ""
    };

    try {
        const experienceEntries = [];
        let expItems = [];

        // ✅ Step 1: Wait for the anchor div with id="experience"
        let anchor;
        try {
            anchor = await waitForElement("div#experience.pv-profile-card__anchor", 10000);
        } catch (err) {
            console.log("⚠️ Experience anchor not found within timeout, trying fallback...");
        }

        if (anchor) {
            // Step 2: Traverse upward to the parent section
            const section = anchor.closest("section");
            if (section) {
                // Step 3: Select the UL inside that section
                const ul = section.querySelector("ul");
                if (ul) {
                    expItems = ul.querySelectorAll("li.artdeco-list__item");
                    console.log(`✅ Found ${expItems.length} experience entries via #experience anchor`);
                }
            }
        }

        // Step 4: Fallback if no items found
        if (expItems.length === 0) {
            try {
                const fallbackSection = await waitForElement("section[data-section='experience'] ul, .experience-section ul", 5000);
                if (fallbackSection) {
                    expItems = fallbackSection.querySelectorAll("li.artdeco-list__item");
                    console.log(`✅ Found ${expItems.length} experience entries via fallback`);
                }
            } catch (err) {
                console.log("⚠️ Fallback also not found:", err.message);
            }
        }

        if (expItems.length === 0) {
            console.log("⚠️ No experience entries found at all");
            return experienceData;
        }

        // Step 5: Extract details for each entry
        expItems.forEach((item, index) => {
            let role = "";
            const roleSelectors = [
                ".mr1.t-bold span[aria-hidden='true']",
                ".hoverable-link-text.t-bold span[aria-hidden='true']",
                "span.t-bold span[aria-hidden='true']"
            ];
            for (const sel of roleSelectors) {
                const el = item.querySelector(sel);
                if (el) {
                    role = safeText(el);
                    if (role) break;
                }
            }

            let companyName = "";
            const compSelectors = [
                "span.t-14.t-normal span[aria-hidden='true']",
                ".t-14.t-normal span[aria-hidden='true']"
            ];
            for (const sel of compSelectors) {
                const el = item.querySelector(sel);
                if (el) {
                    const txt = safeText(el);
                    if (txt && !txt.match(/(·|yr|mo|Present|Full-time|Part-time)/)) {
                        companyName = txt;
                        break;
                    }
                }
            }

            let duration = "";
            const durSelectors = [
                "span.pvs-entity__caption-wrapper[aria-hidden='true']",
                ".t-14.t-normal.t-black--light span[aria-hidden='true']"
            ];
            for (const sel of durSelectors) {
                const el = item.querySelector(sel);
                if (el) {
                    const txt = safeText(el);
                    if (txt && /(yr|mo|Present|–|-)/.test(txt)) {
                        duration = txt;
                        break;
                    }
                }
            }

            let location = "";
            const locationSpans = item.querySelectorAll(".t-14.t-normal.t-black--light span[aria-hidden='true']");
            for (const span of locationSpans) {
                const txt = safeText(span);
                if (txt && /(Remote|Hybrid|United States|United Kingdom|India|Canada|Australia|,)/.test(txt)) {
                    location = txt;
                    break;
                }
            }

            // Build entry
            if (role || companyName) {
                const parts = [];
                if (role) parts.push(role);
                if (companyName) parts.push(`at ${companyName}`);
                if (duration) parts.push(`(${duration})`);
                if (location) parts.push(`[${location}]`);

                const entry = parts.join(" ");
                experienceEntries.push(entry);
                console.log(`✓ Experience ${index + 1}: ${entry}`);

                if (index === 0) {
                    experienceData["Current Position"] = entry;
                }
            }
        });

        if (experienceEntries.length > 0) {
            experienceData["Experience"] = experienceEntries.join("\n");
        }

    } catch (error) {
        console.log(`❌ Error in extractExperience: ${error}`);
    }

    return experienceData;
}

async function extractEducation() {
    let educationEntries = [];
    try {
        // Step 1: Try to find education section via anchor
        const anchor = document.querySelector("div#education.pv-profile-card__anchor");
        let eduItems = [];

        if (anchor) {
            const section = anchor.closest("section");
            if (section) {
                const ul = section.querySelector("ul");
                if (ul) {
                    eduItems = ul.querySelectorAll("li.artdeco-list__item, li");
                    console.log(`   ✅ Found ${eduItems.length} education entries via #education anchor`);
                }
            }
        }

        // Step 2: Fallback selectors if anchor method fails
        if (eduItems.length === 0) {
            const selectors = [
                "section[data-section='education'] ul li",
                ".education-section li",
                ".pv-profile-section.education-section ul li"
            ];
            for (const selector of selectors) {
                const items = document.querySelectorAll(selector);
                if (items.length > 0) {
                    eduItems = items;
                    console.log(`   ✅ Found ${eduItems.length} education entries via fallback: ${selector}`);
                    break;
                }
            }
        }

        if (eduItems.length === 0) {
            console.log("   ⚠️ No education entries found");
            return "";
        }

        // Step 3: Process each education entry
        eduItems.forEach((item, index) => {
            let degree = safeText(
                item.querySelector("span.t-bold span[aria-hidden='true']") ||
                item.querySelector(".pv-education-entity__degree")
            );
            let institution = safeText(
                item.querySelector("span.t-14.t-normal span[aria-hidden='true']") ||
                item.querySelector(".pv-education-entity__school-name")
            );
            let duration = safeText(
                item.querySelector("span.t-14.t-normal.t-black--light span[aria-hidden='true']") ||
                item.querySelector(".pv-education-entity__dates")
            );

            const entry = [degree, institution, duration].filter(Boolean).join(" · ");
            if (entry) {
                educationEntries.push(entry);
                console.log(`   ✓ Education ${index + 1}: ${entry}`);
            }
        });
    } catch (error) {
        console.log(`   ❌ Error extracting education: ${error}`);
    }

    return educationEntries.join("\n");
}

function formatProfileUrl(url) {
    if (!url) return "";
    return url
        .replace(/\/$/, "")         // remove trailing slash
        .replace(/^https:\/\//i, "http://"); // convert https to http
}

async function extractLinkedInProfile() {
    const data = {
        "Name": "",
        "Designation": "",
        "Current Position": "",
        "Location": "",
        "City": "",
        "State": "",
        "Country": "",
        "Experience": "",
        "Education": "",
        "About": "",  // Initialize About field
        "Profile Url": ""
    };

    // Extract name
    const nameSelectors = [
        "h1",
        "div.text-heading-xlarge",
        "h1.text-heading-xlarge"
    ];

    for (const selector of nameSelectors) {
        try {
            const nameElem = document.querySelector(selector);
            const name = safeText(nameElem);
            if (name && name.length > 1) {
                data["Name"] = name;
                break;
            }
        } catch (e) {
            continue;
        }
    }

    // Extract designation
    const headlineSelectors = [
        "div.text-body-medium.break-words",
        "div.ph5 div.text-body-medium",
        ".pv-text-details__left-panel .text-body-medium"
    ];

    for (const selector of headlineSelectors) {
        try {
            const headlineElem = document.querySelector(selector);
            const designation = safeText(headlineElem);
            if (designation && designation.length > 1) {
                data["Designation"] = designation;
                break;
            }
        } catch (e) {
            continue;
        }
    }

    // Extract location
    const locationSelectors = [
        "span.text-body-small.inline.t-black--light.break-words",
        ".pv-text-details__left-panel .pb2 .text-body-small",
        "div.ph5 span.text-body-small"
    ];
    for (const selector of locationSelectors) {
        try {
            const locationElem = document.querySelector(selector);
            const location = safeText(locationElem);
            if (location && location.length > 1) {
                data["Location"] = location;

                // 🔹 Split location into City, State, Country
                const parts = location.split(",").map(p => p.trim());
                if (parts.length === 3) {
                    data["City"] = parts[0];
                    data["State"] = parts[1];
                    data["Country"] = parts[2];
                } else if (parts.length === 2) {
                    // Sometimes LinkedIn only shows "City, Country"
                    data["City"] = parts[0];
                    data["Country"] = parts[1];
                } else if (parts.length === 1) {
                    // Fallback: only country
                    data["Country"] = parts[0];
                }
                break;
            }
        } catch (e) {
            continue;
        }
    }

    // Extract experience and current position
    const experienceData = await extractExperience();
    if (experienceData["Experience"]) {
        data["Experience"] = experienceData["Experience"];
    }
    if (experienceData["Current Position"]) {
        data["Current Position"] = experienceData["Current Position"];
    } else if (data["Designation"]) {
        data["Current Position"] = data["Designation"];
    }

    // Extract education
    data["Education"] = await extractEducation();

    // Extract about section
    data["About"] = await extractAboutSection();
    data["Profile Url"] = formatProfileUrl(window.location.href);
    return data;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrapeProfile") {
        console.log(`Scraping profile: ${window.location.href}`);
        extractLinkedInProfile().then(profile => {
            const columnOrder = [
                "Name", "Designation", "Current Position", "Location", "City", "State", "Country",
                "Experience", "Education", "About", "Profile Url"
            ];
            const orderedProfile = {};
            for (const col of columnOrder) {
                orderedProfile[col] = profile[col] || "";
            }

            chrome.runtime.sendMessage({
                action: "profileScraped",
                profile: orderedProfile,
                url: window.location.href
            });
            sendResponse({ status: "completed" });
        }).catch(error => {
            console.log(`Error scraping profile: ${error}`);
            const columnOrder = [
                "Name", "Designation", "Current Position", "Location", "City", "State", "Country",
                "Experience", "Education", "About", "Profile Url"
            ];
            const errorProfile = {};
            for (const col of columnOrder) {
                if (col === "Profile Url") {
                    errorProfile[col] = window.location.href;
                } else if (col === "Name") {
                    errorProfile[col] = `ERROR: ${error.toString()}`;
                } else {
                    errorProfile[col] = "";
                }
            }
            chrome.runtime.sendMessage({
                action: "profileScraped",
                profile: errorProfile,
                url: window.location.href
            });
            sendResponse({ status: "error", error: error.toString() });
        });
        return true; // Keep message channel open for async response
    }
});