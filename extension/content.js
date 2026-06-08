// content.js
console.log("MusicCave Content Script: FULL HYBRID MODE ACTIVE");

// The Global Cancel Flag
let globalCancelFlag = false;

// Smart Sleep. This checks the cancel flag every 100ms. 
// If you click cancel, it instantly throws an error to abort the script!
const sleep = (ms) => new Promise((resolve, reject) => {
    let waited = 0;
    const tick = 100;
    const interval = setInterval(() => {
        if (globalCancelFlag) {
            clearInterval(interval);
            reject(new Error("CANCELLED_BY_USER"));
        }
        waited += tick;
        if (waited >= ms) {
            clearInterval(interval);
            resolve();
        }
    }, tick);
});

// The UI Renderer
function renderProgressUI(song, progress) {
    if (!progress) return;
    let overlay = document.getElementById("musiccave-progress-ui");
    
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "musiccave-progress-ui";
        overlay.style.cssText = `
            position: fixed; bottom: 30px; right: 30px; width: 300px;
            background-color: #222; border: 2px solid #6a0dad; border-radius: 12px;
            padding: 15px; z-index: 2147483647; color: white; font-family: sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8);
        `;
        
        overlay.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <strong style="font-size: 16px;">MusicCave Transfer</strong>
            </div>
            <div id="musiccave-progress-text" style="color: #1db954; font-weight: bold; margin-bottom: 5px;"></div>
            <div id="musiccave-song-title" style="font-size: 13px; color: #aaa; margin-bottom: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
            <button id="musiccave-cancel-btn" style="width: 100%; background-color: #ff4d4d; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 10px rgba(255, 77, 77, 0.4);">
                ⏹ CANCEL
            </button>
        `;
        document.body.appendChild(overlay);

        document.getElementById("musiccave-cancel-btn").addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            globalCancelFlag = true;
            const btn = document.getElementById("musiccave-cancel-btn");
            btn.innerText = "Leaving the cave early...";
            btn.style.backgroundColor = "#555";
        });
    }
    
    // Update text for current song
    document.getElementById("musiccave-progress-text").innerText = `Moving Song ${progress.current} of ${progress.total}`;
    document.getElementById("musiccave-song-title").innerText = `${song.title} - ${song.artist}`;
}

function removeProgressUI() {
    const overlay = document.getElementById("musiccave-progress-ui");
    if (overlay) overlay.remove();
}

// ==========================================
// UI: SCAN PROGRESS
// ==========================================
function renderScanProgressUI(songCount, playlistCount) {
    let overlay = document.getElementById("musiccave-scan-ui");
    
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "musiccave-scan-ui";
        overlay.style.cssText = `
            position: fixed; bottom: 30px; right: 30px; width: 300px;
            background-color: #222; border: 2px solid #6a0dad; border-radius: 12px;
            padding: 15px; z-index: 2147483647; color: white; font-family: sans-serif;
            box-shadow: 0 10px 30px rgba(0,0,0,0.8);
        `;
        
        overlay.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <strong style="font-size: 16px;">MusicCave Scanner</strong>
            </div>
            <!-- SPICED SCAN TEXT -->
            <div style="color: #1db954; font-weight: bold; margin-bottom: 10px; font-size: 14px;">Cave crawling...</div>
            <div style="font-size: 13px; color: #aaa; margin-bottom: 5px;">Songs Found: <span id="musiccave-scan-songs" style="color:#fff; font-weight:bold; font-size: 16px;">0</span></div>
            <div style="font-size: 13px; color: #aaa; margin-bottom: 15px;">Playlists Found: <span id="musiccave-scan-playlists" style="color:#fff; font-weight:bold; font-size: 16px;">0</span></div>
            <button id="musiccave-scan-cancel-btn" style="width: 100%; background-color: #ff4d4d; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer;">
                ⏹ FINISH EARLY
            </button>
        `;
        document.body.appendChild(overlay);

        document.getElementById("musiccave-scan-cancel-btn").addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            globalCancelFlag = true;
            const btn = document.getElementById("musiccave-scan-cancel-btn");
            btn.innerText = "Leaving the cave early...";
            btn.style.backgroundColor = "#555";
        });
    }
    
    // Live update the numbers
    document.getElementById("musiccave-scan-songs").innerText = songCount;
    document.getElementById("musiccave-scan-playlists").innerText = playlistCount;
}

