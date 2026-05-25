import { useState, useEffect, useRef  } from 'react';
import { createClient } from '@supabase/supabase-js';

// 1. Initialize Supabase
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const EXTENSION_ID = "clammlphhicbgjpmjbgiedegkepkabcp";

function App() {
  // --- AUTH & NAVIGATION STATE ---
  const [session, setSession] = useState(null);
  const [view, setView] = useState("dashboard"); // "dashboard" or "history"
  const [history, setHistory] = useState([]);

  // --- CORE APP STATE ---
  const [serverStatus, setServerStatus] = useState("Checking...");
  const [applePlaylists, setApplePlaylists] = useState(null);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [transferMode, setTransferMode] = useState("transfer_fill");
  const [totalSynced, setTotalSynced] = useState(0);

  const [appleSearch, setAppleSearch] = useState("");
  const [spotifySearch, setSpotifySearch] = useState("");

  const [platformData, setPlatformData] = useState({ apple: null, spotify: null });
  const [songCache, setSongCache] = useState({ apple: {}, spotify: {} });

  const [scannedPlaylists, setScannedPlaylists] = useState({ apple: [], spotify: [] });
    const [tooltipData, setTooltipData] = useState(null);
  const [selectedApple, setSelectedApple] = useState(null);
  const [selectedSpotify, setSelectedSpotify] = useState(null);
  const [targetService, setTargetService] = useState(null);

  const [isTransferring, setIsTransferring] = useState(false);
  const [transferStatus, setTransferStatus] = useState("");  

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ songs: 0, playlists: 0 });
  const [scanPlatformName, setScanPlatformName] = useState("");

  const [failedSongs, setFailedSongs] = useState([]); // Tracks songs the robot couldn't find
  const [showResultsModal, setShowResultsModal] = useState(false); // Controls the final report view

  const cancelTransferRef = useRef(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  // --- 2. AUTHENTICATED FETCH HELPER ---
  // This automatically attaches the user's JWT token to every request
  const authFetch = async (url, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json'
    };
    return fetch(url, { ...options, headers });
  };
  
  const handleAuth = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    let result;
    
    if (isSignUp) {
      result = await supabase.auth.signUp({ email, password });
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }

    if (result.error) {
      setErrorMsg(result.error.message);
    }
  };


  // --- 3. DATA FETCHING ---
  const fetchStats = async () => {
    try {
      const res = await authFetch('https://musiccave-server.onrender.com/api/stats');
      if (res.ok) {
        const data = await res.json();
        setTotalSynced(data.totalSongs || 0);
      }
    } catch (e) { console.error("Stats fetch failed", e); }
  };

  const fetchHistory = async () => {
    try {
      const res = await authFetch('https://musiccave-server.onrender.com/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) { console.error("History fetch failed", e); }
  };

  const fetchScannedPlaylists = async () => {
    try {
      const res = await authFetch('https://musiccave-server.onrender.com/api/scanned-playlists');
      if (res.ok) {
        setScannedPlaylists(await res.json());
      }
    } catch (e) { console.error("Failed to fetch scanned playlists", e); }
  };

// --- 1. SETUP AUTH LISTENER (Run ONCE on mount) ---
useEffect(() => {
  // Check session immediately
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
  });

  // Listen for changes (Login/Logout)
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
  });

  // Check server health once
  const checkServer = async () => {
    try {
      const response = await fetch('https://musiccave-server.onrender.com/');
      if (response.ok) setServerStatus("Connected 🟢");
    } catch (error) {
      setServerStatus("Disconnected 🔴");
    }
  };
  checkServer();

  return () => subscription.unsubscribe();
}, []); // <--- EMPTY ARRAY: This ensures the loop stops!


// --- 2. FETCH DATA WHEN LOGGED IN (Run when session changes) ---
useEffect(() => {
  if (session) {
    fetchStats();
    fetchScannedPlaylists();
    if (view === "history") {
      fetchHistory();
    }
  }
}, [session, view]); // Only runs when user logs in or changes views

