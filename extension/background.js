// background.js
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    
    // ACTION 1: SCAN ALL TABS 
    if (request.action === "PING_EXTENSION") {
        chrome.tabs.query({}, async (tabs) => {
            const musicTabs = tabs.filter(t => t.url?.includes('music.apple.com') || t.url?.includes('open.spotify.com'));
            if (musicTabs.length === 0) { sendResponse({ tabsData: [] }); return; }
            for (const tab of musicTabs) { await chrome.tabs.update(tab.id, { active: true }); }
            let results = [];
            let processedCount = 0;
            musicTabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { action: "GET_PAGE_INFO" }, (resp) => {
                    if (resp) results.push({ ...resp, tabId: tab.id });
                    processedCount++;
                    if (processedCount === musicTabs.length) sendResponse({ tabsData: results });
                });
            });
        });
        return true; 
    }

    // ACTION 1.5: SCAN SPECIFIC PLATFORM
    if (request.action === "SCAN_SPECIFIC_PLATFORM") {
        chrome.tabs.query({}, async (tabs) => {
            const targetTab = tabs.find(t => t.url?.includes(request.platform));
            if (!targetTab) { sendResponse({ tabsData: [] }); return; }
            await chrome.tabs.update(targetTab.id, { active: true });
            chrome.tabs.sendMessage(targetTab.id, { action: "GET_PAGE_INFO" }, (resp) => {
                if (resp) sendResponse({ tabsData: [{ ...resp, tabId: targetTab.id }] });
                else sendResponse({ tabsData: [] });
            });
        });
        return true; 
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
                        targetName: request.targetName,
                        progress: request.progress // Passing progress through!
                    }, (response) => {
                        if (chrome.runtime.lastError) sendResponse({ status: "Error", message: "Tab closed or not responding" });
                        else sendResponse(response);
                    });
                }, 500);
            } else {
                sendResponse({ status: "Error", message: `Please open ${isSpotifyTarget ? 'Spotify' : 'Apple Music'} first.` });
            }
        });
        return true;
    }

    // ACTION 3: BRING DASHBOARD BACK TO FRONT
    if (request.action === "RETURN_TO_DASHBOARD") {
        try {
            const origin = new URL(request.dashboardUrl).origin;
            chrome.tabs.query({}, (tabs) => {
                const dashboardTab = tabs.find(t => t.url && t.url.startsWith(origin));
                if (dashboardTab) {
                    chrome.tabs.update(dashboardTab.id, { active: true });
                    chrome.windows.update(dashboardTab.windowId, { focused: true });
                }
                sendResponse({ status: "Success" });
            });
        } catch (e) { sendResponse({ status: "Error" }); }
        return true;
    }

    // ACTION 4: CLEANUP UI WHEN FINISHED
    if (request.action === "CLEANUP_UI") {
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                // Send cleanup command to all tabs just to be safe
                chrome.tabs.sendMessage(tab.id, { action: "REMOVE_UI" }, () => {
                    // Ignore errors if the tab doesn't have the script
                    let lastError = chrome.runtime.lastError; 
                });
            });
        });
        sendResponse({status: "Success"});
        return true;
    }
});