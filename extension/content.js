// content.js
console.log("MusicCave Content Script: FULL HYBRID MODE ACTIVE");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper for Visual Debugging (Outlines)
function highlightElement(el, color = "#fa243c") {
    if (!el) return;
    const originalOutline = el.style.outline;
    el.style.outline = `5px solid ${color}`;
    el.style.outlineOffset = "-3px";
    setTimeout(() => {
        if (el) el.style.outline = originalOutline;
    }, 1500);
}

// Utility to clean song titles
function getCleanSearchQuery(song) {
    let cleanTitle = song.title
        .split(' - ')[0] 
        .split(' (')[0]  
        .split(' [')[0]  
        .replace(/remaster(ed)?/gi, '')
        .trim();
    return `${cleanTitle} ${song.artist}`;
}

// ==========================================
// 1. SHARED AUTOMATION HELPERS
// ==========================================

async function typeIntoInput(input, text) {
    if (!input) return;
    input.focus();
    input.value = "";
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(200); 
    document.execCommand('insertText', false, text);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(600); 
}

function sendKey(element, key) {
    const codes = { 'ArrowRight': 39, 'ArrowDown': 40, 'Enter': 13, ' ': 32, 'Tab': 9 };
    const eventParams = {
        key: key, code: key === ' ' ? 'Space' : key,
        keyCode: codes[key], which: codes[key],
        bubbles: true, cancelable: true, view: window
    };
    element.dispatchEvent(new KeyboardEvent('keydown', eventParams));
    element.dispatchEvent(new KeyboardEvent('keyup', eventParams));
}

async function commitSelection(element = null) {
    const target = element || document.activeElement;
    if (!target || target.tagName === 'BODY') return;
    console.log("Robot: Committing selection on:", target);
    highlightElement(target, "#1db954");
    
    const mouseOpts = { bubbles: true, cancelable: true, view: window, buttons: 1 };
    target.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
    target.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
    target.click();
    
    const eventParams = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', eventParams));
    target.dispatchEvent(new KeyboardEvent('keypress', eventParams));
    target.dispatchEvent(new KeyboardEvent('keyup', eventParams));
    await sleep(500);
}

// ==========================================
// 2. APPLE-SPECIFIC HELPERS (RESTORED FROM BACKUP)
// ==========================================

async function typeIntoAppleInput(input, text) {
    if (!input) return;
    input.style.outline = "5px solid #1db954"; 
    input.focus();
    input.value = "";
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300); 
    
    document.execCommand('insertText', false, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    console.log("Robot: Apple Text Entered. Waiting 1.5s for state sync...");
    await sleep(1500); 
}