// --- HELPER: RETURN TO DASHBOARD ---
  // Tells the extension to switch focus back to this tab
  const returnToDashboard = () => {
    window.chrome.runtime.sendMessage(EXTENSION_ID, { 
      action: "RETURN_TO_DASHBOARD",
      dashboardUrl: window.location.href // Send the current URL so the extension can find us
    });
  };

  // --- 4. ROBOT / SCAN LOGIC ---
  const scanPlatform = (platform) => {
    setErrorMsg("");
    setTransferStatus(`Switching to ${platform} to scan...`);
    setIsTransferring(true); // Optional: turns the text green so the user knows it's doing something
    
    window.chrome.runtime.sendMessage(
      EXTENSION_ID,
      { action: "SCAN_SPECIFIC_PLATFORM", platform: platform },
      async (response) => {
        setIsTransferring(false); // Turn off the text when finished

        if (response && response.tabsData?.[0]) {
          const data = response.tabsData[0];
          const detectedName = data.detectedPlaylistName || "Scanned Playlist";

          setPlatformData(prev => ({ ...prev, [platform]: data }));
          if (platform === 'apple') { setApplePlaylists(data.playlists); setSelectedApple({ name: detectedName }); }
          if (platform === 'spotify') { setSpotifyPlaylists(data.playlists); setSelectedSpotify({ name: detectedName }); }

          setSongCache(prev => ({
            ...prev,
            [platform]: {
              ...prev[platform],
              [detectedName]: data.songs
            }
          }));

           setScannedPlaylists(prev => ({
            ...prev,
            [platform]: [...(prev[platform] || []), detectedName.toLowerCase()]
          }));

          try {
            await authFetch('https://musiccave-server.onrender.com/api/sync', {
              method: 'POST',
              body: JSON.stringify({ 
                platform, 
                songs: data.songs, 
                playlistName: detectedName,
                overwrite: true 
              })
            });
            fetchStats();
            returnToDashboard();

          } catch (err) { console.error("Sync Error:", err); }
        } else {
          setErrorMsg(`Could not find an active ${platform} tab.`);
        }
      }
    );
  };

  const handleCancelTransfer = () => {
    cancelTransferRef.current = true;
    setTransferStatus("Stopping after current song...");
  };

  // --- 5. TRANSFER LOGIC ---
    const startTransfer = async () => {
   // 1. Basic Validations
    if (!targetService) { setErrorMsg("Please select a Target Service."); return; }
    
    const sourcePlatform = targetService === 'spotify' ? 'apple' : 'spotify';
    
    const destinationSelection = targetService === 'spotify' ? selectedSpotify : selectedApple;
    const sourceSelection = targetService === 'spotify' ? selectedApple : selectedSpotify;
    
    if (!destinationSelection || !destinationSelection.name) {
        setErrorMsg(`Please select or scan the target ${targetService} playlist first.`);
        return;
    }
    if (!sourceSelection || !sourceSelection.name) {
        setErrorMsg(`Please select a source ${sourcePlatform} playlist from the list.`);
        return;
    }

    const targetNameString = destinationSelection.name; // Sends "LIBRARY_APPLE" or "LIKED_SPOTIFY" to the robot
    const displayTargetName = destinationSelection.displayName || destinationSelection.name; // Shows "Favorite Songs" to user
    const sourceNameString = sourceSelection.name;

    // 2. Prepare for Transfer
    setIsTransferring(true);
    cancelTransferRef.current = false;
    setFailedSongs([]); 
    let successfulCount = 0;

    try {
        setTransferStatus(`Fetching "${sourceNameString}"...`);

        // NEW: Get the source songs from the DB (so previous sessions work)
        const sourceDbRes = await authFetch(`https://musiccave-server.onrender.com/api/songs/${sourcePlatform}?playlistName=${encodeURIComponent(sourceNameString)}`);
        let sourceSongsToTransfer = await sourceDbRes.json();

        // If DB doesn't have it, check our live memory cache
        if (!sourceSongsToTransfer || sourceSongsToTransfer.length === 0) {
            sourceSongsToTransfer = songCache[sourcePlatform][sourceNameString];
        }

        // If we STILL don't have songs, tell the user to physically scan it
        if (!sourceSongsToTransfer || sourceSongsToTransfer.length === 0) {
            setErrorMsg(`We don't have the songs for "${sourceNameString}". Please open it in ${sourcePlatform} and click Scan.`);
            setIsTransferring(false);
            return;
        }

        setTransferStatus(`Checking ${displayTargetName} for duplicates...`);

        // 3. Duplicate Prevention (Fetch existing songs in target from DB)
        const dbRes = await authFetch(`https://musiccave-server.onrender.com/api/songs/${targetService}?playlistName=${encodeURIComponent(targetNameString)}`);
        const dbTargetSongs = await dbRes.json() || [];
        
        // NEW: Pull from live cache as a fallback in case the database hasn't synced yet
        const cachedTargetSongs = songCache[targetService]?.[targetNameString] || [];
        const existingInTarget = [...dbTargetSongs, ...cachedTargetSongs];

        // 4. Filter songs using our new Fuzzy Matcher
        const filteredSongs = sourceSongsToTransfer.filter(sourceSong => {
            const isAlreadyThere = existingInTarget.some(dbSong => {
                return isDuplicateSong(sourceSong, dbSong);
            });
            return !isAlreadyThere;
        });

        if (filteredSongs.length === 0) {
            setTransferStatus(`✅ "${displayTargetName}" is already up to date!`);
            setIsTransferring(false);
            return;
        }


        // 5. Start the Robot Loop
        setTransferStatus(`Moving ${filteredSongs.length} new songs to "${displayTargetName}"...`);
        const action = targetService === 'spotify' ? "TRANSFER_SONG_TO_SPOTIFY" : "TRANSFER_SONG_TO_APPLE";

        for (let i = 0; i < filteredSongs.length; i++) {
            
            // CHECK FOR CANCEL BEFORE STARTING NEXT SONG
            if (cancelTransferRef.current) {
                console.log("Transfer cancelled by user.");
                break; // This safely exits the loop!
            }
            
            const song = filteredSongs[i];
            setTransferStatus(`Moving (${i + 1}/${filteredSongs.length}): ${song.title}`);

            try {
                const robotRes = await new Promise((resolve, reject) => {
                    window.chrome.runtime.sendMessage(EXTENSION_ID, { 
                        action, 
                        song, 
                        targetName: targetNameString,
                        // Send the math so the popup knows where it is!
                        progress: { current: i + 1, total: filteredSongs.length }
                    }, (res) => {
                        if (window.chrome.runtime.lastError) reject(window.chrome.runtime.lastError);
                        else resolve(res);
                    });
                });

                // Handle instant cancel from the popup
                if (robotRes?.status === "Cancelled") {
                    cancelTransferRef.current = true;
                    setFailedSongs(prev => [...prev, { ...song, reason: "Cancelled by User" }]);
                    break; // Abort loop instantly
                }
                else if (robotRes?.status === "Success") {
                    await authFetch('https://musiccave-server.onrender.com/api/sync', {
                        method: 'POST',
                        body: JSON.stringify({ platform: targetService, songs: [song], playlistName: targetNameString, overwrite: false })
                    });
                    successfulCount++; 
                    fetchStats();
                } else {
                    console.warn(`Robot failed on: ${song.title}`, robotRes?.message);
                    setFailedSongs(prev => [...prev, { ...song, reason: robotRes?.message || "Not found" }]);
                }
            } catch (err) {
                setFailedSongs(prev => [...prev, { ...song, reason: "Robot Interrupted" }]);
            }

            // Wait 2.5 seconds to avoid anti-bot detection
            await new Promise(r => setTimeout(r, 2500));
        }

        // Tell the extension to delete the UI off Spotify's screen
        window.chrome.runtime.sendMessage(EXTENSION_ID, { action: "CLEANUP_UI" });

        if (cancelTransferRef.current) {
            setTransferStatus("🚫 Transfer Cancelled!");
        } else {
            setTransferStatus("✅ Transfer Sequence Finished!");
        }
        
        // Return to dashboard function
        returnToDashboard();
        
        // Show report if we had issues or moved songs
        if (successfulCount > 0 || failedSongs.length > 0) {
            setShowResultsModal(true);
        }

    } catch (err) {
        console.error("Critical Transfer Error:", err);
        setErrorMsg("Transfer process crashed.");
    } finally {
        // 6. Final Housekeeping
        if (successfulCount > 0) {
            await authFetch('https://musiccave-server.onrender.com/api/history', {
                method: 'POST',
                body: JSON.stringify({
                    source_platform: sourcePlatform,
                    target_platform: targetService,
                    playlist_name: targetNameString,
                    song_count: successfulCount
                })
            });
            fetchHistory();
        }
        setIsTransferring(false);
    }
  };

