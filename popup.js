// Format time in seconds to human readable format
function formatTime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${remainingMinutes}m`;
}

// Format date to relative time
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    return `${days} days ago`;
}

// Add these utility functions near the top
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatLastUpdated(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// Theme management
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    
    if (theme === 'dark') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    }
}

async function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    setTheme(newTheme);
    await chrome.storage.local.set({ theme: newTheme });
}

async function initializeTheme() {
    const { theme } = await chrome.storage.local.get('theme');
    setTheme(theme || 'light');
}

let activeTimers = {};
let siteNames = new Map();
let lastUpdate = 0;
let cachedState = null;
let tooltipContainer = null;
let deletedSiteData = null;
let undoTimeout = null;
let progressBarAnimation = null;

// Load cached state from storage
async function loadCachedState() {
    const cache = await chrome.storage.local.get(['timeData', 'siteNames']);
    if (cache.siteNames) {
        siteNames = new Map(Object.entries(cache.siteNames));
    }
    return cache.timeData || {};
}

// Save state to cache
async function saveToCache(timeData) {
    await chrome.storage.local.set({
        timeData,
        siteNames: Object.fromEntries(siteNames)
    });
    cachedState = timeData;
}

// Calculate current time including real-time updates
function calculateCurrentTime(baseTime, startTime, now) {
    if (!startTime) return baseTime;
    const currentTime = Math.floor((now - startTime) / 1000);
    return baseTime + currentTime;
}

// Update active timer display
function updateActiveTimer(domain, startTime, baseTime, now) {
    const timeElement = document.querySelector(`[data-domain="${domain}"] .site-time`);
    if (timeElement) {
        const totalTime = calculateCurrentTime(baseTime, startTime, now);
        timeElement.textContent = formatTime(totalTime);
    }
}

// Stop all active timers
function stopAllTimers() {
    Object.values(activeTimers).forEach(timer => clearInterval(timer));
    activeTimers = {};
}

// Start timer for active domain
function startTimer(domain, startTime, baseTime) {
    const timeElement = document.querySelector(`[data-domain="${domain}"] .site-time`);
    if (timeElement) {
        timeElement.classList.add('active');
        if (activeTimers[domain]) {
            clearInterval(activeTimers[domain]);
        }
        
        // Initial update
        updateActiveTimer(domain, startTime, baseTime, Date.now());
        
        // Set up interval for continuous updates
        activeTimers[domain] = setInterval(() => {
            updateActiveTimer(domain, startTime, baseTime, Date.now());
        }, 1000);
    }
}

// Fetch site name for a domain
async function fetchSiteName(domain) {
    if (siteNames.has(domain)) {
        return siteNames.get(domain);
    }

    try {
        const response = await fetch(`https://${domain}`);
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        
        // Try different meta tags for site name
        const siteName = 
            doc.querySelector('meta[property="og:site_name"]')?.content ||
            doc.querySelector('meta[name="application-name"]')?.content ||
            doc.querySelector('meta[property="og:title"]')?.content ||
            doc.title.split('|')[0].split('-')[0].trim();

        const cleanName = siteName ? siteName.trim() : domain;
        siteNames.set(domain, cleanName);
        saveToCache(cachedState); // Save updated site names
        return cleanName;
    } catch (e) {
        console.error('Error fetching site name:', e);
        siteNames.set(domain, domain);
        return domain;
    }
}

// Delete a single domain
async function deleteDomain(domain) {
    const data = await chrome.storage.local.get('timeData');
    const timeData = data.timeData || {};
    
    delete timeData[domain];
    await saveToCache(timeData);
    
    const entry = document.querySelector(`[data-domain="${domain}"]`)?.closest('.site-entry');
    if (entry) {
        entry.style.opacity = '0';
        entry.style.transform = 'translateX(100%)';
        setTimeout(() => entry.remove(), 300);
    }
}

