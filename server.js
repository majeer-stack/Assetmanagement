const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files (the frontend application)
app.use(express.static(__dirname));

// Initialize database file if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({}));
}

// Global variable to hold state in memory to prevent constant disk reads
let dbCache = null;

function readDB() {
    if (dbCache) return dbCache;
    try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        dbCache = JSON.parse(raw);
        return dbCache;
    } catch (e) {
        console.error("Error reading database:", e);
        return {};
    }
}

function writeDB(data) {
    dbCache = data;
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error writing database:", e);
    }
}

// API Routes
app.get('/api/data', (req, res) => {
    const data = readDB();
    res.json(data);
});

app.post('/api/data', (req, res) => {
    writeDB(req.body);
    res.json({ success: true, message: 'Data saved successfully' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Start Server
app.listen(PORT, () => {
    console.log(`AssetFlow Server running on http://localhost:${PORT}`);
    console.log(`Serving API and static files from ${__dirname}`);
});