function removeScanProgressUI() {
    const overlay = document.getElementById("musiccave-scan-ui");
    if (overlay) overlay.remove();
}

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
        .split(' - ')[0].split(' (')[0].split(' [')[0]  
        .replace(/remaster(ed)?/gi, '').trim();
        
    // FIX: Only use the primary artist to prevent search failures on Apple Music
    let mainArtist = song.artist
        .split(',')[0]
        .split(' & ')[0]
        .split(/feat\.?/i)[0]
        .split(/ft\.?/i)[0]
        .trim();
        
    return `${cleanTitle} ${mainArtist}`;
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
    
    const eventOpts = { bubbles: true, cancelable: true, view: window, buttons: 1 };

    // UPGRADE: Simulate modern Pointer Events (Required for Apple Music)
    if (typeof PointerEvent !== 'undefined') {
        target.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
        target.dispatchEvent(new PointerEvent('pointerup', eventOpts));
    }
    
    // Standard Mouse Events
    target.dispatchEvent(new MouseEvent('mousedown', eventOpts));
    target.dispatchEvent(new MouseEvent('mouseup', eventOpts));
    target.click();
    
    // Standard Keyboard Events
    const keyOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
    target.dispatchEvent(new KeyboardEvent('keypress', keyOpts));
    target.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
    
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
    globalCancelFlag = false;
    const isSpotify = window.location.href.includes('spotify');
    console.log(`MusicCave: Starting Deep Scrape for ${isSpotify ? 'Spotify' : 'Apple'}...`);
    
    // --- 1. DETECT PLAYLIST NAME ---
    let detectedName = "Unknown Playlist";
    try {
        if (isSpotify) {
            const h1 = document.querySelector('main h1[data-testid="type-entity-title"], main h1');
            if (h1) detectedName = h1.innerText.trim();
        } else {
            const h1 = document.querySelector('.playlist-header-description__title, h1');
            if (h1) detectedName = h1.innerText.trim();
        }
    } catch (e) { console.error("Robot: Name detection failed", e); }
    
    const lowerName = detectedName.toLowerCase();
    if (isSpotify && (lowerName.includes("liked") || lowerName.includes("gelikete") || lowerName.includes("leuk"))) {
        detectedName = "LIKED_SPOTIFY";
    } else if (!isSpotify && (lowerName.includes("favorite") || lowerName.includes("favoriete") || lowerName.includes("library") || lowerName.includes("bibliotheek"))) {
        detectedName = "LIBRARY_APPLE";
    }
    
    console.log("Robot: Detected Name ->", detectedName);

    try {
        // ==========================================
        // NEW: PRE-SCAN SCROLL TO TOP
        // ==========================================
        console.log("Robot: Forcing lists to the absolute top before scanning...");
        renderScanProgressUI("Climbing to the top of the page before scanning ▲", "▲");

        let lastFirstItemText = "";
        let sameTopTicks = 0;

        for (let t = 0; t < 50; t++) { 
            if (globalCancelFlag) throw new Error("CANCELLED_BY_USER"); // Instantly aborts if cancelled
            
            let currentFirstText = "";

            if (isSpotify) {
                const songRows = document.querySelectorAll('[data-testid="tracklist-row"]');
                if (songRows.length > 0) {
                    songRows[0].scrollIntoView({ block: 'start' });
                    currentFirstText = songRows[0].innerText;
                }
                
                const allScrollables = Array.from(document.querySelectorAll('*')).filter(el => {
                    const s = window.getComputedStyle(el);
                    return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
                });
                const sidebar = allScrollables.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];
                if (sidebar) sidebar.scrollTop = 0;

            } else {
                window.scrollTo(0, 0);
                const appleRows = document.querySelectorAll('main [role="row"], .songs-list-row');
                if (appleRows.length > 0) {
                    appleRows[0].scrollIntoView({ block: 'start' });
                    currentFirstText = appleRows[0].innerText;
                }
            }

            if (currentFirstText === lastFirstItemText && currentFirstText !== "") {
                sameTopTicks++;
            } else {
                sameTopTicks = 0;
            }

            if (sameTopTicks >= 3) {
                console.log("Robot: Reached the absolute top! Ready to scan downwards.");
                break;
            }

            lastFirstItemText = currentFirstText;
            await sleep(isSpotify ? 600 : 1000); 
        }

        document.getElementById("musiccave-scan-songs").innerText = "0";
        document.getElementById("musiccave-scan-playlists").innerText = "0";

        // ==========================================
        // 2. ORIGINAL DOWNWARD SCRAPE & SCROLL
        // ==========================================
        let allSongs = new Map();
        let foundPlaylists = new Map();
        let lastSongCount = 0; 
        let lastPlaylistCount = 0;
        let sameCountTicks = 0;

        for (let i = 0; i < 200; i++) {
            if (globalCancelFlag) throw new Error("CANCELLED_BY_USER"); // Instantly aborts if cancelled
            
            if (isSpotify) {
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

            console.log(`Scrape Progress: ${allSongs.size} songs | ${foundPlaylists.size} playlists.`);

            try {
                chrome.runtime.sendMessage({
                    action: "UPDATE_SCAN_PROGRESS",
                    payload: { songs: allSongs.size, playlists: foundPlaylists.size }
                });
            } catch(e) {
                console.log("Could not send progress", e);
            }

            renderScanProgressUI(allSongs.size, foundPlaylists.size);

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

    } catch (err) {
        // --- THIS GRACEFULLY CATCHES THE CANCEL BUTTON AND FREES THE DASHBOARD ---
        if (err.message === "CANCELLED_BY_USER") {
            console.log("Robot: Scan aborted by user.");
            return { songs: [], playlists: [], detectedPlaylistName: "Scan Cancelled" };
        }
        console.error("Scrape Error:", err);
        return { songs: [], playlists: [], detectedPlaylistName: "Error" };
    } finally {
        removeScanProgressUI();
    }
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
    }  catch (err) {
        console.error("Injection Error:", err);
        // Catch the custom cancel error
        if (err.message === "CANCELLED_BY_USER") {
            sendResponse({ status: "Cancelled", message: "User cancelled from popup" });
        } else {
            sendResponse({ status: "Error", message: err.toString() });
        }
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
         console.log("Robot: Checking for 'Already Added' popup...");
        await sleep(1200); // Give Spotify a moment to render the modal

        const duplicateText = document.querySelector('[data-testid="confirm-dialog-description"]');
        if (duplicateText) {
            console.log("Robot: Duplicate Popup detected!");
            
            // 1. Go up the HTML tree to isolate the Modal Box itself.
            // This prevents the robot from accidentally finding Play/Pause buttons on the main screen.
            const modalContainer = duplicateText.parentElement.parentElement; 
            
            if (modalContainer) {
                // 2. ONLY look for buttons inside this specific modal box
                const modalButtons = modalContainer.querySelectorAll('button');
                
                let skipBtn = Array.from(modalButtons).find(b => {
                    const txt = b.innerText.toLowerCase();
                    return txt.includes("niet") || txt.includes("don't") || txt.includes("skip") || txt.includes("cancel");
                });

                // Fallback just in case text doesn't match
                if (!skipBtn) {
                    skipBtn = modalContainer.querySelector('[data-encore-id="buttonPrimary"]');
                }

                if (skipBtn) {
                    console.log("Robot: Safely locked onto the Modal's skip button. Clicking it...");
                    skipBtn.focus();
                    highlightElement(skipBtn, "#ff4d4d");
                    await sleep(300);
                    
                    // Fire both native click and React Enter key just to guarantee it triggers
                    skipBtn.click();
                    sendKey(skipBtn, 'Enter');
                    
                    await sleep(1000); // Wait for modal to disappear
                }
            }
        }

        // Send success after the modal check is done
        sendResponse({ status: "Success" });
    } catch (err) {
        console.error("Injection Error:", err);
        // Catch the custom cancel error
        if (err.message === "CANCELLED_BY_USER") {
            sendResponse({ status: "Cancelled", message: "User cancelled from popup" });
        } else {
            sendResponse({ status: "Error", message: err.toString() });
        }
    }
}

