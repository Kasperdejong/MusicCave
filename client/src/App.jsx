import { useState, useEffect } from 'react';

const EXTENSION_ID = "clammlphhicbgjpmjbgiedegkepkabcp";

function App() {
  const [serverStatus, setServerStatus] = useState("Checking...");
  const [applePlaylists, setApplePlaylists] = useState(null);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [transferMode, setTransferMode] = useState("transfer_fill");
  const [totalSynced, setTotalSynced] = useState(0);

  // --- SEARCH STATES ---
  const [appleSearch, setAppleSearch] = useState("");
  const [spotifySearch, setSpotifySearch] = useState("");

  // --- PERSISTENT PLATFORM DATA ---
  const [platformData, setPlatformData] = useState({
    apple: null,
    spotify: null
  });

  // --- SELECTION STATES ---
  const [selectedApple, setSelectedApple] = useState(null); 
  const [selectedSpotify, setSelectedSpotify] = useState(null); 
  const [targetService, setTargetService] = useState(null); 

  const [isTransferring, setIsTransferring] = useState(false);
  const [transferStatus, setTransferStatus] = useState("");

  // --- HELPER: FETCH ANALYTICS ---
  const fetchStats = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/stats');
      if (res.ok) {
        const data = await res.json();
        setTotalSynced(data.totalSongs || 0);
      }
    } catch (e) { console.error("Stats fetch failed", e); }
  };

  useEffect(() => {
    const checkServer = async () => {
      try {
        const response = await fetch('http://localhost:4000/');
        if (response.ok) setServerStatus("Connected 🟢");
      } catch (error) {
        setServerStatus("Disconnected 🔴");
      }
    };
    checkServer();
    fetchStats();

    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const getPlaylistIcon = (name) => {
    const n = name.toLowerCase();
    if (n.includes("liked") || n.includes("favourite") || n.includes("leuk vindt") || n.includes("liked songs")) {
      return "❤️";
    }
    return "";
  };

  // --- FIXED SCAN FUNCTION ---
 const scanPlatform = (platform) => {
  setErrorMsg("");
  window.chrome.runtime.sendMessage(
    EXTENSION_ID,
    { action: "SCAN_SPECIFIC_PLATFORM", platform: platform },
    async (response) => {
      if (response && response.tabsData?.[0]) {
        const data = response.tabsData[0];
        const detectedName = data.detectedPlaylistName || "Scanned Playlist";

        // 1. Update general platform data
        setPlatformData(prev => ({ ...prev, [platform]: data }));
        
        // 2. Set the lists for the columns
        if (platform === 'apple') setApplePlaylists(data.playlists);
        if (platform === 'spotify') setSpotifyPlaylists(data.playlists);

        // 3. AUTO-SELECT the scanned playlist so the UI updates
        const playlistObj = { name: detectedName };
        if (platform === 'apple') setSelectedApple(playlistObj);
        if (platform === 'spotify') setSelectedSpotify(playlistObj);

        // 4. SYNC TO DATABASE (Using detected name from robot)
        try {
            await fetch('http://localhost:4000/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    platform: platform, 
                    songs: data.songs, 
                    playlistName: detectedName 
                })
            });
            fetchStats();
        } catch (err) { console.error("Database Sync Error:", err); }
      } else {
        setErrorMsg(`Could not find an active ${platform} tab.`);
      }
    }
  );
};

  // --- FILTER LOGIC ---
  const filteredApple = applePlaylists?.filter(pl => 
    pl.name.toLowerCase().includes(appleSearch.toLowerCase())
  );

  const filteredSpotify = spotifyPlaylists?.filter(pl => 
    pl.name.toLowerCase().includes(spotifySearch.toLowerCase())
  );

  // --- TRANSFER LOGIC ---
 const startTransfer = async () => {
    // 1. Initial Validations
    if (!targetService) {
        setErrorMsg("Please select a Target Service (Apple or Spotify icon).");
        return;
    }

    const sourcePlatform = targetService === 'spotify' ? 'apple' : 'spotify';
    const sourceData = platformData[sourcePlatform];
    
    // We use the 'detectedPlaylistName' from the scan if available
    const sourcePlaylistName = sourceData?.detectedPlaylistName || "Unknown Source";

    if (!sourceData || !sourceData.songs) {
        setErrorMsg(`Please scan ${sourcePlatform} first.`);
        return;
    }

    // Determine the name of the playlist we are FILLING (Target)
    const destinationSelection = targetService === 'spotify' ? selectedSpotify : selectedApple;
    const targetNameString = destinationSelection ? destinationSelection.name : "MusicCave Playlist";

    setIsTransferring(true);
    setTransferStatus("Checking database for duplicates...");

    try {
        // 2. Fetch songs already in THIS SPECIFIC target playlist from DB
        const dbRes = await fetch(`http://localhost:4000/api/songs/${targetService}?playlistName=${encodeURIComponent(targetNameString)}`);
        const existingSongsInDB = await dbRes.json();  

        // 3. Filter out songs the robot already knows about for this playlist
        const filteredSongs = sourceData.songs.filter(s => {
            return !existingSongsInDB.some(dbSong => 
                dbSong.title === s.title.toLowerCase().trim() && 
                dbSong.artist === s.artist.toLowerCase().trim()
            );
        });

        if (filteredSongs.length === 0) {
            setTransferStatus("✅ All songs in this playlist are already synced!");
            setIsTransferring(false);
            return;
        }

        const action = targetService === 'spotify' ? "TRANSFER_SONG_TO_SPOTIFY" : "TRANSFER_SONG_TO_APPLE";

        // 4. Robot Loop
        for (let i = 0; i < filteredSongs.length; i++) {
            const currentSong = filteredSongs[i];
            setTransferStatus(`Moving (${i + 1}/${filteredSongs.length}): ${currentSong.title}`);

            const robotResponse = await new Promise((resolve) => {
                window.chrome.runtime.sendMessage(
                    EXTENSION_ID,
                    { action, song: currentSong, targetName: targetNameString },
                    (response) => resolve(response)
                );
            });

            // 5. If successful, add to DB under the TARGET playlist name
            if (robotResponse && robotResponse.status === "Success") {
                await fetch('http://localhost:4000/api/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        platform: targetService, 
                        songs: [currentSong],
                        playlistName: targetNameString 
                    })
                });
                fetchStats(); // Update the counter pill
            }

            // Wait for DOM to settle
            await new Promise(resolve => setTimeout(resolve, 2500));
        }

        setTransferStatus("✅ Transfer Complete!");

    } catch (err) {
        console.error("Transfer Error:", err);
        setErrorMsg("Database connection failed. Is your server running?");
    } finally {
        setIsTransferring(false);
    }
};

  const searchInputStyle = {
    width: "100%", padding: "8px", marginBottom: "10px", borderRadius: "5px", border: "none",
    backgroundColor: "#eee", color: "#333", fontSize: "14px", boxSizing: "border-box", outline: "none"
  };

  return (
    <div style={{ backgroundColor: "#222", color: "#fff", minHeight: "100vh", fontFamily: "sans-serif", paddingBottom: "50px" }}>

      {/* HEADER */}
      <div style={{ backgroundColor: "#6a0dad", padding: "15px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "20px", fontWeight: "bold" }}>
          <img src="/Logo.png" alt="MusicCave Logo" style={{ height: "35px", width: "auto" }} />
          MusicCave Dashboard
        </div>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          <div style={{ backgroundColor: "rgba(255,255,255,0.1)", padding: "5px 15px", borderRadius: "20px", fontSize: "12px", border: "1px solid rgba(255,255,255,0.3)" }}>
            <span style={{ color: "#1db954", fontWeight: "bold" }}>●</span> {totalSynced} Songs Synced
          </div>
          <div style={{ fontSize: "14px", fontWeight: "bold" }}>Server: {serverStatus}</div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: "40px" }}>
        <h1 style={{ fontSize: "42px", margin: "0 0 10px 0" }}>Dashboard</h1>
        <h2 style={{ fontSize: "24px", fontWeight: "normal", marginTop: "0", color: "#ccc" }}>My Music Services</h2>

        {isTransferring && (
          <div style={{ color: "#1db954", fontSize: "20px", fontWeight: "bold", margin: "10px 0" }}>
             🤖 {transferStatus}
          </div>
        )}

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
              <input type="text" placeholder="Search Apple..." value={appleSearch} onChange={(e) => setAppleSearch(e.target.value)} style={searchInputStyle} />
              <div style={{ maxHeight: "250px", overflowY: "auto" }}>
                {filteredApple ? filteredApple.map((pl, idx) => (
                  <div key={idx} onClick={() => setSelectedApple(pl)} style={{ backgroundColor: selectedApple?.name === pl.name ? "#b31b2d" : "#fa243c", padding: "10px", borderRadius: "5px", marginBottom: "10px", color: "#fff", cursor: "pointer", border: selectedApple?.name === pl.name ? "2px solid white" : "none" }}>
                    <span>{getPlaylistIcon(pl.name)}</span> {pl.name}
                  </div>
                )) : <p style={{ color: "#333", fontStyle: "italic" }}>No playlists loaded.</p>}
              </div>
            </div>
            <button onClick={() => scanPlatform('apple')} style={{ backgroundColor: "#6a0dad", color: "white", border: "none", padding: "10px", borderRadius: "5px", cursor: "pointer", marginTop: "20px", fontWeight: "bold" }}>Scan Apple Music</button>
          </div>

          <div style={{ marginTop: "120px" }}>
            <select value={transferMode} onChange={(e) => setTransferMode(e.target.value)} style={{ backgroundColor: "#6a0dad", color: "white", border: "none", padding: "8px 15px", borderRadius: "5px", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}>
              <option value="transfer_fill">transfer & fill ▼</option>
              <option value="clean_transfer">clean transfer ▼</option>
            </select>
          </div>

          {/* Spotify Column */}
          <div style={{ backgroundColor: "#999", borderRadius: "10px", padding: "20px", width: "250px", minHeight: "300px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <input type="text" placeholder="Search Spotify..." value={spotifySearch} onChange={(e) => setSpotifySearch(e.target.value)} style={searchInputStyle} />
              <div style={{ maxHeight: "250px", overflowY: "auto" }}>
                {filteredSpotify ? filteredSpotify.map((pl, idx) => (
                  <div key={idx} onClick={() => setSelectedSpotify(pl)} style={{ backgroundColor: selectedSpotify?.name === pl.name ? "#15833b" : "#1db954", padding: "10px", borderRadius: "5px", marginBottom: "10px", color: "#000", fontWeight: "500", cursor: "pointer", border: selectedSpotify?.name === pl.name ? "2px solid black" : "none" }}>
                    <span>{getPlaylistIcon(pl.name)}</span> {pl.name}
                  </div>
                )) : <p style={{ color: "#333", fontStyle: "italic" }}>No playlists loaded.</p>}
              </div>
            </div>
            <button onClick={() => scanPlatform('spotify')} style={{ backgroundColor: "#6a0dad", color: "white", border: "none", padding: "10px", borderRadius: "5px", cursor: "pointer", marginTop: "20px", fontWeight: "bold" }}>Scan Spotify</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "100px" }}>
             <button onClick={startTransfer} disabled={isTransferring} style={{ backgroundColor: isTransferring ? "#555" : "#1db954", color: "#fff", border: "none", padding: "15px 30px", borderRadius: "50px", fontWeight: "bold", cursor: "pointer" }}>
              {isTransferring ? "TRANSFERRING..." : "START TRANSFER"}
            </button>
          </div>

          {/* Target Service Toggle Boxes */}
          <div style={{ backgroundColor: "#999", borderRadius: "10px", padding: "20px", width: "180px", marginTop: "60px" }}>
            <div onClick={() => setTargetService('apple')} style={{ backgroundColor: "#fa243c", padding: "15px 10px", borderRadius: "5px", marginBottom: "10px", color: "#fff", fontWeight: "bold", cursor: "pointer", border: targetService === 'apple' ? "3px solid white" : "none" }}>New playlist AppleMusic</div>
            <div style={{ color: "#fff", marginBottom: "10px" }}>or</div>
            <div onClick={() => setTargetService('spotify')} style={{ backgroundColor: "#1db954", padding: "15px 10px", borderRadius: "5px", color: "#000", fontWeight: "bold", cursor: "pointer", border: targetService === 'spotify' ? "3px solid black" : "none" }}>New playlist Spotify</div>
          </div>
        </div>
      </div>
      
 <div style={{ marginTop: "100px", borderTop: "1px solid #444", paddingTop: "50px", textAlign: "center", backgroundColor: "#1a1a1a" }}>
    <h3 style={{ fontSize: "24px", color: "#ccc", margin: "0 0 10px 0" }}>Live Connection Data</h3>
    <div style={{ display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap", padding: "20px" }}>
      
      {/* Apple Music Data Box */}
      <div style={{ backgroundColor: "#333", padding: "20px", borderRadius: "8px", width: "450px", textAlign: "left", borderLeft: "5px solid #fa243c", opacity: platformData.apple ? 1 : 0.5 }}>
        <p style={{ fontSize: "18px", fontWeight: "bold" }}>🍎 Apple Music Data</p>
        {platformData.apple ? (
          <>
            <p style={{ color: "#fff", fontWeight: "bold" }}>Playlist: {platformData.apple.detectedPlaylistName || "Unknown"}</p>
            <p style={{ color: "#bbb", fontSize: "14px" }}>Songs in memory: {platformData.apple.songs?.length || 0}</p>
            {/* RESTORED LAST 5 SONGS PREVIEW */}
            <div style={{ marginTop: "10px", backgroundColor: "#222", padding: "10px", borderRadius: "5px", maxHeight: "100px", overflowY: "auto" }}>
              {platformData.apple.songs?.slice(-5).map((s, i) => (
                  <div key={i} style={{ fontSize: "12px", color: "#aaa" }}>{s.title} - {s.artist}</div>
              ))}
            </div>
          </>
        ) : <p style={{ fontSize: "12px", color: "#666" }}>Not scanned yet.</p>}
      </div>

      {/* Spotify Data Box */}
      <div style={{ backgroundColor: "#333", padding: "20px", borderRadius: "8px", width: "450px", textAlign: "left", borderLeft: "5px solid #1db954", opacity: platformData.spotify ? 1 : 0.5 }}>
        <p style={{ fontSize: "18px", fontWeight: "bold" }}>🟢 Spotify Data</p>
        {platformData.spotify ? (
          <>
            <p style={{ color: "#fff", fontWeight: "bold" }}>Playlist: {platformData.spotify.detectedPlaylistName || "Unknown"}</p>
            <p style={{ color: "#bbb", fontSize: "14px" }}>Songs in memory: {platformData.spotify.songs?.length || 0}</p>
            {/* RESTORED LAST 5 SONGS PREVIEW */}
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
    </div>
  );
}

export default App;