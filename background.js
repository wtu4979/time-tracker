let startTime;
let currentUrl;
let currentDomain;
let updateInterval;
let activeTabs = new Set(); // Track active tab domains

// Helper function to get domain from URL
function getDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (e) {
        console.error('Error parsing URL:', url, e);
        return url;
    }
}

// Update active tabs list
async function updateActiveTabs() {
    const tabs = await chrome.tabs.query({});
    const newActiveTabs = new Set();
    
    tabs.forEach(tab => {
        try {
            if (tab.url && !tab.url.startsWith('chrome://')) {
                const domain = getDomain(tab.url);
                newActiveTabs.add(domain);
            }
        } catch (e) {
            console.error('Error processing tab:', e);
        }
    });
    
    // Update time for any domains that are no longer active
    const removedDomains = Array.from(activeTabs).filter(domain => !newActiveTabs.has(domain));
    for (const domain of removedDomains) {
        if (domain === currentDomain) {
            await updateTime(domain);
            currentDomain = null;
            currentUrl = null;
            startTime = null;
        }
    }
    
    activeTabs = newActiveTabs;
    notifyPopup();
}

// Helper function to check if two dates are the same day
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

// Start periodic updates
function startPeriodicUpdates() {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    updateInterval = setInterval(async () => {
        if (currentDomain && startTime) {
            notifyPopup();
        }
    }, 1000);
}

// Notify popup of updates
function notifyPopup() {
    console.log('Notifying popup with active tabs:', Array.from(activeTabs));
    chrome.runtime.sendMessage({ 
        type: "timeUpdated",
        currentDomain,
        startTime,
        timestamp: Date.now(),
        activeTabs: Array.from(activeTabs)
    }).catch(() => {
        // Ignore errors when popup is not open
    });
}

// Initialize or update time for a domain
async function updateTime(domain) {
    if (!domain) return;
    
    console.log('Updating time for domain:', domain);
    const data = await chrome.storage.local.get('timeData');
    const timeData = data.timeData || {};
    
    if (!timeData[domain]) {
        console.log('First visit to domain:', domain);
        timeData[domain] = {
            totalTime: 0,
            lastVisit: new Date().toISOString(),
            timestamp: Date.now(),
            dailyStats: {}
        };
    }
    
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    
    if (startTime) {
        const timeSpent = Math.round((now - startTime) / 1000); // Convert to seconds
        
        // Update total time
        timeData[domain].totalTime += timeSpent;
        timeData[domain].lastVisit = new Date().toISOString();
        timeData[domain].timestamp = now;
        
        // Update daily stats
        if (!timeData[domain].dailyStats[today]) {
            timeData[domain].dailyStats[today] = {
                totalTime: 0,
                visits: 1
            };
        }
        
        // Update today's time
        timeData[domain].dailyStats[today].totalTime += timeSpent;
        
        console.log(`Added ${timeSpent} seconds to ${domain}. Daily total: ${timeData[domain].dailyStats[today].totalTime}s`);
    }
    
    // Reset start time for the next update
    startTime = now;
    
    await chrome.storage.local.set({ timeData });
    notifyPopup();
}

// Handle tab switching
async function handleTabSwitch(newUrl) {
    if (!newUrl || newUrl.startsWith('chrome://')) {
        if (currentDomain) {
            await updateTime(currentDomain);
            currentDomain = null;
            currentUrl = null;
            startTime = null;
        }
        return;
    }

    const newDomain = getDomain(newUrl);
    
    // If switching to a different domain, update the time for the current domain
    if (currentDomain && currentDomain !== newDomain) {
        await updateTime(currentDomain);
    }
    
    // Only start tracking if the new domain is in active tabs
    if (activeTabs.has(newDomain)) {
        currentUrl = newUrl;
        currentDomain = newDomain;
        startTime = Date.now();
        
        // Update visit count and last visit time
        const data = await chrome.storage.local.get('timeData');
        const timeData = data.timeData || {};
        const today = new Date().toISOString().split('T')[0];
        
        if (!timeData[currentDomain]) {
            timeData[currentDomain] = {
                totalTime: 0,
                lastVisit: new Date().toISOString(),
                timestamp: Date.now(),
                dailyStats: {
                    [today]: {
                        totalTime: 0,
                        visits: 1
                    }
                }
            };
        } else {
            if (!timeData[currentDomain].dailyStats) {
                timeData[currentDomain].dailyStats = {};
            }
            if (!timeData[currentDomain].dailyStats[today]) {
                timeData[currentDomain].dailyStats[today] = {
                    totalTime: 0,
                    visits: 0
                };
            }
            timeData[currentDomain].dailyStats[today].visits++;
            timeData[currentDomain].lastVisit = new Date().toISOString();
            timeData[currentDomain].timestamp = Date.now();
        }
        
        await chrome.storage.local.set({ timeData });
    } else {
        currentUrl = null;
        currentDomain = null;
        startTime = null;
    }
    
    notifyPopup();
}

// Track active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
        await handleTabSwitch(tab.url);
    }
});

// Track URL changes in any tab
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        const activeTabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (activeTabs[0]?.id === tabId) {
            await handleTabSwitch(changeInfo.url);
        }
    }
    await updateActiveTabs();
});

// Track tab removals
chrome.tabs.onRemoved.addListener(async (tabId) => {
    await updateActiveTabs();
});

// Update time when window loses focus
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        if (currentDomain) {
            await updateTime(currentDomain);
            currentUrl = null;
            currentDomain = null;
            startTime = null;
            notifyPopup();
        }
    } else {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs[0]?.url) {
            await handleTabSwitch(tabs[0].url);
        }
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "getState") {
        sendResponse({
            currentDomain,
            startTime,
            timestamp: Date.now(),
            activeTabs: Array.from(activeTabs)
        });
        return true;
    } else if (message.type === "switchTab") {
        handleTabSwitch(message.url);
        return true;
    } else if (message.type === "reopenPopup") {
        chrome.action.openPopup();
        return true;
    }
});

// Initialize tracking for the current active tab when extension loads
chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
    if (tabs[0]?.url) {
        await handleTabSwitch(tabs[0].url);
    }
    await updateActiveTabs();
    startPeriodicUpdates();
}); 