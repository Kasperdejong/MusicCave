import { useState, useEffect, useRef  } from 'react';
import { createClient } from '@supabase/supabase-js';

// 1. Initialize Supabase
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const EXTENSION_ID = "eldnapkjmgljbmdgainoefmpompdjmdh";

const stringSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    str1 = str1.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    str2 = str2.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    
    if (str1 === str2) return 1;

    // FIX: If it's a super short string (like Chinese characters), do a direct includes check
    if (str1.length <= 2 || str2.length <= 2) {
        return (str1.includes(str2) || str2.includes(str1)) ? 0.9 : 0;
    }

    let bigrams1 = new Map();
    for (let i = 0; i < str1.length - 1; i++) {
        const bigram = str1.substring(i, i + 2);
        bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
    }
    let intersectionSize = 0;
    for (let i = 0; i < str2.length - 1; i++) {
        const bigram = str2.substring(i, i + 2);
        const count = bigrams1.get(bigram);
        if (count > 0) {
            bigrams1.set(bigram, count - 1);
            intersectionSize++;
        }
    }
    return (2.0 * intersectionSize) / (str1.length - 1 + str2.length - 1);
};

function App() {
  // --- AUTH & NAVIGATION STATE ---
  const [session, setSession] = useState(null);
  const [view, setView] = useState("dashboard"); // "dashboard" or "history"
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // --- CORE APP STATE ---
  const [serverStatus, setServerStatus] = useState("Checking...");
// Load saved playlists from browser memory on refresh
  const [applePlaylists, setApplePlaylists] = useState(() => {
    const saved = localStorage.getItem('musiccave_apple_playlists');
    return saved ? JSON.parse(saved) : null;
  });
  const [spotifyPlaylists, setSpotifyPlaylists] = useState(() => {
    const saved = localStorage.getItem('musiccave_spotify_playlists');
    return saved ? JSON.parse(saved) : null;
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
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
  const [lastTransferAdded, setLastTransferAdded] = useState(0); // NEW: Tracks successful songs for the current modal

  const cancelTransferRef = useRef(false);

  // --- IMPROVED AUTH STATES ---
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false); // Tracks background API operations

  // --- INTERACTIVE HOVER STATES ---
  const [isHoveredStart, setIsHoveredStart] = useState(false);

  // --- AUTHENTICATED FETCH HELPER ---
  const authFetch = async (url, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json'
    };
    return fetch(url, { ...options, headers });
  };

  // --- MAP SUPABASE ERRORS TO DESCRIPTIVE MESSAGES ---
  const getFriendlyErrorMessage = (error) => {
    if (!error) return "";
    const msg = error.message ? error.message.toLowerCase() : "";
    const code = error.code ? error.code.toLowerCase() : "";

    // Exact database or API constraints mapping
    if (code === 'email_exists' || msg.includes("already been registered") || msg.includes("email_exists")) {
      return "This email is already in use. Try logging in instead, or reset your password if you forgot it.";
    }
    if (code === 'invalid_credentials' || msg.includes("invalid login credentials")) {
      return "Incorrect email or password. Please double-check your credentials and try again.";
    }
    if (msg.includes("at least 6 characters") || msg.includes("password should be")) {
      return "Password is too short. It must be at least 6 characters long.";
    }
    if (msg.includes("unable to validate") || msg.includes("valid email") || msg.includes("invalid format")) {
      return "Please enter a valid email address structure (e.g., name@example.com).";
    }
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch")) {
      return "Network error! Please check your internet connection and try again.";
    }
    if (msg.includes("email not confirmed") || msg.includes("confirm your email")) {
      return "Your email address hasn't been verified yet. Please check your inbox for a confirmation link.";
    }
    if (msg.includes("too many requests") || code === 'over_request_rate_limit') {
      return "Too many attempts in a short period. Please wait a minute before trying again.";
    }

    // Return the actual message if none of our cases match, rather than swallowing it
    return error.message || "An unexpected authentication error occurred.";
  };
  
  const handleAuth = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    // Frontend Pre-Validation to avoid unnecessary network roundtrips
    if (!email.trim() || !email.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("Passwords must be at least 6 characters long.");
      return;
    }

    setIsAuthLoading(true);
    
    try {
      if (isSignUp) {
        const result = await supabase.auth.signUp({ email, password });
        
        if (result.error) {
          setErrorMsg(getFriendlyErrorMessage(result.error));
        } else if (result.data?.user && (!result.data.user.identities || result.data.user.identities.length === 0)) {
          // --- DUPLICATE CHECK TRIGGERED ---
          // Supabase returns an empty identities list when User Enumeration Protection is enabled
          setErrorMsg("This email address is already registered. Try logging in instead or request a password reset.");
        } else {
          setSuccessMsg("Account created! Please check your email inbox (and spam folder) for a confirmation link.");
          setIsSignUp(false);
          setPassword(""); // Clear password field for safety
        }
      } else {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) {
          setErrorMsg(getFriendlyErrorMessage(result.error));
        } else {
          setSuccessMsg("Logged in successfully! Loading dashboard...");
        }
      }
    } catch (err) {
      console.error("Authentication crash log:", err);
      setErrorMsg("An unexpected failure occurred. Check console logs or try again.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    if (!email.trim()) {
      setErrorMsg("Please enter your email address first so we know where to send the link.");
      return;
    }
    if (!email.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    setIsAuthLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) {
        setErrorMsg(getFriendlyErrorMessage(error));
      } else {
        setSuccessMsg("A password reset link has been sent to your email inbox!");
      }
    } catch (err) {
      console.error("Forgot password crash log:", err);
      setErrorMsg("Unable to request password reset. Try again shortly.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // --- DATA FETCHING ---
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
    setIsLoadingHistory(true);
    try {
      const res = await authFetch('https://musiccave-server.onrender.com/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) { 
      console.error("History fetch failed", e); 
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchScannedPlaylists = async () => {
    try {
      const res = await authFetch('https://musiccave-server.onrender.com/api/scanned-playlists');
      if (res.ok) {
        setScannedPlaylists(await res.json());
      }
    } catch (e) { console.error("Failed to fetch scanned playlists", e); }
  };

  // --- SETUP AUTH LISTENER ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

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
  }, []); 


  // --- FETCH DATA WHEN LOGGED IN ---
  useEffect(() => {
    if (session) {
      fetchStats();
      fetchScannedPlaylists();
      if (view === "history") {
        fetchHistory();
      }
    }
  }, [session, view]); 

  // --- HELPER: RETURN TO DASHBOARD ---
  const returnToDashboard = () => {
    window.chrome.runtime.sendMessage(EXTENSION_ID, { 
      action: "RETURN_TO_DASHBOARD",
      dashboardUrl: window.location.href 
    });
  };

  // --- ROBOT / SCAN LOGIC ---
  const scanPlatform = (platform) => {
    setErrorMsg("");
    setTransferStatus(`Switching to ${platform} to scan...`);
    setIsTransferring(true); 
    
    window.chrome.runtime.sendMessage(
      EXTENSION_ID,
      { action: "SCAN_SPECIFIC_PLATFORM", platform: platform },
      async (response) => {
        setIsTransferring(false); 

        if (response && response.tabsData?.[0]) {
          const data = response.tabsData[0];
          const detectedName = data.detectedPlaylistName || "Scanned Playlist";

          // NEW: Stop processing if the user cancelled the scan
          if (detectedName === "Scan Cancelled") {
            setTransferStatus("");
            setErrorMsg("Scan aborted by user.");
            returnToDashboard();
            return;
          }

        setPlatformData(prev => ({ ...prev, [platform]: data }));
          if (platform === 'apple') { 
              setApplePlaylists(data.playlists); 
              localStorage.setItem('musiccave_apple_playlists', JSON.stringify(data.playlists));
              setSelectedApple({ name: detectedName }); 
          }
          if (platform === 'spotify') { 
              setSpotifyPlaylists(data.playlists); 
              localStorage.setItem('musiccave_spotify_playlists', JSON.stringify(data.playlists));
              setSelectedSpotify({ name: detectedName }); 
          }
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
    setTransferStatus("Leaving the cave...");
    // NEW: Fire an instant kill signal to the robot
    window.chrome.runtime.sendMessage(EXTENSION_ID, { action: "ABORT_TRANSFER" });
  };

  // --- TRANSFER LOGIC ---
  const startTransfer = async () => {
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

    const targetNameString = destinationSelection.name; 
    const displayTargetName = destinationSelection.displayName || destinationSelection.name; 
    const sourceNameString = sourceSelection.name;

    setIsTransferring(true);
    cancelTransferRef.current = false;
    setFailedSongs([]); 
    let successfulCount = 0;

    try {
        setTransferStatus(`Fetching "${sourceNameString}"...`);

        const sourceDbRes = await authFetch(`https://musiccave-server.onrender.com/api/songs/${sourcePlatform}?playlistName=${encodeURIComponent(sourceNameString)}`);
        let sourceSongsToTransfer = await sourceDbRes.json();

        if (!sourceSongsToTransfer || sourceSongsToTransfer.length === 0) {
            sourceSongsToTransfer = songCache[sourcePlatform][sourceNameString];
        }

        if (!sourceSongsToTransfer || sourceSongsToTransfer.length === 0) {
            setErrorMsg(`We don't have the songs for "${sourceNameString}". Please open it in ${sourcePlatform} and click Scan.`);
            setIsTransferring(false);
            return;
        }

        setTransferStatus(`Checking ${displayTargetName} for duplicates...`);

        const dbRes = await authFetch(`https://musiccave-server.onrender.com/api/songs/${targetService}?playlistName=${encodeURIComponent(targetNameString)}`);
        const dbTargetSongs = await dbRes.json() || [];
        
        const cachedTargetSongs = songCache[targetService]?.[targetNameString] || [];
        const existingInTarget = [...dbTargetSongs, ...cachedTargetSongs];

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

        setTransferStatus(`Moving ${filteredSongs.length} new songs to "${displayTargetName}"...`);
        const action = targetService === 'spotify' ? "TRANSFER_SONG_TO_SPOTIFY" : "TRANSFER_SONG_TO_APPLE";

        for (let i = 0; i < filteredSongs.length; i++) {
            if (cancelTransferRef.current) {
                console.log("Transfer cancelled by user.");
                break; 
            }
            
            const song = filteredSongs[i];
            setTransferStatus(`Moving (${i + 1}/${filteredSongs.length}): ${song.title}`);

            try {
                const robotRes = await new Promise((resolve, reject) => {
                    window.chrome.runtime.sendMessage(EXTENSION_ID, { 
                        action, 
                        song, 
                        targetName: targetNameString,
                        progress: { current: i + 1, total: filteredSongs.length }
                    }, (res) => {
                        if (window.chrome.runtime.lastError) reject(window.chrome.runtime.lastError);
                        else resolve(res);
                    });
                });

                if (robotRes?.status === "Cancelled") {
                    cancelTransferRef.current = true;
                    setFailedSongs(prev => [...prev, { ...song, reason: "Cancelled by User" }]);
                    break; 
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

            await new Promise(r => setTimeout(r, 2500));
        }

        window.chrome.runtime.sendMessage(EXTENSION_ID, { action: "CLEANUP_UI" });

        if (cancelTransferRef.current) {
            setTransferStatus("🚫 Transfer Cancelled!");
        } else {
            setTransferStatus("✅ Transfer Sequence Finished!");
        }
        
        returnToDashboard();

        setLastTransferAdded(successfulCount);
        
        if (successfulCount > 0 || failedSongs.length > 0 || cancelTransferRef.current) {
            setShowResultsModal(true);
        }

    } catch (err) {
        console.error("Critical Transfer Error:", err);
        setErrorMsg("Transfer process crashed.");
    } finally {
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
            fetchScannedPlaylists(); 
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
    const cleanTitle = (t) => t.toLowerCase().split('(')[0].split('[')[0].split('-')[0].split('–')[0].replace(/remaster(ed)?/gi, '').trim();
    const cleanArtist = (a) => a.toLowerCase().split(',')[0].split('&')[0].split(/feat\.?/i)[0].split(/ft\.?/i)[0].trim();

    const sTitle = cleanTitle(source.title);
    const tTitle = cleanTitle(target.title);
    const sArtist = cleanArtist(source.artist);
    const tArtist = cleanArtist(target.artist);

    // 1. Exact match on cleaned strings
    if (sTitle === tTitle && sArtist === tArtist) return true;

    // 2. CROSS-LANGUAGE BYPASS (Fixes Apple/Spotify Artist Translation issues)
    if (sTitle === tTitle) {
        // If the title contains Chinese, Japanese, or Korean characters, trust the exact title match!
        if (/[\u3400-\u9FBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(sTitle)) {
            return true;
        }
    }

    // 3. Fuzzy Match
    const titleScore = stringSimilarity(sTitle, tTitle);
    const artistScore = stringSimilarity(sArtist, tArtist);
    
    if (titleScore > 0.75 && artistScore > 0.75) return true;

    return false;
};

  // --- STYLING & HELPERS ---
  const getPlaylistIcon = (n) => (n.toLowerCase().includes("liked") || n.toLowerCase().includes("favourite") || n.toLowerCase().includes("favorite")) ? "❤️" : "";
  const searchInputStyle = { width: "100%", padding: "8px", marginBottom: "10px", borderRadius: "5px", border: "none", backgroundColor: "#eee", fontSize: "14px", boxSizing: "border-box", color: "#333" };
  const navBtnStyle = { background: "none", border: "none", color: "white", cursor: "pointer", fontWeight: "bold", fontSize: "14px" };

  const isPlaylistScanned = (platform, name) => {
    const lowerName = name.toLowerCase();
    const inDb = scannedPlaylists[platform]?.includes(lowerName);
    const inCache = !!songCache[platform]?.[name];
    return inDb || inCache;
  };

  const sortedApplePlaylists = applePlaylists
    ?.filter(pl => {
      const lowerName = pl.name.toLowerCase();
      const searchMatch = lowerName.includes(appleSearch.toLowerCase());
      const isSystemList = lowerName.includes("favorite") || 
                           lowerName.includes("favourite") || 
                           lowerName.includes("favoriete") || 
                           lowerName.includes("library") || 
                           lowerName.includes("bibliotheek") || 
                           lowerName === "library_apple";
                           
      return searchMatch && !isSystemList; 
    })
    ?.sort((a, b) => {
      const aScanned = isPlaylistScanned('apple', a.name);
      const bScanned = isPlaylistScanned('apple', b.name);
      if (aScanned !== bScanned) return aScanned ? -1 : 1; // Scanned elements stay on top
      return a.name.localeCompare(b.name); // Alphabetical sorting for everything else
    });

  const sortedSpotifyPlaylists = spotifyPlaylists
    ?.filter(pl => {
      const lowerName = pl.name.toLowerCase();
      const searchMatch = lowerName.includes(spotifySearch.toLowerCase());
      const isSystemList = lowerName.includes("liked") || 
                           lowerName.includes("gelikete") || 
                           (lowerName.includes("nummers") && lowerName.includes("leuk")) || 
                           lowerName === "liked_spotify";
                           
      return searchMatch && !isSystemList; 
    })
    ?.sort((a, b) => {
      const aScanned = isPlaylistScanned('spotify', a.name);
      const bScanned = isPlaylistScanned('spotify', b.name);
      if (aScanned !== bScanned) return aScanned ? -1 : 1; // Scanned elements stay on top
      return a.name.localeCompare(b.name); // Alphabetical sorting for everything else
    });

  // --- RENDERING AUTH VIEW (WITH IMPROVED UI STATES) ---
  if (!session) {
    return (
      <div style={{ backgroundColor: "#222", color: "#fff", height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        <img src="/Logo.png" alt="Logo" style={{ height: "60px", marginBottom: "20px" }} />
        <div style={{ backgroundColor: "#333", padding: "40px", borderRadius: "15px", width: "350px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
          <h2 style={{ textAlign: "center", marginBottom: "20px" }}>{isSignUp ? "Create Account" : "Welcome Back"}</h2>
          
          <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            <input 
              type="email" 
              placeholder="Email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required
              disabled={isAuthLoading}
              style={{ 
                padding: "12px", 
                borderRadius: "5px", 
                border: "none", 
                outline: "none", 
                color: "#333",
                opacity: isAuthLoading ? 0.6 : 1,
                cursor: isAuthLoading ? "not-allowed" : "text"
              }}
            />
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="Password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required
                disabled={isAuthLoading}
                style={{ 
                  padding: "12px", 
                  paddingRight: "40px", 
                  borderRadius: "5px", 
                  border: "none", 
                  outline: "none", 
                  color: "#333",
                  width: "100%",
                  boxSizing: "border-box",
                  opacity: isAuthLoading ? 0.6 : 1,
                  cursor: isAuthLoading ? "not-allowed" : "text"
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isAuthLoading}
                style={{
                  position: "absolute",
                  right: "10px",
                  background: "none",
                  border: "none",
                  cursor: isAuthLoading ? "not-allowed" : "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  outline: "none"
                }}
                title={showPassword ? "Hide Password" : "Show Password"}
              >
                {showPassword ? (
                  /* EYE-OFF SVG */
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  /* EYE SVG */
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>

            {/* Helper Requirements Hint */}
            {isSignUp && (
              <span style={{ fontSize: "11px", color: "#aaa", marginTop: "-5px", display: "block" }}>
                * Password must be 6 or more characters.
              </span>
            )}

            <button 
              type="submit" 
              disabled={isAuthLoading}
              style={{ 
                padding: "12px", 
                borderRadius: "5px", 
                border: "none", 
                backgroundColor: isAuthLoading ? "#555" : "#6a0dad", 
                color: "#fff", 
                fontWeight: "bold", 
                cursor: isAuthLoading ? "not-allowed" : "pointer",
                transition: "all 0.2s ease"
              }}
            >
              {isAuthLoading ? (isSignUp ? "CREATING ACCOUNT..." : "LOGGING IN...") : (isSignUp ? "SIGN UP" : "LOG IN")}
            </button>
          </form>

          {/* Alert Messages */}
          {errorMsg && (
            <p style={{ 
              color: "#ff4d4d", 
              fontSize: "14px", 
              marginTop: "15px", 
              textAlign: "center", 
              fontWeight: "bold",
              backgroundColor: "rgba(255, 77, 77, 0.15)",
              padding: "10px",
              borderRadius: "5px",
              border: "1px solid rgba(255, 77, 77, 0.3)"
            }}>
              ⚠️ {errorMsg}
            </p>
          )}
          {successMsg && (
            <p style={{ 
              color: "#1db954", 
              fontSize: "14px", 
              marginTop: "15px", 
              textAlign: "center", 
              fontWeight: "bold",
              backgroundColor: "rgba(29, 185, 84, 0.15)",
              padding: "10px",
              borderRadius: "5px",
              border: "1px solid rgba(29, 185, 84, 0.3)"
            }}>
              ✅ {successMsg}
            </p>
          )}

          <p style={{ textAlign: "center", marginTop: "20px", fontSize: "14px", color: "#aaa" }}>
            {isSignUp ? "Already have an account?" : "New to MusicCave?"}{" "}
            <span 
              onClick={() => { 
                if (!isAuthLoading) {
                  setIsSignUp(!isSignUp); 
                  setErrorMsg(""); 
                  setSuccessMsg(""); 
                }
              }} 
              style={{ 
                color: isAuthLoading ? "#555" : "#38bdf8", 
                cursor: isAuthLoading ? "not-allowed" : "pointer", 
                fontWeight: "bold" 
              }}
            >
              {isSignUp ? "Log In" : "Sign Up Free"}
            </span>
          </p>

          {!isSignUp && (
            <div style={{ textAlign: "center", marginTop: "20px" }}>
              <button 
                type="button"
                disabled={isAuthLoading}
                onClick={handleForgotPassword} 
                style={{ 
                  color: isAuthLoading ? "#555" : "#38bdf8", 
                  cursor: isAuthLoading ? "not-allowed" : "pointer", 
                  fontSize: "14px", 
                  fontWeight: "bold",
                  background: "none",
                  border: "none",
                  padding: "0"
                }}
              >
                {isAuthLoading ? "Please wait..." : "Forgot Password?"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- MAIN APP VIEW WITH STICKY FOOTER CONTAINER ---
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "#222", color: "#fff", fontFamily: "sans-serif" }}>
      
      {/* WRAPPER FOR SCROLLABLE VIEWPORT CONTENT */}
      <div style={{ flex: "1", paddingBottom: "50px" }}>
        
        {/* NAVBAR */}
        <div style={{ backgroundColor: "#6a0dad", padding: "15px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div 
            onClick={() => setView("dashboard")}
            style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "20px", fontWeight: "bold", cursor: "pointer" }}
          >
            <a 
              href="https://www.patreon.com/Makkeroni" // Replace with your actual Patreon link
              target="_blank" 
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "#FF424D", // Official Patreon Coral Red
                color: "#ffffff",
                padding: "8px 16px",
                borderRadius: "20px",
                fontWeight: "bold",
                textDecoration: "none",
                fontSize: "14px",
                boxShadow: "0 4px 12px rgba(255, 66, 77, 0.3)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                cursor: "pointer",
                border: "none"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = "0 6px 18px rgba(255, 66, 77, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 66, 77, 0.3)";
              }}
            >
              {/* PATREON SVG ICON */}
              <svg viewBox="0 0 24 24" fill="#ffffff" style={{ height: "18px", width: "18px" }}>
                <path d="M15.386 11.5c0-2.812-2.28-5.093-5.093-5.093-2.813 0-5.093 2.28-5.093 5.093 0 2.812 2.28 5.093 5.093 5.093 2.812 0 5.093-2.28 5.093-5.093zm-11.536 7.5h2.152V4H3.85v15z"/>
              </svg>
              <span>Support me on Patreon</span>
            </a>
            <img src="/Logo.png" alt="MusicCave Logo" style={{ height: "35px" }} />
            MusicCave
          </div>
          <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
            <button onClick={() => setView("dashboard")} style={navBtnStyle}>Dashboard</button>
            <button onClick={() => setView("history")} style={navBtnStyle}>History</button>
            <button onClick={() => setView("privacy")} style={navBtnStyle}>Privacy</button>
            
            <div style={{ backgroundColor: "rgba(255,255,255,0.15)", padding: "6px 15px", borderRadius: "20px", fontSize: "14px", border: "1px solid rgba(255,255,255,0.45)", display: "flex", alignItems: "center" }}>
              <span style={{ color: "#1db954", fontWeight: "bold", marginRight: "8px" }}>●</span> {totalSynced} Songs Synced
            </div>
              <button onClick={() => {
                  localStorage.removeItem('musiccave_apple_playlists');
                  localStorage.removeItem('musiccave_spotify_playlists');
                  supabase.auth.signOut();
              }} style={{...navBtnStyle, color: "#fff"}}>Logout</button>    
            </div>
        </div>

        {/* FLOATING SERVER STATUS BUBBLE */}
        <div style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          backgroundColor: "rgba(0,0,0,0.85)",
          color: "#fff",
          padding: "10px 15px",
          borderRadius: "30px",
          fontSize: "12px",
          fontWeight: "bold",
          border: "1px solid rgba(255,255,255,0.2)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          zIndex: 10000,
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
        }}>
          <span style={{ color: serverStatus.includes("🟢") ? "#1db954" : "#ff4d4d", fontSize: "10px" }}>●</span> Server: {serverStatus}
        </div>

        {view === "dashboard" ? (
          <>
            <div style={{ textAlign: "center", marginTop: "40px" }}>
              <h1 style={{ fontSize: "42px", margin: "0 0 10px 0" }}>Dashboard</h1>
              <h2 style={{ fontSize: "24px", fontWeight: "normal", marginTop: "0", color: "#ccc" }}>My Music Services</h2>

              {isTransferring && <div style={{ color: "#1db954", fontSize: "20px", fontWeight: "bold", margin: "10px 0" }}>{transferStatus}</div>}

              {/* Logo Selection directly on Image boundaries with adjusted Apple corner radius to avoid gaps */}
              <div style={{ display: "flex", justifyContent: "center", gap: "50px", marginTop: "30px" }}>
                
                {/* Apple Music Logo Option with Clipping Container */}
                <div 
                  onClick={() => setTargetService('apple')}
                  style={{
                    width: "120px",
                    height: "120px",
                    borderRadius: "30px",
                    border: targetService === 'apple' ? "4px solid #fa243c" : "4px solid transparent",
                    boxSizing: "border-box",
                    overflow: "hidden", // Clips the transparent margins of the logo asset
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    backgroundColor: "transparent"
                  }}
                >
                  <img 
                    src="/Applemusic_logo.png" 
                    alt="Apple Music" 
                    style={{ 
                      width: "100%", 
                      height: "100%", 
                      objectFit: "cover",
                      transform: "scale(1.08)", // Zooms the red logo slightly past the transparent padding
                    }} 
                  />
                </div>

                {/* Spotify Logo Option */}
                <img 
                  onClick={() => setTargetService('spotify')}
                  src="/Spotify_logo.png" 
                  alt="Spotify" 
                  style={{ 
                    width: "120px", 
                    height: "120px", 
                    objectFit: "cover", 
                    borderRadius: "60px", 
                    border: targetService === 'spotify' ? "4px solid #1db954" : "4px solid transparent",
                    cursor: "pointer",
                    boxSizing: "border-box"
                  }} 
                />
                
              </div>

              <h3 style={{ fontSize: "28px", marginTop: "50px", fontWeight: "normal" }}>Select playlists to transfer</h3>
              {errorMsg && <p style={{ color: "#ff4d4d", fontSize: "18px" }}>⚠️ {errorMsg}</p>}

              {/* DASHBOARD GRID FLOW */}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "40px", marginTop: "40px", flexWrap: "wrap" }}>
                
                {/* 1. Apple Column Card */}
                <div style={{ 
                  backgroundColor: "#999", 
                  borderRadius: "10px", 
                  padding: "20px", 
                  width: "250px", 
                  minHeight: "300px", 
                  display: "flex", 
                  flexDirection: "column", 
                  justifyContent: "space-between"
                }}>
                  <div>
                    {!applePlaylists ? (
                      /* 0. PRE-SCAN PLACEHOLDER (Exact style matching backup, lighter & readable text link) */
                      <div style={{ backgroundColor: "#222", padding: "20px", borderRadius: "8px", textAlign: "center", color: "#ccc", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "220px", border: "2px solid #6a0dad" }}>
                        <p style={{ fontSize: "14px", lineHeight: "1.6", margin: "0 0 15px 0", fontWeight: "bold" }}>
                          MusicCave needs to scan your playlists before you can start transferring.
                        </p>
                        <strong 
                          onClick={() => scanPlatform('apple')} 
                          style={{ color: "#d8b4fe", fontSize: "18px", cursor: "pointer", textDecoration: "underline" }}
                        >
                          Scan now!
                        </strong>
                      </div>
                    ) : (
                      <>
                        <input type="text" placeholder="Search Apple..." value={appleSearch} onChange={(e) => setAppleSearch(e.target.value)} style={searchInputStyle} />
                        
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
                            backgroundColor: "#fa243c",
                            padding: "15px", borderRadius: "8px", marginBottom: "15px", color: "#fff",
                            cursor: "pointer", 
                            border: selectedApple?.name === "LIBRARY_APPLE" ? "2px solid white" : "2px solid transparent",
                            fontWeight: "bold", display: "flex", justifyContent: "space-between", alignItems: "center",
                            boxSizing: "border-box"
                          }}
                        >
                          <span>❤️ Favorite Songs</span>
                          <span style={{ fontSize: "14px", textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000" }}>
                              {isPlaylistScanned('apple', 'LIBRARY_APPLE') ? "✅" : "❌"}
                          </span>
                        </div>

                        <div style={{ maxHeight: "250px", overflowY: "auto" }} onScroll={() => setTooltipData(null)}>
                         {sortedApplePlaylists?.map((pl, idx) => {
                            const isScanned = isPlaylistScanned('apple', pl.name);
                            const isSelected = selectedApple?.name === pl.name;
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
                                  backgroundColor: "#fa243c", 
                                  padding: "10px", borderRadius: "5px", marginBottom: "10px", 
                                  color: "#fff", cursor: "pointer", 
                                  border: isSelected ? "2px solid white" : "2px solid transparent",
                                  display: "flex", 
                                  justifyContent: "space-between", 
                                  alignItems: "center",
                                  boxSizing: "border-box"
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

                {/* 2. Spotify Column Card */}
                <div style={{ 
                  backgroundColor: "#999", 
                  borderRadius: "10px", 
                  padding: "20px", 
                  width: "250px", 
                  minHeight: "300px", 
                  display: "flex", 
                  flexDirection: "column", 
                  justifyContent: "space-between"
                }}>
                  <div>
                    {!spotifyPlaylists ? (
                      /* 0. PRE-SCAN PLACEHOLDER (Exact style matching backup, lighter & readable text link) */
                      <div style={{ backgroundColor: "#222", padding: "20px", borderRadius: "8px", textAlign: "center", color: "#ccc", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "220px", border: "2px solid #6a0dad" }}>
                        <p style={{ fontSize: "14px", lineHeight: "1.6", margin: "0 0 15px 0", fontWeight: "bold" }}>
                          MusicCave needs to scan your playlists before you can start transferring.
                        </p>
                        <strong 
                          onClick={() => scanPlatform('spotify')} 
                          style={{ color: "#d8b4fe", fontSize: "18px", cursor: "pointer", textDecoration: "underline" }}
                        >
                          Scan now!
                        </strong>
                      </div>
                    ) : (
                      <>
                        <input type="text" placeholder="Search Spotify..." value={spotifySearch} onChange={(e) => setSpotifySearch(e.target.value)} style={searchInputStyle} />
                        
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
                            backgroundColor: "#1db954",
                            padding: "15px", borderRadius: "8px", marginBottom: "15px", 
                            color: selectedSpotify?.name === "LIKED_SPOTIFY" ? "#fff" : "#000",
                            cursor: "pointer", 
                            border: selectedSpotify?.name === "LIKED_SPOTIFY" ? "2px solid black" : "2px solid transparent",
                            fontWeight: "bold", display: "flex", justifyContent: "space-between", alignItems: "center",
                            boxSizing: "border-box"
                          }}
                        >
                          <span>❤️ Liked Songs</span>
                          <span style={{ fontSize: "14px", textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000" }}>
                              {isPlaylistScanned('spotify', 'LIKED_SPOTIFY') ? "✅" : "❌"}
                          </span>
                        </div>

                        <div style={{ maxHeight: "250px", overflowY: "auto" }} onScroll={() => setTooltipData(null)}>
                          {sortedSpotifyPlaylists?.map((pl, idx) => {
                            const isScanned = isPlaylistScanned('spotify', pl.name);
                            const isSelected = selectedSpotify?.name === pl.name;
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
                                  backgroundColor: "#1db954", 
                                  padding: "10px", borderRadius: "5px", marginBottom: "10px", 
                                  color: isSelected ? "#fff" : "#000", fontWeight: "500", cursor: "pointer", 
                                  border: isSelected ? "2px solid black" : "2px solid transparent",
                                  display: "flex", 
                                  justifyContent: "space-between", 
                                  alignItems: "center",
                                  boxSizing: "border-box"
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

                {/* 3. Target Service Toggle Boxes */}
                <div style={{ 
                  backgroundColor: "#999", 
                  borderRadius: "10px", 
                  padding: "20px", 
                  width: "180px", 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "10px",
                  boxSizing: "border-box"
                }}>
                  <p style={{ fontSize: "16px", fontWeight: "bold", margin: "0 0 5px 0", color: "#000", textAlign: "center" }}>Target Service</p>
                  
                  <div 
                    onClick={() => setTargetService('apple')} 
                    style={{ 
                      backgroundColor: "#fa243c", 
                      padding: "10px 8px", 
                      borderRadius: "5px", 
                      color: "#fff", 
                      fontWeight: "bold", 
                      cursor: "pointer", 
                      border: targetService === 'apple' ? "2px solid white" : "2px solid transparent",
                      transform: targetService === 'apple' ? "scale(1.05)" : "scale(1.0)",
                      boxSizing: "border-box",
                      transition: "all 0.2s ease-in-out",
                      textAlign: "center"
                    }}
                  >
                    Destination Apple
                  </div>
                  
                  <div style={{ color: "#000", textAlign: "center", fontSize: "16px", fontWeight: "bold" }}>or</div>
                  
                  <div 
                    onClick={() => setTargetService('spotify')} 
                    style={{ 
                      backgroundColor: "#1db954", 
                      padding: "10px 8px", 
                      borderRadius: "5px", 
                      color: "#000", 
                      fontWeight: "bold", 
                      cursor: "pointer", 
                      border: targetService === 'spotify' ? "2px solid black" : "2px solid transparent",
                      transform: targetService === 'spotify' ? "scale(1.05)" : "scale(1.0)",
                      boxSizing: "border-box",
                      transition: "all 0.2s ease-in-out",
                      textAlign: "center"
                    }}
                  >
                    Destination Spotify
                  </div>
                </div>

                {/* 4. Start & Cancel Buttons */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "200px" }}>
                  {!isTransferring ? (
                    <button 
                      onClick={startTransfer} 
                      onMouseEnter={() => setIsHoveredStart(true)}
                      onMouseLeave={() => setIsHoveredStart(false)}
                      style={{ 
                        backgroundColor: "#1db954", 
                        color: "#000", 
                        border: "none", 
                        padding: "15px 30px", 
                        borderRadius: "50px", 
                        fontWeight: "bold", 
                        cursor: "pointer",
                        transform: isHoveredStart ? "scale(1.08)" : "scale(1.0)",
                        boxShadow: isHoveredStart 
                          ? "0 8px 25px rgba(29, 185, 84, 0.6)" 
                          : "0 4px 15px rgba(29, 185, 84, 0.3)",
                        transition: "all 0.3s ease-in-out"
                      }}
                    >
                      START TRANSFER
                    </button>
                  ) : (
                    <button onClick={handleCancelTransfer} style={{ backgroundColor: "#ff4d4d", color: "#fff", border: "none", padding: "15px 30px", borderRadius: "50px", fontWeight: "bold", cursor: "pointer", boxShadow: "0 0 15px rgba(255, 77, 77, 0.6)" }}>
                      ⏹ CANCEL TRANSFER
                    </button>
                  )}
                </div>

              </div>
            </div>

            {/* RESTORED ORIGINAL IMAGE TOOLTIP */}
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
          </>
       ) : view === "history" ? (
          /* HISTORY VIEW */
          <div style={{ padding: "40px", maxWidth: "800px", margin: "0 auto" }}>
            <h1 style={{ fontSize: "32px", marginBottom: "30px", textAlign: "center" }}>Transfer History</h1>
            {isLoadingHistory ? (
              <p style={{ color: "#aaa", textAlign: "center" }}>Your history is loading...</p>
            ) : history.length === 0 ? (
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
        ) : (
          /* PRIVACY VIEW */
          <div style={{ padding: "50px", maxWidth: "800px", margin: "40px auto", backgroundColor: "#333", borderRadius: "15px", border: "1px solid #444", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
            <h1 style={{ fontSize: "32px", marginBottom: "10px", color: "#fff", textAlign: "center" }}>Privacy Policy</h1>
            <p style={{ color: "#aaa", textAlign: "center", marginBottom: "40px" }}>Last Updated: June 22 2026</p>

            <h3 style={{ color: "#1db954", marginBottom: "10px" }}>1. Data Collection</h3>
            <p style={{ color: "#ccc", marginBottom: "25px", lineHeight: "1.6" }}>The MusicCave extension does not collect, transmit, distribute, or sell your personal data. All processes required to read playlist data and navigate the user interface happen entirely locally on your own computer.</p>

            <h3 style={{ color: "#1db954", marginBottom: "10px" }}>2. Account Security</h3>
            <p style={{ color: "#ccc", marginBottom: "25px", lineHeight: "1.6" }}>The extension does not ask for, read, or store your passwords for Spotify or Apple Music. It relies on your browser's existing authenticated sessions to function.</p>

            <h3 style={{ color: "#1db954", marginBottom: "10px" }}>3. External Servers</h3>
            <p style={{ color: "#ccc", marginBottom: "25px", lineHeight: "1.6" }}>The extension communicates solely with the official MusicCave web application to receive transfer instructions. No song data or browsing history is sent to third-party advertising or tracking servers.</p>

            <h3 style={{ color: "#1db954", marginBottom: "10px" }}>4. Permissions</h3>
            <p style={{ color: "#ccc", marginBottom: "25px", lineHeight: "1.6" }}>
            The extension requests the "tabs" permission strictly to coordinate and switch focus between your web dashboard and open music player tabs. Additionally, the extension uses static content script matching 
            restricted entirely to the music.apple.com and open.spotify.com domains. 
            This access is used exclusively to read song titles and assist with user interface navigation during an active migration
            </p>

            <h3 style={{ color: "#1db954", marginBottom: "10px" }}>5. Disclaimer</h3>
            <p style={{ color: "#ccc", marginBottom: "25px", lineHeight: "1.6" }}>
            MusicCave is an independent, open-source project and is not affiliated with, authorized, maintained, sponsored, 
            or endorsed by Apple Inc., Spotify AB, or any of their affiliates or subsidiaries. 
            All product and company names are trademarks™ or registered® trademarks of their respective holders.
            Use of them does not imply any affiliation with or endorsement by them.
            </p>

            <h3 style={{ color: "#1db954", marginBottom: "10px" }}>6. Contact</h3>
            <p style={{ color: "#ccc", lineHeight: "1.6" }}>If you have any questions regarding this privacy policy, please contact the developer via the Chrome Web Store support tab.</p>
          </div>
        )}

        {/* RESULTS MODAL */}
        {showResultsModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
            <div style={{ backgroundColor: "#333", padding: "30px", borderRadius: "15px", width: "500px", maxHeight: "80vh", overflowY: "auto", border: "1px solid #444", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
              <h2 style={{ textAlign: "center", color: "#fff" }}>Transfer Report</h2>
              
              <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "20px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "24px", color: "#1db954", fontWeight: "bold" }}>{lastTransferAdded}</div>
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

      {/* FOOTER: STICKY TO THE BOTTOM OF THE PAGE */}
      <div style={{ borderTop: "1px solid #444", paddingTop: "50px", paddingBottom: "50px", textAlign: "center", backgroundColor: "#1a1a1a", marginTop: "auto" }}>
        <h3 style={{ fontSize: "24px", color: "#ccc", margin: "0 0 10px 0" }}>Live Connection Data</h3>
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap", padding: "20px" }}>
          
          {/* Apple Connection Box */}
          <div style={{ backgroundColor: "#333", padding: "20px", borderRadius: "8px", width: "450px", textAlign: "left", borderLeft: platformData.apple ? "5px solid #fa243c" : "5px solid #555" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <p style={{ fontSize: "18px", fontWeight: "bold", margin: 0 }}>🍎 Apple Music Data</p>
              <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "10px", backgroundColor: platformData.apple ? "#fa243c" : "#444", color: "#fff", fontWeight: "bold" }}>
                {platformData.apple ? "CONNECTED" : "INACTIVE"}
              </span>
            </div>
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
            ) : <p style={{ fontSize: "14px", color: "#999", margin: "10px 0 0 0" }}>No live connection data. Scan Apple Music to activate.</p>}
          </div>

          {/* Spotify Connection Box */}
          <div style={{ backgroundColor: "#333", padding: "20px", borderRadius: "8px", width: "450px", textAlign: "left", borderLeft: platformData.spotify ? "5px solid #1db954" : "5px solid #555" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <p style={{ fontSize: "18px", fontWeight: "bold", margin: 0 }}>🟢 Spotify Data</p>
              <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "10px", backgroundColor: platformData.spotify ? "#1db954" : "#444", color: platformData.spotify ? "#000" : "#fff", fontWeight: "bold" }}>
                {platformData.spotify ? "CONNECTED" : "INACTIVE"}
              </span>
            </div>
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
            ) : <p style={{ fontSize: "14px", color: "#999", margin: "10px 0 0 0" }}>No live connection data. Scan Spotify to activate.</p>}
          </div>

        </div>

        {/* LEGAL DISCLAIMER */}
        <div style={{ 
          maxWidth: "920px", 
          margin: "40px auto 0 auto", 
          padding: "0 20px", 
          fontSize: "11px", 
          color: "#666", 
          lineHeight: "1.6",
          textAlign: "center",
          borderTop: "1px solid #222",
          paddingTop: "20px"
        }}>
          <strong>Disclaimer:</strong> MusicCave is an independent, open-source project and is not affiliated with, 
          authorized, maintained, sponsored, or endorsed by Apple Inc., Spotify AB, or any of their affiliates 
          or subsidiaries. All product and company names are trademarks™ or registered® trademarks of their 
          respective holders. Use of them does not imply any affiliation with or endorsement by them.
        </div>
      </div>
    </div>
  );
}

export default App;