// ==========================================
// NEW: APPLE LIBRARY INJECTION
// ==========================================

// ==========================================
// NEW: APPLE FAVORITES INJECTION (Keyboard Navigation Mode)
// ==========================================
async function executeAppleLibraryInjection(song, sendResponse) {
    try {
        const searchQuery = getCleanSearchQuery(song);
        console.log(`Robot: Starting Apple Favorites injection for: ${song.title}`);

        // 1. Search Logic
        let searchInput = document.querySelector('input[type="search"]');
        if (!searchInput) {
            const searchLink = document.querySelector('a[href*="/search"]');
            if (searchLink) searchLink.click();
            await sleep(2000); 
            searchInput = document.querySelector('input[type="search"]');
        }
        if (!searchInput) throw new Error("Search bar not found");

        await typeIntoAppleInput(searchInput, searchQuery);
        await triggerAppleSearch(searchInput);
        await sleep(4000); 

        // 2. Find Song Row
        const rows = document.querySelectorAll('main [role="row"], main .songs-list-row, main .grid-item');
        let songRow = Array.from(rows).find(row => 
            row.innerText.toLowerCase().includes(song.title.split(' - ')[0].toLowerCase())
        );

        if (!songRow) throw new Error(`Song not found.`);
        songRow.scrollIntoView({ block: 'center' });
        
        // 3. Open More Menu
        const rowButtons = Array.from(songRow.querySelectorAll('button'));
        let targetMoreBtn = null;
        for (let btn of rowButtons) {
            const isMore = btn.classList.contains('contextual-menu__trigger') || 
                           btn.querySelector('[data-testid="more-button"]') ||
                           btn.getAttribute('aria-label')?.toLowerCase().includes('meer') ||
                           btn.getAttribute('aria-label')?.toLowerCase().includes('more');
            if (isMore) {
                targetMoreBtn = btn;
                targetMoreBtn.focus();
                await commitSelection(targetMoreBtn);
                break;
            }
        }
        if (!targetMoreBtn) throw new Error("More button not found.");
        await sleep(1500); // Crucial wait for the context menu to render in the DOM

        // 4. Keyboard Navigation (Tabbing down like a human)
        console.log("Robot: Tabbing down to find Favorite...");
        let foundBtn = false;
        let isAlreadyAdded = false;

        for (let i = 0; i < 20; i++) {
            // Get the currently highlighted item
            const focused = document.activeElement;
            const txt = (focused.innerText + " " + (focused.getAttribute('title') || "") + " " + (focused.getAttribute('aria-label') || "")).toLowerCase();
            
            console.log(`Robot: Currently focused on: "${txt}"`);

            // Match Favorite/Favoriet
            if (txt.includes('favorite') || txt.includes('favoriet')) {
                
                // If the button says "Undo" or "Ongedaan", it's already favorited!
                if (txt.includes('undo') || txt.includes('ongedaan') || txt.includes('unfavorite')) {
                    isAlreadyAdded = true;
                }

                if (isAlreadyAdded) {
                    console.log("Robot: Song is already in Apple Favorites. Skipping and marking as success!");
                    // Sending "Success" makes the dashboard save it to the DB so we don't scan it again later
                    sendResponse({ status: "Success" });
                    return;
                }

                console.log("Robot: Favorite Match found! Committing...");
                highlightElement(focused, "#1db954");
                await sleep(400);
                
                // Hit Enter on the focused element
                await commitSelection(focused);
                foundBtn = true;
                break;
            }

            // Move down to the next item in the menu
            sendKey(focused, 'ArrowDown');
            await sleep(400);
        }

        if (!foundBtn) throw new Error("'Favorite' option not found in menu.");

        console.log("Robot: Successfully added to Apple Favorites.");
        sendResponse({ status: "Success" });

    } catch (err) {
        if (err.message === "CANCELLED_BY_USER") {
            sendResponse({ status: "Cancelled", message: "User cancelled from popup" });
        } else {
            sendResponse({ status: "Error", message: err.toString() });
        }
    }
}

