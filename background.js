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
    
    console.log('Active tabs updated:', Array.from(newActiveTabs));
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
            // Update lastVisit time for active domain
            const data = await chrome.storage.local.get('timeData');
            const timeData = data.timeData || {};
            if (timeData[currentDomain]) {
                const now = Date.now();
                const today = new Date().toISOString().split('T')[0];
                
                timeData[currentDomain].lastVisit = new Date().toISOString();
                timeData[currentDomain].timestamp = now;
                
                // Ensure daily stats structure exists
                if (!timeData[currentDomain].dailyStats) {
                    timeData[currentDomain].dailyStats = {};
                }
                if (!timeData[currentDomain].dailyStats[today]) {
                    timeData[currentDomain].dailyStats[today] = {
                        totalTime: 0,
                        visits: 1
                    };
                }
                
                await chrome.storage.local.set({ timeData });
            }
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

// Update current tracking state
async function updateTrackingState(url) {
    if (!url || url.startsWith('chrome://')) return;

    const newDomain = getDomain(url);
    if (currentDomain !== newDomain) {
        if (currentDomain) {
            await updateTime(currentDomain);
        }
        currentUrl = url;
        currentDomain = newDomain;
        
        // Get the current data for the domain
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
            // Update visit count for today
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
        
        // Start tracking from now
        startTime = Date.now();
        console.log('Now tracking:', currentDomain);
        
        // Update active tabs list
        await updateActiveTabs();
    }
}

// Track active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log('Tab activated:', activeInfo);
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
        await updateTrackingState(tab.url);
    }
});

// Track URL changes in any tab
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        console.log('URL changed:', changeInfo.url);
        const activeTabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (activeTabs[0]?.id === tabId) {
            await updateTrackingState(changeInfo.url);
        }
    }
    // Update active tabs list when any tab updates
    await updateActiveTabs();
});

// Track tab removals
chrome.tabs.onRemoved.addListener(async () => {
    // Update the list of active tabs when a tab is closed
    await updateActiveTabs();
});

// Update time when window loses focus
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    console.log('Window focus changed:', windowId);
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        if (currentDomain) {
            await updateTime(currentDomain);
            currentUrl = null;
            currentDomain = null;
            startTime = null;
            console.log('Stopped tracking due to window blur');
            notifyPopup();
        }
    } else {
        // Window gained focus, check current active tab
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (tabs[0]?.url) {
            await updateTrackingState(tabs[0].url);
        }
    }
});

// Initialize tracking for the current active tab when extension loads
chrome.tabs.query({}, async (tabs) => {
    // Initialize activeTabs with all current tabs
    tabs.forEach(tab => {
        try {
            if (tab.url) {
                const domain = getDomain(tab.url);
                activeTabs.add(domain);
            }
        } catch (e) {
            console.error('Error processing tab:', e);
        }
    });

    // Then initialize tracking for the active tab
    const activeTabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (activeTabs[0]?.url) {
        console.log('Extension loaded, starting to track:', activeTabs[0].url);
        await updateTrackingState(activeTabs[0].url);
    }
});

// Start periodic updates
startPeriodicUpdates();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "getState") {
        sendResponse({
            currentUrl,
            currentDomain,
            startTime: startTime || Date.now(), // Ensure we always have a start time for active domain
            timestamp: Date.now(),
            activeTabs: Array.from(activeTabs)
        });
    } else if (message.type === "switchTab") {
        // Handle tab switch request from popup
        updateTrackingState(message.url);
    } else if (message.type === "clearData") {
        // Reset the start time when data is cleared
        startTime = Date.now();
    } else if (message.type === "reopenPopup") {
        // Wait a brief moment to ensure the popup is closed
        setTimeout(() => {
            chrome.action.openPopup();
        }, 100);
    }
    return true;
}); 