// Add this function near the top with the other utility functions
async function switchToTab(domain) {
    try {
        // Get all tabs
        const tabs = await chrome.tabs.query({});
        
        // Filter tabs for the target domain
        const matchingTabs = tabs.filter(tab => {
            try {
                return new URL(tab.url).hostname === domain;
            } catch (e) {
                return false;
            }
        });

        if (matchingTabs.length > 0) {
            // Sort tabs by last accessed time (most recent first)
            matchingTabs.sort((a, b) => b.lastAccessed - a.lastAccessed);
            
            // Get the most recently accessed tab
            const targetTab = matchingTabs[0];
            
            // First focus the window
            await chrome.windows.update(targetTab.windowId, { focused: true });
            
            // Then activate the tab
            await chrome.tabs.update(targetTab.id, { active: true });
            
            // Notify background script about the switch with tabId
            await chrome.runtime.sendMessage({
                type: "switchTab",
                url: targetTab.url,
                tabId: targetTab.id
            });

            // Close the popup after a short delay to ensure the switch completes
            setTimeout(() => window.close(), 50);
        } else {
            // If no existing tab, open a new one
            const newTab = await chrome.tabs.create({ url: `https://${domain}` });
            
            // Notify background script about the new tab with tabId
            await chrome.runtime.sendMessage({
                type: "switchTab",
                url: newTab.url,
                tabId: newTab.id
            });

            // Close the popup after a short delay
            setTimeout(() => window.close(), 50);
        }
    } catch (e) {
        console.error('Error switching tab:', e);
    }
}

// Show tooltip
function showTooltip(text, element) {
    if (!tooltipContainer) {
        tooltipContainer = document.createElement('div');
        tooltipContainer.className = 'tooltip-container';
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltipContainer.appendChild(tooltip);
        document.body.appendChild(tooltipContainer);
    }

    const tooltip = tooltipContainer.querySelector('.tooltip');
    tooltip.textContent = text;
    tooltip.classList.add('visible');

    const rect = element.getBoundingClientRect();
    tooltipContainer.style.left = rect.left + (rect.width / 2) + 'px';
    tooltipContainer.style.top = rect.top - 10 + 'px';
}

// Hide tooltip
function hideTooltip() {
    if (tooltipContainer) {
        tooltipContainer.querySelector('.tooltip').classList.remove('visible');
    }
}

// Add these functions for undo functionality
function showUndoNotification(domain) {
    const notification = document.getElementById('undoNotification');
    const progressBar = notification.querySelector('.progress-bar');
    
    // Clear any existing timeouts and animations
    if (undoTimeout) clearTimeout(undoTimeout);
    if (progressBarAnimation) progressBarAnimation.cancel();
    
    // Update text and show notification
    notification.querySelector('.undo-text').textContent = `Removed ${domain}`;
    notification.style.display = 'flex';
    setTimeout(() => notification.classList.add('visible'), 10);
    
    // Animate progress bar
    progressBar.style.transform = 'scaleX(1)';
    progressBarAnimation = progressBar.animate(
        [
            { transform: 'scaleX(1)' },
            { transform: 'scaleX(0)' }
        ],
        {
            duration: 5000,
            easing: 'linear'
        }
    );
    
    // Hide notification after 5 seconds
    undoTimeout = setTimeout(() => {
        hideUndoNotification();
        deletedSiteData = null;
    }, 5000);
}

function hideUndoNotification() {
    const notification = document.getElementById('undoNotification');
    notification.classList.remove('visible');
    setTimeout(() => notification.style.display = 'none', 300);
}

// Add this function to format visit count
function formatVisits(visits) {
    return visits === 1 ? '1 visit' : `${visits} visits`;
}