async function triggerAppleSearch(input) {
    console.log("Robot: Attempting to trigger search...");
    const eventParams = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', eventParams));
    input.dispatchEvent(new KeyboardEvent('keypress', eventParams));
    input.dispatchEvent(new KeyboardEvent('keyup', eventParams));
    await sleep(500);
    const form = input.closest('form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await sleep(1000);
}

// ==========================================
// 3. SCROLL & SCRAPE LOGIC
// ==========================================

async function deepScrape() {
    const isSpotify = window.location.href.includes('spotify');
    console.log(`MusicCave: Starting Deep Scrape for ${isSpotify ? 'Spotify' : 'Apple'}...`);
    
    // --- 1. DETECT PLAYLIST NAME (FIXED SELECTORS) ---
    let detectedName = "Unknown Playlist";
    try {
        if (isSpotify) {
            // Target the H1 specifically in the main content area
            const h1 = document.querySelector('main h1[data-testid="type-entity-title"], main h1');
            if (h1) detectedName = h1.innerText.trim();
        } else {
            const h1 = document.querySelector('.playlist-header-description__title, h1');
            if (h1) detectedName = h1.innerText.trim();
        }
    } catch (e) { console.error("Robot: Name detection failed", e); }
    
    console.log("Robot: Detected Name ->", detectedName);

    let allSongs = new Map();
    let foundPlaylists = new Map();
    let lastSongCount = 0; 
    let lastPlaylistCount = 0;
    let sameCountTicks = 0;

    for (let i = 0; i < 200; i++) {
        // --- 2. SCRAPE VISIBLE DATA ---
        if (isSpotify) {
            // Restored Spotify Track Scrape
            document.querySelectorAll('[data-testid="tracklist-row"]').forEach(row => {
                const isRecommended = row.closest('[data-testid="recommended-track"]') || row.closest('.playlistRecommenderContainer');
                if (isRecommended) return; 

                const titleEl = row.querySelector('a[data-testid="internal-track-link-name"], div[dir="auto"]');
                const artistEls = row.querySelectorAll('a[href^="/artist/"]');
                if (titleEl) {
                    const title = titleEl.innerText.trim();
                    const artist = Array.from(artistEls).map(a => a.innerText).join(', ');
                    allSongs.set(`${title}-${artist}`.toLowerCase(), { title, artist });
                }
            });

            // Restored Spotify Sidebar Playlists
            document.querySelectorAll('[role="row"]').forEach(row => {
                const text = row.innerText || "";
                if (text.includes("Playlist") || text.includes("Liked") || text.includes("leuk vindt")) {
                    const name = text.split('\n')[0].trim();
                    if (row.getBoundingClientRect().left < 400 && name.length > 1) {
                        foundPlaylists.set(name, { name, id: Math.random(), songs: "Spotify" });
                    }
                }
            });
        } else {
            // Apple Scrape
            document.querySelectorAll('main [role="row"], .songs-list-row').forEach(row => {
                const titleEl = row.querySelector('[data-testid="track-title"], .songs-list-row__song-name');
                const artistEl = row.querySelector('[data-testid="track-artist"], .songs-list-row__by-line');
                if (titleEl) {
                    const title = titleEl.innerText.trim();
                    const artist = artistEl ? artistEl.innerText.trim() : "Unknown";
                    allSongs.set(`${title}-${artist}`.toLowerCase(), { title, artist });
                }
            });
            document.querySelectorAll('nav a[href*="/playlist/"]').forEach(link => {
                const name = link.innerText.trim();
                if (name.length > 1) foundPlaylists.set(name, { name, id: Math.random(), songs: "Apple" });
            });
        }

        // RESTORED ORIGINAL LOGS
        console.log(`Scrape Progress: ${allSongs.size} songs | ${foundPlaylists.size} playlists.`);

        // --- 3. SCROLL LOGIC ---
        if (isSpotify) {
            const songRows = document.querySelectorAll('[data-testid="tracklist-row"]');
            if (songRows.length > 0) songRows[songRows.length - 1].scrollIntoView();
            
            const allScrollables = Array.from(document.querySelectorAll('*')).filter(el => {
                const s = window.getComputedStyle(el);
                return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
            });
            const sidebar = allScrollables.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];
            if (sidebar) sidebar.scrollTop += 600;
        } else {
            const spinner = document.querySelector('[data-testid="infinite-scroll-spinner"]');
            if (spinner) spinner.scrollIntoView();
            else {
                const appleRows = document.querySelectorAll('main [role="row"]');
                if (appleRows.length > 0) appleRows[appleRows.length - 1].scrollIntoView();
            }
        }

        await sleep(isSpotify ? 800 : 1500);

        // --- 4. EXIT STRATEGY ---
        const hasSongsStopped = allSongs.size === lastSongCount;
        const hasPlaylistsStopped = foundPlaylists.size === lastPlaylistCount;

        if (hasSongsStopped && hasPlaylistsStopped) {
            sameCountTicks++;
        } else {
            sameCountTicks = 0;
        }

        if (sameCountTicks >= 3) {
            console.log("MusicCave: Reached the end of list.");
            break;
        }

        lastSongCount = allSongs.size;
        lastPlaylistCount = foundPlaylists.size;
    }
    
    return { 
        songs: Array.from(allSongs.values()), 
        playlists: Array.from(foundPlaylists.values()),
        detectedPlaylistName: detectedName 
    };
}

// ==========================================
// 4. APPLE INJECTION (RESTORED FROM BACKUP)
// ==========================================

