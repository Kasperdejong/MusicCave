import { useState, useEffect } from 'react';

const EXTENSION_ID = "clammlphhicbgjpmjbgiedegkepkabcp";

function App() {
  const [serverStatus, setServerStatus] = useState("Checking...");
  const [applePlaylists, setApplePlaylists] = useState(null);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [transferMode, setTransferMode] = useState("transfer_fill");

  // --- SEARCH STATES ---
  const [appleSearch, setAppleSearch] = useState("");
  const [spotifySearch, setSpotifySearch] = useState("");

  // --- PERSISTENT PLATFORM DATA (Remembering both) ---
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
  }, []);

  const getPlaylistIcon = (name) => {
    const n = name.toLowerCase();
    if (n.includes("liked") || n.includes("favourite") || n.includes("leuk vindt") || n.includes("liked songs")) {
      return "❤️";
    }
    return "";
  };

  const scanPlatform = (platform) => {
    setErrorMsg("");
    window.chrome.runtime.sendMessage(
      EXTENSION_ID,
      { action: "SCAN_SPECIFIC_PLATFORM", platform: platform },
      (response) => {
        if (response && response.tabsData && response.tabsData.length > 0) {
          const data = response.tabsData[0];
          
          setPlatformData(prev => ({
            ...prev,
            [platform]: data
          }));

          if (platform === 'apple') setApplePlaylists(data.playlists);
          if (platform === 'spotify') setSpotifyPlaylists(data.playlists);
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

  const startTransfer = async () => {
    const sourcePlatform = targetService === 'spotify' ? 'apple' : 'spotify';
    const sourceSelection = targetService === 'spotify' ? selectedApple : selectedSpotify;
    
    const destinationSelection = targetService === 'spotify' ? selectedSpotify : selectedApple;
    const targetNameString = destinationSelection ? destinationSelection.name : "New";

    if (!targetService) {
      setErrorMsg("Please select a Target Service box.");
      return;
    }
    
    if (!sourceSelection) {
      setErrorMsg(`Please select a source playlist.`);
      return;
    }

    const sourceData = platformData[sourcePlatform];
    if (!sourceData || !sourceData.songs) {
        setErrorMsg(`Please scan ${sourcePlatform} first.`);
        return;
    }

    setIsTransferring(true);
    const songs = sourceData.songs;
    const action = targetService === 'spotify' ? "TRANSFER_SONG_TO_SPOTIFY" : "TRANSFER_SONG_TO_APPLE";

    for (let i = 0; i < songs.length; i++) {
      setTransferStatus(`Moving: ${songs[i].title}`);
      
      await new Promise((resolve) => {
        window.chrome.runtime.sendMessage(
          EXTENSION_ID,
          { 
            action: action, 
            song: songs[i], 
            targetName: targetNameString 
          },
          (response) => {
            console.log("Robot response:", response);
            setTimeout(resolve, 2500); 
          }
        );
      });
    }

    setIsTransferring(false);
    setTransferStatus("✅ All songs processed!");
  };

  const searchInputStyle = {
    width: "100%",
    padding: "8px",
    marginBottom: "10px",
    borderRadius: "5px",
    border: "none",
    backgroundColor: "#eee",
    color: "#333",
    fontSize: "14px",
    boxSizing: "border-box",
    outline: "none"
  };

  return (
    <div style={{ backgroundColor: "#222", color: "#fff", minHeight: "100vh", fontFamily: "sans-serif", paddingBottom: "50px" }}>

      <div style={{ backgroundColor: "#6a0dad", padding: "15px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "20px", fontWeight: "bold" }}>
          <img src="/Logo.png" alt="MusicCave Logo" style={{ height: "35px", width: "auto" }} />
          MusicCave Dashboard
        </div>
        <div style={{ fontSize: "14px", fontWeight: "bold" }}>Server: {serverStatus}</div>
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

        <h3 style={{ fontSize: "28px", marginTop: "50px", fontWeight: "normal" }}>Select playlists to transfer and fill</h3>

        {errorMsg && <p style={{ color: "#ff4d4d", fontSize: "18px" }}>⚠️ {errorMsg}</p>}

        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", gap: "20px", marginTop: "30px", flexWrap: "wrap" }}>

          {/* Apple Music Column */}
          <div style={{ backgroundColor: "#999", borderRadius: "10px", padding: "20px", width: "250px", minHeight: "300px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* Search Bar */}
              <input 
                type="text" 
                placeholder="Search Apple..." 
                value={appleSearch}
                onChange={(e) => setAppleSearch(e.target.value)}
                style={searchInputStyle}
              />
              <div style={{ maxHeight: "250px", overflowY: "auto", paddingRight: "5px" }}>
                {filteredApple ? filteredApple.map((pl, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedApple(pl)}
                    style={{ 
                      backgroundColor: selectedApple?.name === pl.name ? "#b31b2d" : "#fa243c", 
                      padding: "10px", borderRadius: "5px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "10px", color: "#fff", cursor: "pointer",
                      border: selectedApple?.name === pl.name ? "2px solid white" : "none"
                    }}>
                    <span>{getPlaylistIcon(pl.name)}</span>
                    <span style={{ flexGrow: 1, textAlign: "left" }}>{pl.name}</span>
                  </div>
                )) : <p style={{ color: "#333", fontStyle: "italic" }}>No playlists loaded.</p>}
              </div>
            </div>
            <button onClick={() => scanPlatform('apple')} style={{ backgroundColor: "#6a0dad", color: "white", border: "none", padding: "10px", borderRadius: "5px", cursor: "pointer", marginTop: "20px", fontWeight: "bold" }}>Scan appleMusic</button>
          </div>

          <div style={{ marginTop: "120px" }}>
            <select
              value={transferMode}
              onChange={(e) => setTransferMode(e.target.value)}
              style={{ backgroundColor: "#6a0dad", color: "white", border: "none", padding: "8px 15px", borderRadius: "5px", cursor: "pointer", fontSize: "14px", outline: "none", fontWeight: "bold" }}
            >
              <option value="transfer_fill">transfer & fill ▼</option>
              <option value="clean_transfer">clean transfer ▼</option>
            </select>
          </div>

          {/* Spotify Column */}
          <div style={{ backgroundColor: "#999", borderRadius: "10px", padding: "20px", width: "250px", minHeight: "300px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* Search Bar */}
              <input 
                type="text" 
                placeholder="Search Spotify..." 
                value={spotifySearch}
                onChange={(e) => setSpotifySearch(e.target.value)}
                style={searchInputStyle}
              />
              <div style={{ maxHeight: "250px", overflowY: "auto", paddingRight: "5px" }}>
                {filteredSpotify ? filteredSpotify.map((pl, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedSpotify(pl)}
                    style={{ 
                      backgroundColor: selectedSpotify?.name === pl.name ? "#15833b" : "#1db954", 
                      padding: "10px", borderRadius: "5px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "10px", color: "#000", fontWeight: "500", cursor: "pointer",
                      border: selectedSpotify?.name === pl.name ? "2px solid black" : "none"
                    }}>
                    <span>{getPlaylistIcon(pl.name)}</span>
                    <span style={{ flexGrow: 1, textAlign: "left" }}>{pl.name}</span>
                  </div>
                )) : <p style={{ color: "#333", fontStyle: "italic" }}>No playlists loaded.</p>}
              </div>
            </div>
            <button onClick={() => scanPlatform('spotify')} style={{ backgroundColor: "#6a0dad", color: "white", border: "none", padding: "10px", borderRadius: "5px", cursor: "pointer", marginTop: "20px", fontWeight: "bold" }}>Scan Spotify</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "100px" }}>
            <span style={{ fontSize: "18px", margin: "0 10px", color: "#ccc" }}>into ──→</span>
            <button 
              onClick={startTransfer}
              disabled={isTransferring}
              style={{ 
                marginTop: "20px", 
                backgroundColor: isTransferring ? "#555" : "#1db954", 
                color: "#fff", 
                border: "none", 
                padding: "15px 30px", 
                borderRadius: "50px", 
                fontWeight: "bold", 
                fontSize: "16px",
                cursor: isTransferring ? "not-allowed" : "pointer",
                boxShadow: "0 4px 15px rgba(29, 185, 84, 0.4)"
              }}
            >
              {isTransferring ? "TRANSFERRING..." : "START TRANSFER"}
            </button>
          </div>

          <div style={{ backgroundColor: "#999", borderRadius: "10px", padding: "20px", width: "180px", marginTop: "60px" }}>
            <div 
                onClick={() => setTargetService('apple')}
                style={{ 
                    backgroundColor: "#fa243c", padding: "15px 10px", borderRadius: "5px", marginBottom: "10px", color: "#fff", fontWeight: "bold", cursor: "pointer",
                    border: targetService === 'apple' ? "3px solid white" : "none",
                    opacity: targetService === 'apple' ? 1 : 0.7
                }}>
                New playlist AppleMusic
            </div>
            <div style={{ color: "#fff", marginBottom: "10px" }}>or</div>
            <div 
                onClick={() => setTargetService('spotify')}
                style={{ 
                    backgroundColor: "#1db954", padding: "15px 10px", borderRadius: "5px", color: "#000", fontWeight: "bold", cursor: "pointer",
                    border: targetService === 'spotify' ? "3px solid black" : "none",
                    opacity: targetService === 'spotify' ? 1 : 0.7
                }}>
                New playlist Spotify
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "100px", borderTop: "1px solid #444", paddingTop: "50px", textAlign: "center", backgroundColor: "#1a1a1a" }}>
        <h3 style={{ fontSize: "24px", color: "#ccc", margin: "0 0 10px 0" }}>Live Connection Data</h3>
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap", padding: "20px" }}>
          
          <div style={{
              backgroundColor: "#333", padding: "20px", borderRadius: "8px", width: "450px", textAlign: "left",
              borderLeft: "5px solid #fa243c", opacity: platformData.apple ? 1 : 0.5
          }}>
            <p style={{ fontSize: "18px", fontWeight: "bold" }}>🍎 Apple Music Data</p>
            {platformData.apple ? (
              <>
                <p style={{ color: "#bbb", fontSize: "14px" }}>Songs in memory: {platformData.apple.songs?.length || 0}</p>
                <div style={{ marginTop: "10px", backgroundColor: "#222", padding: "10px", borderRadius: "5px", maxHeight: "100px", overflowY: "auto" }}>
                  {platformData.apple.songs?.slice(-5).map((s, i) => (
                      <div key={i} style={{ fontSize: "12px", color: "#aaa" }}>{s.title} - {s.artist}</div>
                  ))}
                </div>
              </>
            ) : <p style={{ fontSize: "12px", color: "#666" }}>Not scanned yet.</p>}
          </div>

          <div style={{
              backgroundColor: "#333", padding: "20px", borderRadius: "8px", width: "450px", textAlign: "left",
              borderLeft: "5px solid #1db954", opacity: platformData.spotify ? 1 : 0.5
          }}>
            <p style={{ fontSize: "18px", fontWeight: "bold" }}>🟢 Spotify Data</p>
            {platformData.spotify ? (
              <>
                <p style={{ color: "#bbb", fontSize: "14px" }}>Songs in memory: {platformData.spotify.songs?.length || 0}</p>
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