// Update the updateSiteEntry function to show daily stats
async function updateSiteEntry(domain, data, activeDomain, backgroundState, skipAnimation = false) {
    const existingEntry = document.querySelector(`[data-domain="${domain}"]`)?.closest('.site-entry');
    const siteName = siteNames.has(domain) ? siteNames.get(domain) : domain;
    
    const entry = existingEntry || document.createElement('div');
    entry.className = 'site-entry' + (skipAnimation ? '' : ' animate');
    if (domain === activeDomain && backgroundState.startTime) {
        entry.className += ' active';
    }
    
    // Special handling for known domains
    let faviconUrl;
    if (domain === 'mail.google.com') {
        faviconUrl = 'https://www.google.com/s2/favicons?domain=gmail.com&sz=32';
    } else if (domain.includes('google.com')) {
        faviconUrl = `https://www.google.com/s2/favicons?domain=${domain.replace('www.', '')}&sz=32`;
    } else {
        // Try both with and without www
        const domainWithoutWww = domain.replace('www.', '');
        faviconUrl = `https://www.google.com/s2/favicons?domain=${domainWithoutWww}&sz=32`;
    }
    
    // Get today's stats
    const today = new Date().toISOString().split('T')[0];
    const dailyStats = data.dailyStats?.[today] || { totalTime: 0, visits: 0 };
    
    // Calculate current time including real-time updates
    let todayTime = dailyStats.totalTime;
    
    // Only add real-time updates for the active domain
    if (domain === activeDomain && backgroundState.startTime) {
        const elapsedTime = Math.floor((backgroundState.timestamp - backgroundState.startTime) / 1000);
        todayTime += elapsedTime;
    }

    // Format last visit time
    const lastVisitTime = domain === activeDomain ? 'Active now' : 
                         data.lastVisit ? formatDate(data.lastVisit) : 'Never';
    
    entry.innerHTML = `
        <div class="site-left">
            <div class="favicon-container">
                <div class="site-icons">
                    <div class="favicon-wrapper">
                        <img class="favicon" src="${faviconUrl}" alt="Site icon" 
                             onerror="this.onerror=null; this.src='https://www.google.com/s2/favicons?domain=${domain}&sz=32';" />
                    </div>
                    <div class="active-indicator"></div>
                </div>
            </div>
            <div class="site-info">
                <div class="time-row">
                    <span class="label">Time spent today:</span>
                    <div class="site-time" data-domain="${domain}" data-base-time="${dailyStats.totalTime}">
                        ${formatTime(todayTime)}
                    </div>
                </div>
                <div class="visit-row">
                    <span class="label">Last visited:</span>
                    <div class="last-visit">
                        ${lastVisitTime}
                    </div>
                </div>
            </div>
        </div>
        <div class="site-right">
            <div class="delete-button" title="Remove from list">
                <svg viewBox="0 0 24 24">
                    <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                </svg>
            </div>
        </div>
    `;

    // Add hover handlers for tooltip
    const faviconContainer = entry.querySelector('.favicon-container');
    faviconContainer.addEventListener('mouseenter', () => {
        showTooltip(`https://${domain}`, faviconContainer);
    });
    
    faviconContainer.addEventListener('mouseleave', () => {
        hideTooltip();
    });

    // Add click handler for the entire entry
    entry.style.cursor = 'pointer';
    entry.addEventListener('click', (e) => {
        // Don't switch tab if clicking delete button or its container
        if (e.target.closest('.delete-button') || e.target.closest('.site-right')) {
            return;
        }
        // Call switchToTab without awaiting to prevent popup close
        switchToTab(domain);
    });

    // Add delete button event listener
    entry.querySelector('.delete-button').addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent triggering parent click events
        
        // Store the deleted data for potential undo
        const data = await chrome.storage.local.get('timeData');
        const timeData = data.timeData || {};
        deletedSiteData = {
            domain,
            data: timeData[domain]
        };
        
        // Stop timer if it's running
        if (activeTimers[domain]) {
            clearInterval(activeTimers[domain]);
            delete activeTimers[domain];
        }
        
        // Remove from storage
        delete timeData[domain];
        await chrome.storage.local.set({ timeData });
        
        // Animate and remove the entry
        entry.style.opacity = '0';
        entry.style.transform = 'translateX(100%)';
        setTimeout(() => {
            entry.remove();
            updateStorageDetails(); // Update the storage info
        }, 300);
        
        // Show undo notification
        showUndoNotification(domain);
    });

    if (!existingEntry) {
        const timeList = document.getElementById('timeList');
        timeList.appendChild(entry);
    }

    // Start timer for active domain
    if (domain === activeDomain && backgroundState.startTime) {
        startTimer(domain, backgroundState.startTime, dailyStats.totalTime);
    }

    // Fetch site name in the background if we don't have it
    if (!siteNames.has(domain)) {
        fetchSiteName(domain).then(newName => {
            if (newName !== domain) {
                const domainElement = entry.querySelector('.site-time');
                if (domainElement) {
                    domainElement.textContent = newName;
                }
            }
        });
    }
}