async function executeAppleInjection(song, targetName, sendResponse) {
    try {
        const finalTargetName = (targetName || "MusicCave").toLowerCase().trim();
        const searchQuery = getCleanSearchQuery(song);
        console.log(`Robot: Starting Apple search for: ${song.title}`);

        let searchInput = document.querySelector('input[type="search"]');
        if (!searchInput) {
            console.log("Robot: Search bar not found, clicking sidebar link...");
            const searchLink = document.querySelector('a[href*="/search"]');
            if (searchLink) searchLink.click();
            await sleep(2000); 
            searchInput = document.querySelector('input[type="search"]');
        }
        if (!searchInput) throw new Error("Search bar not found");

        // Use the specialized typing and search trigger from backup
        await typeIntoAppleInput(searchInput, searchQuery);
        await triggerAppleSearch(searchInput);
        
        await sleep(4000); 

        const rows = document.querySelectorAll('main [role="row"], main .songs-list-row, main .grid-item');
        let songRow = Array.from(rows).find(row => 
            row.innerText.toLowerCase().includes(song.title.split(' - ')[0].toLowerCase())
        );

        if (!songRow) throw new Error(`Song not found.`);
        console.log(`Robot: Song row found for ${song.title}`);

        songRow.scrollIntoView({ block: 'center' });
        const rowButtons = Array.from(songRow.querySelectorAll('button'));
        let targetMoreBtn = null;

        for (let btn of rowButtons) {
            btn.focus();
            highlightElement(btn, "#1db954");
            const isMore = btn.classList.contains('contextual-menu__trigger') || 
                           btn.querySelector('[data-testid="more-button"]') ||
                           btn.getAttribute('aria-label')?.toLowerCase().includes('meer') ||
                           btn.getAttribute('aria-label')?.toLowerCase().includes('more');

            if (isMore) {
                targetMoreBtn = btn;
                await commitSelection(btn);
                break;
            }
        }

        if (!targetMoreBtn) throw new Error("More button not found.");
        console.log("Robot: 'More' menu opened.");
        await sleep(1500); 

        console.log(`Robot: Tabbing down to find playlist: "${finalTargetName}"`);
        const menuButtons = document.querySelectorAll('button[title*="afspeellijst"], button[title*="playlist"], .context-menu__item');
        const addBtn = Array.from(menuButtons).find(btn => {
            const txt = (btn.innerText + btn.getAttribute('title')).toLowerCase();
            return txt.includes("voeg toe") || txt.includes("add to");
        });

       if (!addBtn) throw new Error("'Add to Playlist' not found.");
        
        addBtn.focus();
        highlightElement(addBtn, "#1db954");
        await sleep(800);
        console.log("Robot: Pressing ArrowRight to open flyout...");

        sendKey(addBtn, 'ArrowRight');
        await sleep(1500); 

        console.log(`Robot: Tabbing down to find playlist: "${finalTargetName}"`);
        let foundPlaylist = false;
        for (let i = 0; i < 35; i++) {
            const focused = document.activeElement;
            const currentText = focused.innerText.toLowerCase().trim();
            console.log(`Robot: Currently focused on: "${currentText}"`);

            if (currentText === finalTargetName) {
                console.log("Robot: Match found! Committing...");
                await commitSelection(focused);
                foundPlaylist = true; break;
            }
            sendKey(focused, 'ArrowDown');
            await sleep(400);
        }

        if (!foundPlaylist) throw new Error(`Playlist '${finalTargetName}' not found.`);
        sendResponse({ status: "Success" });
    } catch (err) { 
        console.error("Apple Injection Error:", err);
        sendResponse({ status: "Error", message: err.toString() }); 
    }
}

// ==========================================
// 5. SPOTIFY INJECTION (STAYING AS IS - WORKS!)
// ==========================================

