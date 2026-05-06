require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 4000;

// 1. MIDDLEWARE
app.use(cors()); // Standard CORS is fine for local dev
app.use(express.json());

// 2. SUPABASE INITIALIZATION
// Ensure your .env has SUPABASE_URL and SUPABASE_KEY
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- AUTH MIDDLEWARE ---
const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    
    req.user = user;
    next();
};

// --- ROUTES ---

// FIX 1: The Status Check (Fixes "Disconnected 🔴" error)
app.get('/', (req, res) => {
    res.status(200).send('MusicCave Server is Online 🟢');
});

// STATS ENDPOINT
app.get('/api/stats', authenticateUser, async (req, res) => {
    try {
        const { count, error } = await supabase
            .from('user_songs')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', req.user.id);
        
        if (error) throw error;
        res.json({ totalSongs: count || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// FIX 2: The Duplicate Check Route (Fixes "Nothing is adding" error)
// This is required because startTransfer calls this to see what songs to skip
app.get('/api/songs/:platform', authenticateUser, async (req, res) => {
    const { platform } = req.params;
    const playlistName = req.query.playlistName;

    if (!playlistName) {
        return res.status(400).json({ error: "Playlist name is required for strict syncing." });
    }

    // This fetches songs ONLY for the specific platform AND the specific playlist name
    const { data, error } = await supabase
        .from('user_songs')
        .select('title, artist')
        .eq('user_id', req.user.id)
        .eq('platform', platform)
        .ilike('playlist_name', playlistName.trim()); // Case-insensitive exact match

    if (error) return res.status(500).json(error);
    res.json(data);
});

// SYNC ENDPOINT
app.post('/api/sync', authenticateUser, async (req, res) => {
    const { platform, songs, playlistName, overwrite } = req.body;
    const userId = req.user.id;

    try {
        // 1. If this is a full scan, wipe the "ghost" data for this specific playlist
        if (overwrite) {
            console.log(`Overwriting data for: ${playlistName} on ${platform}`);
            const { error: deleteError } = await supabase
                .from('user_songs')
                .delete()
                .eq('user_id', userId)
                .eq('platform', platform)
                .ilike('playlist_name', playlistName.trim());
            
            if (deleteError) throw deleteError;
        }

        // 2. Prepare the fresh data
        const formatted = songs.map(s => ({
            user_id: userId,
            platform: platform,
            playlist_name: playlistName || "Unknown Playlist",
            title: s.title.toLowerCase().trim(),
            artist: s.artist.toLowerCase().trim()
        }));

        // 3. Insert the fresh songs
        const { error: insertError } = await supabase
            .from('user_songs')
            .upsert(formatted, { onConflict: 'user_id,platform,playlist_name,title,artist' });

        if (insertError) throw insertError;

        res.json({ status: "success" });
    } catch (err) {
        console.error("Sync Error:", err);
        res.status(500).json({ error: err.message });
    }
});
// HISTORY ROUTES
app.post('/api/history', authenticateUser, async (req, res) => {
    const { source_platform, target_platform, playlist_name, song_count } = req.body;
    const { error } = await supabase
        .from('transfers')
        .insert([{
            user_id: req.user.id,
            source_platform,
            target_platform,
            playlist_name,
            song_count
        }]);
    if (error) return res.status(500).json(error);
    res.json({ status: "logged" });
});

app.get('/api/history', authenticateUser, async (req, res) => {
    const { data, error } = await supabase
        .from('transfers')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.listen(PORT, () => {
    console.log(`\nMusicCave Server Active`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`Supabase URL check: ${process.env.SUPABASE_URL ? "OK" : "MISSING"}\n`);
});