// Add this function to update footer details
async function updateStorageDetails() {
    try {
        const data = await chrome.storage.local.get(['timeData', 'siteNames']);
        const timeData = data.timeData || {};
        
        // Update sites count
        const sitesCount = Object.keys(timeData).length;
        document.getElementById('sitesCount').textContent = sitesCount;
        
        // Calculate and update storage size
        const storageSize = new TextEncoder().encode(JSON.stringify(data)).length;
        document.getElementById('storageSize').textContent = formatBytes(storageSize);
        
        // Update last updated time
        document.getElementById('lastUpdated').textContent = formatLastUpdated(Date.now());
    } catch (e) {
        console.error('Error updating storage details:', e);
    }
}

// Helper function to create section header
function createSectionHeader(text) {
    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = text;
    header.style.padding = '12px 4px';
    header.style.color = 'var(--text-secondary)';
    header.style.fontSize = '12px';
    header.style.fontWeight = '500';
    header.style.textTransform = 'uppercase';
    header.style.letterSpacing = '0.05em';
    return header;
}

// Update the displayTimeData function to show all sites
async function displayTimeData(forceUpdate = false) {
    // Throttle updates to prevent excessive refreshes
    const now = Date.now();
    if (!forceUpdate && now - lastUpdate < 500) return;
    lastUpdate = now;

    try {
        // Get background state
        const backgroundState = await chrome.runtime.sendMessage({type: "getState"});
        const activeDomain = backgroundState.currentDomain;
        const activeTabDomains = new Set(backgroundState.activeTabs || []);
        
        // Get time data
        const data = await chrome.storage.local.get('timeData');
        const timeData = data.timeData || {};
        cachedState = timeData;
        
        // Sort all sites by last visit time, with active sites first
        const sortedSites = Object.entries(timeData)
            .sort(([domainA, a], [domainB, b]) => {
                // Active domain always comes first
                if (domainA === activeDomain) return -1;
                if (domainB === activeDomain) return 1;
                
                // Then active tabs
                const isActiveA = activeTabDomains.has(domainA);
                const isActiveB = activeTabDomains.has(domainB);
                if (isActiveA && !isActiveB) return -1;
                if (!isActiveA && isActiveB) return 1;
                
                // Finally sort by timestamp
                const timeA = a.timestamp || new Date(a.lastVisit).getTime();
                const timeB = b.timestamp || new Date(b.lastVisit).getTime();
                return timeB - timeA;
            });
        
        // Stop all existing timers
        stopAllTimers();
        
        // Clear existing entries
        const timeList = document.getElementById('timeList');
        timeList.innerHTML = '';

        // Split sites into active and inactive
        const activeSites = sortedSites.filter(([domain]) => activeTabDomains.has(domain));
        const inactiveSites = sortedSites.filter(([domain]) => !activeTabDomains.has(domain));

        // Add Active Tabs section if there are any
        if (activeSites.length > 0) {
            timeList.appendChild(createSectionHeader('Active Tabs'));
            for (const [domain, data] of activeSites) {
                await updateSiteEntry(domain, data, activeDomain, backgroundState, !forceUpdate);
            }
        }

        // Add Inactive Tabs section if there are any
        if (inactiveSites.length > 0) {
            timeList.appendChild(createSectionHeader('Inactive Tabs'));
            for (const [domain, data] of inactiveSites) {
                await updateSiteEntry(domain, data, activeDomain, backgroundState, !forceUpdate);
                const entry = document.querySelector(`[data-domain="${domain}"]`)?.closest('.site-entry');
                if (entry) {
                    entry.classList.add('inactive');
                }
            }
        }

        // If no sites at all, show a message
        if (sortedSites.length === 0) {
            timeList.innerHTML = `
                <div class="no-sites-message">
                    No browsing history yet.
                    <br>
                    Visit some websites to start tracking time.
                </div>
            `;
        }

        // Update storage details
        await updateStorageDetails();
    } catch (e) {
        console.error('Error updating display:', e);
        const timeList = document.getElementById('timeList');
        timeList.innerHTML = `
            <div class="error-message">
                Error updating display. Please try reopening the extension.
                <br>
                Error: ${e.message}
            </div>
        `;
    }
}