async function executeSpotifyInjection(song, targetName, sendResponse) {
    try {
        const finalTargetName = (typeof targetName === 'string') ? targetName : "Cave";
        const searchQuery = getCleanSearchQuery(song);

          const baseCleanTitle = song.title
            .split(' - ')[0] 
            .split(' (')[0]  
            .split(' [')[0]  
            .replace(/remaster(ed)?/gi, '')
            .trim()
            .toLowerCase();

        console.log(`Robot: Starting Spotify injection for ${searchQuery}`);
        document.body.click(); 
        await sleep(1000);

        let searchInput = document.querySelector('input[data-testid="search-input"]');
        if (!searchInput) {
            const searchLink = document.querySelector('a[href="/search"], a[href="/zoeken"]');
            if (searchLink) searchLink.click();
            await sleep(1500);
            searchInput = document.querySelector('input[data-testid="search-input"]');
        }
        if (!searchInput) throw new Error("Search bar not found");

        await typeIntoInput(searchInput, searchQuery);
        sendKey(searchInput, 'Enter');
        await sleep(3000); 

        // ==========================================
        // NEW STEP: CLICK THE "SONGS" / "NUMMERS" CHIP
        // ==========================================
        console.log("Robot: Looking for 'Songs'/'Nummers' filter chip...");
        let filterClicked = false;
        
        for (let i = 0; i < 10; i++) {
            // Grab spans that look like chips, or just buttons in the top section
            const possibleChips = document.querySelectorAll('button span[class*="chip"], button');
            const targetChip = Array.from(possibleChips).find(el => {
                const txt = el.innerText?.trim().toLowerCase() || "";
                // Support Dutch, English, etc.
                return txt === "nummers" || txt === "songs" || txt === "tracks";
            });

            if (targetChip) {
                console.log(`Robot: Found filter chip: "${targetChip.innerText}". Clicking it...`);
                // If the target is a span, click its parent button just to be safe
                const clickable = targetChip.closest('button') || targetChip;
                highlightElement(clickable, "#1db954");
                clickable.click();
                filterClicked = true;
                break;
            }
            await sleep(400); // Wait and retry if it hasn't rendered yet
        }

        if (filterClicked) {
            await sleep(2000); // Wait for the tracklist to filter and re-render
        } else {
            console.log("Robot: Warning - Could not find Songs filter chip. Attempting to continue anyway...");
        }
        // ==========================================

        console.log("Robot: Searching for tracklist row...");
        let targetRow = null;
               for (let i = 0; i < 15; i++) {
            const rows = document.querySelectorAll('main [data-testid="tracklist-row"], [role="row"]');
            
            // 1. Get only the visible rows (filters out sidebars and hidden stuff)
            const visibleRows = Array.from(rows).filter(row => {
                const rect = row.getBoundingClientRect();
                return rect.left > 250 && rect.width > 0;
            });

            if (visibleRows.length > 0) {
                // Priority 1: Exact title match (safest)
                targetRow = visibleRows.find(row => 
                    row.innerText.toLowerCase().includes(song.title.split(' - ')[0].toLowerCase())
                );
                
                // Priority 2: Ultra-clean title match (Finds "Fade to Black" even if it says Remastered)
                if (!targetRow) {
                    targetRow = visibleRows.find(row => 
                        row.innerText.toLowerCase().includes(baseCleanTitle)
                    );
                }

                // Priority 3: Ultimate Fallback -> Just grab the #1 top search result!
                if (!targetRow) {
                    console.log(`Robot: Using top search result fallback for: ${song.title}`);
                    targetRow = visibleRows[0]; // Grab the first row
                }
            }

            if (targetRow) break;
            await sleep(400);
        }
        if (!targetRow) throw new Error(`Song result not found.`);

        targetRow.scrollIntoView({ block: 'center' });
        highlightElement(targetRow, "#1db954");
        await sleep(600);

        const moreBtn = targetRow.querySelector('button[data-testid="more-button"], [aria-haspopup="menu"]');
        if (moreBtn) moreBtn.click();
     else {
            console.log("Robot: No more-button, attempting context menu click...");
            targetRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
        }        
        await sleep(1500); 

        let addBtn = null;
        for (let i = 0; i < 10; i++) {
            const items = document.querySelectorAll('[role="menuitem"], li, button, span');
            addBtn = Array.from(items).find(el => {
                const t = el.innerText.toLowerCase();
                const isSidebar = el.closest('[data-testid="left-sidebar"]') || el.closest('nav');
                return (t.includes("playlist") || t.includes("afspeellijst")) && 
                       (t.includes("add") || t.includes("toevoegen")) && !isSidebar;
            });
            if (addBtn) break;
            await sleep(400);
        }

        if (!addBtn) throw new Error("'Toevoegen' button not found.");

        addBtn.focus();
        highlightElement(addBtn, "#1db954");
        console.log("Robot: Navigating into Spotify sub-menu...");

        sendKey(addBtn, 'ArrowRight');
        await sleep(1000); 
        sendKey(addBtn, 'ArrowDown'); 
        await sleep(2000); 

        const playlistSearch = document.querySelector('[role="menu"] input');
        if (playlistSearch) {
            console.log("Robot: Found sub-menu search box. Typing name...");
            highlightElement(playlistSearch, "#1db954");
            sendKey(playlistSearch, 'ArrowRight');
            await sleep(400);
            await typeIntoInput(playlistSearch, finalTargetName);
            await sleep(1200);
            sendKey(playlistSearch, 'ArrowDown');
            await sleep(600);
            sendKey(playlistSearch, 'ArrowDown');
            await sleep(800);
            await commitSelection();
            sendResponse({ status: "Success" });
        } else {
            console.log("Robot: No search box in flyout, searching by element text...");
            const allItems = document.querySelectorAll('[role="menuitem"], span, button');
            const targetPlaylistBtn = Array.from(allItems).find(el => {
                const text = el.innerText?.trim() || "";
                return text.toLowerCase() === finalTargetName.toLowerCase() && el.getBoundingClientRect().width > 0;
            });
            if (targetPlaylistBtn) {
                await commitSelection(targetPlaylistBtn);
                sendResponse({ status: "Success" });
            } else {
                throw new Error("Flyout interaction failed.");
            }
        }
    } catch (err) {
        console.error("Spotify Injection Error:", err);
        sendResponse({ status: "Error", message: err.toString() });
    }
}

// ==========================================
// 6. ROUTING
// ==========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_PAGE_INFO") {
        deepScrape().then(data => sendResponse({ ...data, status: "Success" }));
        return true; 
    }
    if (request.action === "INJECT_SONG") {
        if (window.location.href.includes('spotify.com')) {
            executeSpotifyInjection(request.song, request.targetName, sendResponse);
        } else if (window.location.href.includes('apple.com')) {
            executeAppleInjection(request.song, request.targetName, sendResponse);
        }
        return true; 
    }
});