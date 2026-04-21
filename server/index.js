require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 4000;

// 1. MIDDLEWARE (Crucial for the "Checking..." status to go away)
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. ROOT ROUTE (This fixes the "Checking..." status)
app.get('/', (req, res) => {
    res.status(200).send('MusicCave Server is Online 🟢');
});

// 3. STATS ENDPOINT (For the Analytics Pill)
app.get('/api/stats', async (req, res) => {
    try {
        const { count, error } = await supabase
            .from('user_songs')
            .select('*', { count: 'exact', head: true });
        
        if (error) throw error;
        res.json({ totalSongs: count || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1. Update Sync to accept playlistName
app.post('/api/sync', async (req, res) => {
    const { platform, songs, playlistName } = req.body; // Added playlistName
    
    const formatted = songs.map(s => ({
        user_id: 'test-user-1',
        platform: platform,
        playlist_name: playlistName || "Unknown Playlist", // Save the name!
        title: s.title.toLowerCase().trim(),
        artist: s.artist.toLowerCase().trim()
    }));

    const { error } = await supabase
        .from('user_songs')
        .upsert(formatted, { onConflict: 'user_id,platform,playlist_name,title,artist' });

    if (error) return res.status(500).json(error);
    res.json({ status: "success" });
});

// 2. Update Get Songs to filter by playlist (Optional but better)
app.get('/api/songs/:platform', async (req, res) => {
    const { platform } = req.params;
    const playlistName = req.query.playlistName; // Get from URL query

    let query = supabase
        .from('user_songs')
        .select('title, artist')
        .eq('user_id', 'test-user-1')
        .eq('platform', platform);

    if (playlistName) {
        query = query.eq('playlist_name', playlistName.toLowerCase().trim());
    }

    const { data, error } = await query;
    if (error) return res.status(500).json(error);
    res.json(data);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));