// Show cached data immediately
async function showCachedData() {
    try {
        const timeData = await loadCachedState();
        // Get current state to know which tabs are active
        const backgroundState = await chrome.runtime.sendMessage({type: "getState"});
        const activeTabDomains = new Set(backgroundState.activeTabs || []);
        
        console.log('Initial active tabs:', Array.from(activeTabDomains));
        
        const sortedSites = Object.entries(timeData)
            .filter(([domain]) => activeTabDomains.has(domain))
            .sort(([, a], [, b]) => b.totalTime - a.totalTime);
        
        console.log('Initial sorted sites:', sortedSites);
        
        for (const [domain, data] of sortedSites) {
            await updateSiteEntry(domain, data, backgroundState.currentDomain, backgroundState, true);
        }
        
        // If no sites are displayed, show a message
        if (sortedSites.length === 0) {
            const timeList = document.getElementById('timeList');
            timeList.innerHTML = `
                <div class="no-sites-message" style="text-align: center; padding: 20px; color: #666;">
                    No active tabs being tracked.
                    <br>
                    Visit some websites to start tracking time.
                </div>
            `;
        }
    } catch (e) {
        console.error('Error showing cached data:', e);
    }
}

// Update the clear data handler to use custom modal
document.getElementById('clearData').addEventListener('click', () => {
    const modal = document.getElementById('clearDataModal');
    modal.style.display = 'flex';
    setTimeout(() => modal.style.opacity = '1', 10);
});

document.getElementById('cancelClear').addEventListener('click', () => {
    const modal = document.getElementById('clearDataModal');
    modal.style.opacity = '0';
    setTimeout(() => modal.style.display = 'none', 300);
});

document.getElementById('confirmClear').addEventListener('click', async () => {
    const modal = document.getElementById('clearDataModal');
    
    // Get the current state before clearing
    const backgroundState = await chrome.runtime.sendMessage({type: "getState"});
    
    // Clear all data
    await chrome.storage.local.clear();
    stopAllTimers();
    siteNames.clear();
    cachedState = null;
    
    // If there's an active domain, immediately create new entry for it
    if (backgroundState.currentDomain) {
        const timeData = {
            [backgroundState.currentDomain]: {
                totalTime: 0,
                lastVisit: new Date().toISOString(),
                timestamp: Date.now(),
                dailyStats: {
                    [new Date().toISOString().split('T')[0]]: {
                        totalTime: 0,
                        visits: 1
                    }
                }
            }
        };
        
        // Save the new entry
        await chrome.storage.local.set({ timeData });
    }
    
    // Hide modal with animation
    modal.style.opacity = '0';
    setTimeout(() => modal.style.display = 'none', 300);
    
    // Send message to background script to reopen popup
    await chrome.runtime.sendMessage({ type: "reopenPopup" });
    
    // Close the current popup
    window.close();
});

// Add click handler to close modal when clicking overlay
document.getElementById('clearDataModal').addEventListener('click', (e) => {
    if (e.target.id === 'clearDataModal') {
        e.target.style.opacity = '0';
        setTimeout(() => e.target.style.display = 'none', 300);
    }
});

// Initialize display when popup opens
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme
    initializeTheme();
    
    // Add theme toggle listener
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.addEventListener('click', toggleTheme);
    
    // Show cached data immediately
    showCachedData();
    // Then fetch latest data
    displayTimeData(true);
});

// Listen for updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "timeUpdated") {
        displayTimeData();
    }
    return true;
});

// Add feedback button handler
document.getElementById('feedbackButton').addEventListener('click', () => {
    // Open GitHub issues page in a new tab
    chrome.tabs.create({
        url: 'https://github.com/wtu4979/time-tracker/issues/new/choose'
    });
});

// Add undo button event listener
document.querySelector('.undo-button').addEventListener('click', async () => {
    if (deletedSiteData) {
        // Restore the data
        const data = await chrome.storage.local.get('timeData');
        const timeData = data.timeData || {};
        timeData[deletedSiteData.domain] = deletedSiteData.data;
        await chrome.storage.local.set({ timeData });
        
        // Hide the notification
        hideUndoNotification();
        
        // Clear the deleted data
        deletedSiteData = null;
        
        // Refresh the display
        await displayTimeData(true);
    }
}); 