// ==========================================
// NEW: SPOTIFY LIKED SONGS INJECTION
// ==========================================
async function executeSpotifyLikedInjection(song, sendResponse) {
    try {
        const searchQuery = getCleanSearchQuery(song);
        const baseCleanTitle = song.title.split(' - ')[0].split(' (')[0].split(' [')[0].replace(/remaster(ed)?/gi, '').trim().toLowerCase();

        console.log(`Robot: Starting Spotify Liked Songs injection for ${searchQuery}`);
        document.body.click(); 
        await sleep(1000);

        // 1. Search Logic
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

        // 2. Click Songs Filter
        let filterClicked = false;
        for (let i = 0; i < 10; i++) {
            const possibleChips = document.querySelectorAll('button span[class*="chip"], button');
            const targetChip = Array.from(possibleChips).find(el => {
                const txt = el.innerText?.trim().toLowerCase() || "";
                return txt === "nummers" || txt === "songs" || txt === "tracks";
            });
            if (targetChip) {
                const clickable = targetChip.closest('button') || targetChip;
                clickable.click();
                filterClicked = true;
                break;
            }
            await sleep(400);
        }
        if (filterClicked) await sleep(2000);

        // 3. Find Row
        let targetRow = null;
        for (let i = 0; i < 15; i++) {
            const rows = document.querySelectorAll('main [data-testid="tracklist-row"], [role="row"]');
            const visibleRows = Array.from(rows).filter(row => row.getBoundingClientRect().left > 250);
            
            if (visibleRows.length > 0) {
                targetRow = visibleRows.find(row => row.innerText.toLowerCase().includes(song.title.split(' - ')[0].toLowerCase())) 
                         || visibleRows.find(row => row.innerText.toLowerCase().includes(baseCleanTitle))
                         || visibleRows[0];
            }
            if (targetRow) break;
            await sleep(400);
        }
        if (!targetRow) throw new Error(`Song result not found.`);

        targetRow.scrollIntoView({ block: 'center' });
        await sleep(600);

        // 4. Open Context Menu
        const moreBtn = targetRow.querySelector('button[data-testid="more-button"], [aria-haspopup="menu"]');
        if (moreBtn) moreBtn.click();
        else targetRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
        await sleep(1500); 

        // 5. Look for Liked Songs / Nummers leuk
        console.log("Robot: Looking for Liked Songs button...");
        let addBtn = null;
        let isAlreadyAdded = false;

        for (let i = 0; i < 10; i++) {
            const items = document.querySelectorAll('[role="menuitem"], li, button, span');
            for (let el of items) {
                const t = el.innerText.toLowerCase();
                
                // Match Liked/Gelikete/Leuk
                if (t.includes('liked') || t.includes('gelikete') || (t.includes('nummers') && t.includes('leuk'))) {
                    
                    // If the button says "Remove" or "Verwijder", it's already added!
                    if (t.includes('remove') || t.includes('verwijder') || t.includes('delete')) {
                        isAlreadyAdded = true;
                    }
                    addBtn = el;
                    break;
                }
            }
            if (addBtn) break;
            await sleep(400);
        }

     if (isAlreadyAdded) {
            console.log("Robot: Song is already in Spotify Liked Songs. Skipping and marking as success!");
            sendResponse({ status: "Success" });
            return;
        }

        if (!addBtn) throw new Error("'Save to Liked Songs' not found.");

        // FIX: The menu item is an <li>, but Spotify requires the <button> inside it to be clicked
        let targetButton = addBtn;
        if (addBtn.tagName !== 'BUTTON') {
            const btnInside = addBtn.querySelector('button');
            if (btnInside) targetButton = btnInside;
        }

        targetButton.focus();
        highlightElement(targetButton, "#1db954");
        await sleep(800);
        
        // Force native click AND commit selection on the exact button element
        targetButton.click();
        await commitSelection(targetButton);
        
        console.log("Robot: Successfully added to Spotify Liked Songs.");
        sendResponse({ status: "Success" });

    } catch (err) {
        if (err.message === "CANCELLED_BY_USER") {
            sendResponse({ status: "Cancelled", message: "User cancelled from popup" });
        } else {
            sendResponse({ status: "Error", message: err.toString() });
        }
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
        globalCancelFlag = false; // Reset flag
        renderProgressUI(request.song, request.progress); // Draw UI

        if (window.location.href.includes('spotify.com')) {
            // Check for special Liked Songs target
            if (request.targetName === 'LIKED_SPOTIFY') {
                executeSpotifyLikedInjection(request.song, sendResponse);
            } else {
                executeSpotifyInjection(request.song, request.targetName, sendResponse);
            }
        } else if (window.location.href.includes('apple.com')) {
            // Check for special Library target
            if (request.targetName === 'LIBRARY_APPLE') {
                executeAppleLibraryInjection(request.song, sendResponse);
            } else {
                executeAppleInjection(request.song, request.targetName, sendResponse);
            }
        }
        return true; 
    }
    if (request.action === "REMOVE_UI") {
        removeProgressUI();
        removeScanProgressUI();
        sendResponse({ status: "Success" });
        return true;
    }
    if (request.action === "ABORT_CURRENT_ACTION") {
        globalCancelFlag = true;
        sendResponse({ status: "Success" });
        return true;
    }
});