const downloadMissingSongs = () => {
    const header = `MusicCave - Missing Songs Report\nGenerated: ${new Date().toLocaleString()}\nTarget Playlist: ${targetService === 'spotify' ? selectedSpotify?.name : selectedApple?.name}\n---------------------------\n\n`;
    const body = failedSongs.map(s => `❌ ${s.title.toUpperCase()} - ${s.artist} (Reason: ${s.reason})`).join('\n');
    
    const blob = new Blob([header + body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'missing_songs_report.txt';
    link.click();
    URL.revokeObjectURL(url);
};

// --- FUZZY DUPLICATE CHECKER ---
  const isDuplicateSong = (source, target) => {
    const sTitle = source.title.toLowerCase();
    const tTitle = target.title.toLowerCase();
    const sArtist = source.artist.toLowerCase();
    const tArtist = target.artist.toLowerCase();

    if (sTitle === tTitle && sArtist === tArtist) return true;

    const cleanTitle = (t) => {
        return t.split('(')[0].split('[')[0].split('-')[0].split('–')[0].replace(/重制版/gi, '').trim();
    };

    // FIX: Strictly isolate the very first artist to guarantee matches across platforms
    const cleanArtist = (a) => {
        return a
            .split(',')[0]           // Take ONLY the very first artist before a comma
            .split('&')[0]           // Or before an ampersand
            .split(/feat\.?/i)[0]    // Or before featuring
            .split(/ft\.?/i)[0]
            .replace(/\s+/g, ' ')    // Fix accidental double spaces
            .trim();
    };

    const sTitleClean = cleanTitle(sTitle);
    const tTitleClean = cleanTitle(tTitle);
    const sArtistClean = cleanArtist(sArtist);
    const tArtistClean = cleanArtist(tArtist);

    if (sTitleClean === tTitleClean) {
        if (sArtistClean === tArtistClean) return true;
        if (sArtistClean.includes(tArtistClean) || tArtistClean.includes(sArtistClean)) return true;
        if (sArtistClean.split(' ')[0] === tArtistClean.split(' ')[0]) return true;
    }

    return false;
  };

 // --- STYLING & HELPERS ---
  const getPlaylistIcon = (n) => (n.toLowerCase().includes("liked") || n.toLowerCase().includes("favourite")) ? "❤️" : "";
  const searchInputStyle = { width: "100%", padding: "8px", marginBottom: "10px", borderRadius: "5px", border: "none", backgroundColor: "#eee", fontSize: "14px", boxSizing: "border-box" };
  const navBtnStyle = { background: "none", border: "none", color: "white", cursor: "pointer", fontWeight: "bold", fontSize: "14px" };

  const isPlaylistScanned = (platform, name) => {
    const lowerName = name.toLowerCase();
    const inDb = scannedPlaylists[platform]?.includes(lowerName);
    const inCache = !!songCache[platform]?.[name];
    return inDb || inCache;
  };

  // --- NEW: SORTED PLAYLISTS ARRAYS (SCANNED AT THE TOP & FILTERED) ---
  const sortedApplePlaylists = applePlaylists
    ?.filter(pl => {
      const lowerName = pl.name.toLowerCase();
      const searchMatch = lowerName.includes(appleSearch.toLowerCase());
      // Check if it's the default favorite/library list
      const isSystemList = lowerName.includes("favorite") || 
                           lowerName.includes("favoriete") || 
                           lowerName.includes("library") || 
                           lowerName.includes("bibliotheek") || 
                           lowerName === "library_apple";
                           
      return searchMatch && !isSystemList; // Keep it ONLY if it matches search AND is not a system list
    })
    ?.sort((a, b) => {
      const aScanned = isPlaylistScanned('apple', a.name);
      const bScanned = isPlaylistScanned('apple', b.name);
      return aScanned === bScanned ? 0 : aScanned ? -1 : 1;
    });

  const sortedSpotifyPlaylists = spotifyPlaylists
    ?.filter(pl => {
      const lowerName = pl.name.toLowerCase();
      const searchMatch = lowerName.includes(spotifySearch.toLowerCase());
      // Check if it's the default liked songs list
      const isSystemList = lowerName.includes("liked") || 
                           lowerName.includes("gelikete") || 
                           (lowerName.includes("nummers") && lowerName.includes("leuk")) || 
                           lowerName === "liked_spotify";
                           
      return searchMatch && !isSystemList; // Keep it ONLY if it matches search AND is not a system list
    })
    ?.sort((a, b) => {
      const aScanned = isPlaylistScanned('spotify', a.name);
      const bScanned = isPlaylistScanned('spotify', b.name);
      return aScanned === bScanned ? 0 : aScanned ? -1 : 1;
    });

if (!session) {
    return (
      <div style={{ backgroundColor: "#222", color: "#fff", height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        <img src="/Logo.png" alt="Logo" style={{ height: "60px", marginBottom: "20px" }} />
        <div style={{ backgroundColor: "#333", padding: "40px", borderRadius: "15px", width: "350px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
          <h2 style={{ textAlign: "center", marginBottom: "20px" }}>{isSignUp ? "Create Account" : "Welcome Back"}</h2>
          
          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            <input 
              type="email" placeholder="Email" value={email} 
              onChange={(e) => setEmail(e.target.value)} required
              style={{ padding: "12px", borderRadius: "5px", border: "none", outline: "none" }}
            />
            <input 
              type="password" placeholder="Password" value={password} 
              onChange={(e) => setPassword(e.target.value)} required
              style={{ padding: "12px", borderRadius: "5px", border: "none", outline: "none" }}
            />
            <button type="submit" style={{ padding: "12px", borderRadius: "5px", border: "none", backgroundColor: "#6a0dad", color: "#fff", fontWeight: "bold", cursor: "pointer" }}>
              {isSignUp ? "SIGN UP" : "LOG IN"}
            </button>
          </form>

          {errorMsg && <p style={{ color: "#ff4d4d", fontSize: "14px", marginTop: "15px", textAlign: "center" }}>{errorMsg}</p>}

          <p style={{ textAlign: "center", marginTop: "20px", fontSize: "14px", color: "#aaa" }}>
            {isSignUp ? "Already have an account?" : "New to MusicCave?"}{" "}
            <span 
              onClick={() => setIsSignUp(!isSignUp)} 
              style={{ color: "#0000FF", border: "black", cursor: "pointer", fontWeight: "bold" }}
            >
              {isSignUp ? "Log In" : "Sign Up Free"}
            </span>
          </p>
        </div>
      </div>
    );
  }

  // --- MAIN APP VIEW ---
  return (
    <div style={{ backgroundColor: "#222", color: "#fff", minHeight: "100vh", fontFamily: "sans-serif", paddingBottom: "50px" }}>
      
      {/* HEADER */}
      <div style={{ backgroundColor: "#6a0dad", padding: "15px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "20px", fontWeight: "bold" }}>
          <img src="/Logo.png" alt="MusicCave Logo" style={{ height: "35px" }} />
          MusicCave Dashboard
        </div>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          <button onClick={() => setView("dashboard")} style={navBtnStyle}>Dashboard</button>
          <button onClick={() => setView("history")} style={navBtnStyle}>History</button>
          <div style={{ backgroundColor: "rgba(255,255,255,0.1)", padding: "5px 15px", borderRadius: "20px", fontSize: "12px", border: "1px solid rgba(255,255,255,0.3)" }}>
            <span style={{ color: "#1db954", fontWeight: "bold" }}>●</span> {totalSynced} Songs Synced
          </div>
          <div style={{ fontSize: "14px", fontWeight: "bold" }}>Server: {serverStatus}</div>
          <button onClick={() => supabase.auth.signOut()} style={{...navBtnStyle, opacity: 0.7}}>Logout</button>
        </div>
      </div>

      {view === "dashboard" ? (
        <>
          <div style={{ textAlign: "center", marginTop: "40px" }}>
            <h1 style={{ fontSize: "42px", margin: "0 0 10px 0" }}>Dashboard</h1>
            <h2 style={{ fontSize: "24px", fontWeight: "normal", marginTop: "0", color: "#ccc" }}>My Music Services</h2>

            {isTransferring && <div style={{ color: "#1db954", fontSize: "20px", fontWeight: "bold", margin: "10px 0" }}>{transferStatus}</div>}

            <div style={{ display: "flex", justifyContent: "center", gap: "50px", marginTop: "30px" }}>
              <img src="/Applemusic_logo.png" alt="Apple Music" style={{ width: "120px", height: "120px", objectFit: "cover", borderRadius: "25px", border: targetService === 'apple' ? "4px solid #fa243c" : "none" }} />
              <img src="/Spotify_logo.png" alt="Spotify" style={{ width: "120px", height: "120px", objectFit: "cover", borderRadius: "60px", border: targetService === 'spotify' ? "4px solid #1db954" : "none" }} />
            </div>

            <h3 style={{ fontSize: "28px", marginTop: "50px", fontWeight: "normal" }}>Select playlists to transfer</h3>
            {errorMsg && <p style={{ color: "#ff4d4d", fontSize: "18px" }}>⚠️ {errorMsg}</p>}

            <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", gap: "20px", marginTop: "30px", flexWrap: "wrap" }}>
              
{/* Apple Column */}
              <div style={{ backgroundColor: "#999", borderRadius: "10px", padding: "20px", width: "250px", minHeight: "300px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  {!applePlaylists ? (
                    /* 0. PRE-SCAN PLACEHOLDER */
                    <div style={{ backgroundColor: "#222", padding: "20px", borderRadius: "8px", textAlign: "center", color: "#ccc", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "220px", border: "2px solid #6a0dad" }}>
                      <p style={{ fontSize: "14px", lineHeight: "1.6", margin: "0 0 15px 0", fontWeight: "bold" }}>
                        MusicCave needs to scan your playlists before you can start transferring.
                      </p>
                      <strong 
                        onClick={() => scanPlatform('apple')} 
                        style={{ color: "#6a0dad", fontSize: "18px", cursor: "pointer", textDecoration: "underline" }}
                      >
                        Scan now!
                      </strong>
                    </div>
                  ) : (
                    <>
                      {/* 1. SEARCH BAR AT THE VERY TOP */}
                      <input type="text" placeholder="Search Apple..." value={appleSearch} onChange={(e) => setAppleSearch(e.target.value)} style={searchInputStyle} />
                      
                      {/* 2. DEDICATED FAVORITE SONGS BOX WITH HOVER BUBBLE */}
                      <div 
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltipData({
                            scanned: isPlaylistScanned('apple', 'LIBRARY_APPLE'),
                            x: rect.left,
                            y: rect.top + (rect.height / 2)
                          });
                        }}
                        onMouseLeave={() => setTooltipData(null)}
                        onClick={() => setSelectedApple({ name: "LIBRARY_APPLE", displayName: "Favorite Songs" })}
                        style={{
                          backgroundColor: selectedApple?.name === "LIBRARY_APPLE" ? "#b31b2d" : "#fa243c",
                          padding: "15px", borderRadius: "8px", marginBottom: "15px", color: "#fff",
                          cursor: "pointer", border: selectedApple?.name === "LIBRARY_APPLE" ? "2px solid white" : "none",
                          fontWeight: "bold", display: "flex", justifyContent: "space-between", alignItems: "center"
                        }}
                      >
                        <span>❤️ Favorite Songs</span>
                        <span style={{ fontSize: "14px", textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000" }}>
                            {isPlaylistScanned('apple', 'LIBRARY_APPLE') ? "✅" : "❌"}
                        </span>
                      </div>

                      {/* 3. SCROLLABLE PLAYLIST LIST */}
                      <div style={{ maxHeight: "250px", overflowY: "auto" }} onScroll={() => setTooltipData(null)}>
                       {sortedApplePlaylists?.map((pl, idx) => {
                          const isScanned = isPlaylistScanned('apple', pl.name);
                          return (
                            <div 
                              key={idx} 
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setTooltipData({
                                  scanned: isScanned,
                                  x: rect.left,
                                  y: rect.top + (rect.height / 2)
                                });
                              }}
                              onMouseLeave={() => setTooltipData(null)}
                              onClick={() => setSelectedApple(pl)} 
                              style={{ 
                                backgroundColor: selectedApple?.name === pl.name ? "#b31b2d" : "#fa243c", 
                                padding: "10px", borderRadius: "5px", marginBottom: "10px", 
                                color: "#fff", cursor: "pointer", 
                                border: selectedApple?.name === pl.name ? "2px solid white" : "none",
                                display: "flex", 
                                justifyContent: "space-between", 
                                alignItems: "center"
                              }}
                            >
                              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                <span>{getPlaylistIcon(pl.name)}</span> {pl.name}
                              </div>
                              <span style={{ 
                                fontSize: "14px", 
                                marginLeft: "10px",
                                textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000"
                              }}>
                                {isScanned ? "✅" : "❌"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                <button onClick={() => scanPlatform('apple')} style={{ backgroundColor: "#6a0dad", color: "white", border: "none", padding: "10px", borderRadius: "5px", cursor: "pointer", marginTop: "20px", fontWeight: "bold" }}>Scan Apple Music</button>
              </div>

              {/* Mode Dropdown */}
              <div style={{ marginTop: "120px" }}>
                <select value={transferMode} onChange={(e) => setTransferMode(e.target.value)} style={{ backgroundColor: "#6a0dad", color: "white", border: "none", padding: "8px 15px", borderRadius: "5px", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}>
                  <option value="transfer_fill">transfer & fill ▼</option>
                </select>
              </div>

              {/* Spotify Column */}
              <div style={{ backgroundColor: "#999", borderRadius: "10px", padding: "20px", width: "250px", minHeight: "300px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  {!spotifyPlaylists ? (
                    /* 0. PRE-SCAN PLACEHOLDER */
                    <div style={{ backgroundColor: "#222", padding: "20px", borderRadius: "8px", textAlign: "center", color: "#ccc", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "220px", border: "2px solid #6a0dad" }}>
                      <p style={{ fontSize: "14px", lineHeight: "1.6", margin: "0 0 15px 0", fontWeight: "bold" }}>
                        MusicCave needs to scan your playlists before you can start transferring.
                      </p>
                      <strong 
                        onClick={() => scanPlatform('spotify')} 
                        style={{ color: "#6a0dad", fontSize: "18px", cursor: "pointer", textDecoration: "underline" }}
                      >
                        Scan now!
                      </strong>
                    </div>
                  ) : (
                    <>
                      {/* 1. SEARCH BAR AT THE VERY TOP */}
                      <input type="text" placeholder="Search Spotify..." value={spotifySearch} onChange={(e) => setSpotifySearch(e.target.value)} style={searchInputStyle} />
                      
                      {/* 2. DEDICATED LIKED SONGS BOX WITH HOVER BUBBLE */}
                      <div 
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltipData({
                            scanned: isPlaylistScanned('spotify', 'LIKED_SPOTIFY'),
                            x: rect.left,
                            y: rect.top + (rect.height / 2)
                          });
                        }}
                        onMouseLeave={() => setTooltipData(null)}
                        onClick={() => setSelectedSpotify({ name: "LIKED_SPOTIFY", displayName: "Liked Songs" })}
                        style={{
                          backgroundColor: selectedSpotify?.name === "LIKED_SPOTIFY" ? "#15833b" : "#1db954",
                          padding: "15px", borderRadius: "8px", marginBottom: "15px", color: "#000",
                          cursor: "pointer", border: selectedSpotify?.name === "LIKED_SPOTIFY" ? "2px solid black" : "none",
                          fontWeight: "bold", display: "flex", justifyContent: "space-between", alignItems: "center"
                        }}
                      >
                        <span>❤️ Liked Songs</span>
                        <span style={{ fontSize: "14px", textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000" }}>
                            {isPlaylistScanned('spotify', 'LIKED_SPOTIFY') ? "✅" : "❌"}
                        </span>
                      </div>

                      {/* 3. SCROLLABLE PLAYLIST LIST */}
                      <div style={{ maxHeight: "250px", overflowY: "auto" }} onScroll={() => setTooltipData(null)}>
                        {sortedSpotifyPlaylists?.map((pl, idx) => {
                          const isScanned = isPlaylistScanned('spotify', pl.name);
                          return (
                            <div 
                              key={idx} 
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setTooltipData({
                                  scanned: isScanned,
                                  x: rect.left,
                                  y: rect.top + (rect.height / 2)
                                });
                              }}
                              onMouseLeave={() => setTooltipData(null)}
                              onClick={() => setSelectedSpotify(pl)} 
                              style={{ 
                                backgroundColor: selectedSpotify?.name === pl.name ? "#15833b" : "#1db954", 
                                padding: "10px", borderRadius: "5px", marginBottom: "10px", 
                                color: "#000", fontWeight: "500", cursor: "pointer", 
                                border: selectedSpotify?.name === pl.name ? "2px solid black" : "none",
                                display: "flex", 
                                justifyContent: "space-between", 
                                alignItems: "center"
                              }}
                            >
                              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                <span>{getPlaylistIcon(pl.name)}</span> {pl.name}
                              </div>
                              <span style={{ 
                                fontSize: "14px", 
                                marginLeft: "10px",
                                textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000"
                              }}>
                                {isScanned ? "✅" : "❌"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                <button onClick={() => scanPlatform('spotify')} style={{ backgroundColor: "#6a0dad", color: "white", border: "none", padding: "10px", borderRadius: "5px", cursor: "pointer", marginTop: "20px", fontWeight: "bold" }}>Scan Spotify</button>
              </div>

             {/* Start & Cancel Buttons */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "100px" }}>
                {!isTransferring ? (
                  <button onClick={startTransfer} style={{ backgroundColor: "#1db954", color: "#000", border: "none", padding: "15px 30px", borderRadius: "50px", fontWeight: "bold", cursor: "pointer" }}>
                    START TRANSFER
                  </button>
                ) : (
                  <button onClick={handleCancelTransfer} style={{ backgroundColor: "#ff4d4d", color: "#fff", border: "none", padding: "15px 30px", borderRadius: "50px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 0 15px rgba(255, 77, 77, 0.6)" }}>
                    ⏹ CANCEL TRANSFER
                  </button>
                )}
              </div>

              {/* Target Service Toggle Boxes */}
              <div style={{ backgroundColor: "#999", borderRadius: "10px", padding: "20px", width: "180px", marginTop: "60px" }}>
                <div onClick={() => setTargetService('apple')} style={{ backgroundColor: "#fa243c", padding: "15px 10px", borderRadius: "5px", marginBottom: "10px", color: "#fff", fontWeight: "bold", cursor: "pointer", border: targetService === 'apple' ? "3px solid white" : "none" }}>New playlist AppleMusic</div>
                <div style={{ color: "#fff", marginBottom: "10px" }}>or</div>
                <div onClick={() => setTargetService('spotify')} style={{ backgroundColor: "#1db954", padding: "15px 10px", borderRadius: "5px", color: "#000", fontWeight: "bold", cursor: "pointer", border: targetService === 'spotify' ? "3px solid black" : "none" }}>New playlist Spotify</div>
              </div>
            </div>
          </div>

          {/* GLOBAL FIXED TOOLTIP RENDERER */}
          {tooltipData && (
            <img 
              src={tooltipData.scanned ? "/Textbubble_scanned.png" : "/Textbubble_notscanned.png"} 
              alt="Scan Status"
              style={{ 
                position: "fixed",           
                left: tooltipData.x - 175,   
                top: tooltipData.y,          
                transform: "translateY(-80%)", 
                width: "160px", 
                zIndex: 9999,                
                pointerEvents: "none"        
              }} 
            />
          )}

          {/* LIVE CONNECTION DATA */}
          <div style={{ marginTop: "100px", borderTop: "1px solid #444", paddingTop: "50px", textAlign: "center", backgroundColor: "#1a1a1a" }}>
            <h3 style={{ fontSize: "24px", color: "#ccc", margin: "0 0 10px 0" }}>Live Connection Data</h3>
            <div style={{ display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap", padding: "20px" }}>
              <div style={{ backgroundColor: "#333", padding: "20px", borderRadius: "8px", width: "450px", textAlign: "left", borderLeft: "5px solid #fa243c", opacity: platformData.apple ? 1 : 0.5 }}>
                <p style={{ fontSize: "18px", fontWeight: "bold" }}>🍎 Apple Music's Most Recent Data</p>
                {platformData.apple ? (
                  <>
                    <p style={{ color: "#fff", fontWeight: "bold" }}>Playlist: {platformData.apple.detectedPlaylistName || "Unknown"}</p>
                    <p style={{ color: "#bbb", fontSize: "14px" }}>Songs in memory: {platformData.apple.songs?.length || 0}</p>
                    <p style={{ color: "#bbb", fontSize: "14px" }}>Below are the most recent 5 songs scanned</p>
                    <div style={{ marginTop: "10px", backgroundColor: "#222", padding: "10px", borderRadius: "5px", maxHeight: "100px", overflowY: "auto" }}>
                      {platformData.apple.songs?.slice(-5).map((s, i) => (
                          <div key={i} style={{ fontSize: "12px", color: "#aaa" }}>{s.title} - {s.artist}</div>
                      ))}
                    </div>
                  </>
                ) : <p style={{ fontSize: "12px", color: "#666" }}>Not scanned yet.</p>}
              </div>

              <div style={{ backgroundColor: "#333", padding: "20px", borderRadius: "8px", width: "450px", textAlign: "left", borderLeft: "5px solid #1db954", opacity: platformData.spotify ? 1 : 0.5 }}>
                <p style={{ fontSize: "18px", fontWeight: "bold" }}>🟢 Spotify's Most Recent Data</p>
                {platformData.spotify ? (
                  <>
                    <p style={{ color: "#fff", fontWeight: "bold" }}>Playlist: {platformData.spotify.detectedPlaylistName || "Unknown"}</p>
                    <p style={{ color: "#bbb", fontSize: "14px" }}>Songs in memory: {platformData.spotify.songs?.length || 0}</p>
                    <p style={{ color: "#bbb", fontSize: "14px" }}>Below are the most recent 5 songs scanned</p>
                    <div style={{ marginTop: "10px", backgroundColor: "#222", padding: "10px", borderRadius: "5px", maxHeight: "100px", overflowY: "auto" }}>
                      {platformData.spotify.songs?.slice(-5).map((s, i) => (
                          <div key={i} style={{ fontSize: "12px", color: "#aaa" }}>{s.title} - {s.artist}</div>
                      ))}
                    </div>
                  </>
                ) : <p style={{ fontSize: "12px", color: "#666" }}>Not scanned yet.</p>}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* HISTORY VIEW */
        <div style={{ padding: "40px", maxWidth: "800px", margin: "0 auto" }}>
          <h1 style={{ fontSize: "32px", marginBottom: "30px", textAlign: "center" }}>Transfer History</h1>
          {history.length === 0 ? (
            <p style={{ color: "#aaa", textAlign: "center" }}>No transfers recorded yet.</p>
          ) : (
            <div style={{ backgroundColor: "#333", borderRadius: "10px", overflow: "hidden", border: "1px solid #444" }}>
              {history.map((h, i) => (
                <div key={i} style={{ padding: "20px", borderBottom: i === history.length - 1 ? "none" : "1px solid #444", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "18px", fontWeight: "bold" }}>{h.playlist_name}</div>
                    <div style={{ fontSize: "13px", color: "#aaa", marginTop: "4px" }}>
                      {h.source_platform.toUpperCase()} ➔ {h.target_platform.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#1db954", fontWeight: "bold", fontSize: "18px" }}>+{h.song_count} Songs</div>
                    <div style={{ fontSize: "12px", color: "#777" }}>{new Date(h.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* RESULTS MODAL */}
      {showResultsModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ backgroundColor: "#333", padding: "30px", borderRadius: "15px", width: "500px", maxHeight: "80vh", overflowY: "auto", border: "1px solid #444", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
            <h2 style={{ textAlign: "center", color: "#fff" }}>Transfer Report</h2>
            
            <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "20px" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "24px", color: "#1db954", fontWeight: "bold" }}>{totalSynced - (totalSynced - history[0]?.song_count || 0)}</div>
                <div style={{ fontSize: "12px", color: "#aaa" }}>ADDED</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "24px", color: "#ff4d4d", fontWeight: "bold" }}>{failedSongs.length}</div>
                <div style={{ fontSize: "12px", color: "#aaa" }}>MISSED</div>
              </div>
            </div>

            <h4 style={{ borderBottom: "1px solid #444", paddingBottom: "5px" }}>Missed Songs:</h4>
            {failedSongs.length === 0 ? (
              <p style={{ color: "#aaa", fontSize: "14px" }}>Perfect Transfer! All songs found.</p>
            ) : (
              <div style={{ backgroundColor: "#222", padding: "10px", borderRadius: "5px", marginBottom: "20px" }}>
                {failedSongs.map((s, idx) => (
                  <div key={idx} style={{ fontSize: "13px", marginBottom: "8px", borderBottom: "1px solid #333", paddingBottom: "4px" }}>
                    <div style={{ color: "#eee" }}>{s.title}</div>
                    <div style={{ color: "#777", fontSize: "11px" }}>{s.artist} • <span style={{ color: "#ff4d4d" }}>{s.reason}</span></div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", flexDirection: "column" }}>
              {failedSongs.length > 0 && (
                <button onClick={downloadMissingSongs} style={{ backgroundColor: "#fff", color: "#000", padding: "10px", border: "none", borderRadius: "5px", fontWeight: "bold", cursor: "pointer" }}>
                  ⚡️ Download Missed Songs (.txt)
                </button>
              )}
              <button onClick={() => setShowResultsModal(false)} style={{ backgroundColor: "#6a0dad", color: "#fff", padding: "10px", border: "none", borderRadius: "5px", fontWeight: "bold", cursor: "pointer" }}>
                Close Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;