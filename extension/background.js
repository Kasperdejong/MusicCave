// background.js
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    
    // ACTION 1: SCAN ALL TABS (Old Generic Ping)
    if (request.action === "PING_EXTENSION") {
        chrome.tabs.query({}, async (tabs) => {
            const musicTabs = tabs.filter(t => 
                t.url?.includes('music.apple.com') || t.url?.includes('open.spotify.com')
            );

            if (musicTabs.length === 0) {
                sendResponse({ tabsData: [] });
                return;
            }

            for (const tab of musicTabs) {
                await chrome.tabs.update(tab.id, { active: true });
            }

            let results = [];
            let processedCount = 0;

            musicTabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { action: "GET_PAGE_INFO" }, (resp) => {
                    if (resp) results.push({ ...resp, tabId: tab.id });
                    processedCount++;
                    if (processedCount === musicTabs.length) {
                        sendResponse({ tabsData: results });
                    }
                });
            });
        });
        return true; 
    }

    // ACTION 1.5: SCAN SPECIFIC PLATFORM (The New Logic)
    // Put this here so you can trigger a scan for JUST Apple or JUST Spotify
    if (request.action === "SCAN_SPECIFIC_PLATFORM") {
        chrome.tabs.query({}, async (tabs) => {
            // Filter to find only the tab for the platform requested (e.g., 'apple')
            const targetTab = tabs.find(t => t.url?.includes(request.platform));

            if (!targetTab) {
                console.log(`Background: No tab found for ${request.platform}`);
                sendResponse({ tabsData: [] });
                return;
            }

            // 1. Focus the tab to "wake it up" for the deep scrape
            await chrome.tabs.update(targetTab.id, { active: true });
            
            // 2. Tell that specific tab to run the Deep Scrape
            chrome.tabs.sendMessage(targetTab.id, { action: "GET_PAGE_INFO" }, (resp) => {
                // Return data in the same format as the old PING so the React App doesn't break
                if (resp) {
                    sendResponse({ tabsData: [{ ...resp, tabId: targetTab.id }] });
                } else {
                    sendResponse({ tabsData: [] });
                }
            });
        });
        return true; // Keep channel open for the async scrape
    }

    // ACTION 2: TRANSFER SONG (Injection)
    if (request.action === "TRANSFER_SONG_TO_SPOTIFY" || request.action === "TRANSFER_SONG_TO_APPLE") {
        const isSpotifyTarget = request.action.includes("SPOTIFY");
        const targetUrlPart = isSpotifyTarget ? "spotify.com" : "apple.com";

        chrome.tabs.query({}, (tabs) => {
            const targetTab = tabs.find(t => t.url?.includes(targetUrlPart));

            if (targetTab) {
                chrome.tabs.update(targetTab.id, { active: true });
                chrome.windows.update(targetTab.windowId, { focused: true });
                
                setTimeout(() => {
                    chrome.tabs.sendMessage(targetTab.id, { 
                        action: "INJECT_SONG", 
                        song: request.song, 
                        targetName: request.targetName 
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            sendResponse({ status: "Error", message: "Tab closed or not responding" });
                        } else {
                            sendResponse(response);
                        }
                    });
                }, 500);

            } else {
                sendResponse({ 
                    status: "Error", 
                    message: `Please open ${isSpotifyTarget ? 'Spotify' : 'Apple Music'} first.` 
                });
            }
        });
        return true;
    }
});