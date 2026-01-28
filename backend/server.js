require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const Groq = require('groq-sdk');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'brainstack_secret';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(express.static('public'));

// Database Connection
let dbUrl = process.env.DATABASE_URL;

if (dbUrl) {
    try {
        // AUTO-FIX for Supabase Transaction Pooler (port 6543)
        // This is critical: Transaction mode breaks without this flag or if prepared statements are used.
        if (dbUrl.includes(':6543') && !dbUrl.includes('pgbouncer=true')) {
            console.log("🔧 Auto-fixing connection string: Appending '?pgbouncer=true' for Supabase Pooler");
            dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'pgbouncer=true';
        }

        const parsedUrl = new URL(dbUrl.replace('postgres://', 'http://')); 
        console.log(`🔌 Database Host: ${parsedUrl.hostname}, Port: ${parsedUrl.port || '5432'}`);
    } catch (e) {
        console.error("❌ DATABASE_URL parse error");
    }
}

const poolConfig = {
    connectionString: dbUrl,
    // STATELESS MODE: Critical for Supabase Transaction Pooler (port 6543)
    // We disconnect immediately (0ms) to ensure we never hold a stale connection.
    idleTimeoutMillis: 0, 
    connectionTimeoutMillis: 10000, // Fail fast (10s) instead of hanging
    max: 5, // Lower concurrency is better for Transaction mode
    allowExitOnIdle: true,
};

// Enable SSL for non-local databases
if (dbUrl && !dbUrl.includes('localhost') && process.env.DB_SSL !== 'false') {
    poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('🚨 Idle client error:', err.message);
});

// Initial Connection Test with Retry
async function connectWithRetry(retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await pool.query('SELECT NOW()');
            console.log("✅ Database Connected Successfully at", res.rows[0].now);
            return true;
        } catch (err) {
            console.error(`❌ Connection Attempt ${i + 1} Failed:`, err.message);
            if (i < retries - 1) {
                console.log(`Retrying in 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                console.error("💀 All connection attempts failed. Check your DATABASE_URL.");
            }
        }
    }
    return false;
}

connectWithRetry();

app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', db: 'connected' });
    } catch (e) {
        res.status(500).json({ status: 'error', error: e.message });
    }
});

// Middleware
const checkAuth = (req, res, next) => {
    const header = req.headers['authorization'];
    if(!header) return res.status(401).json({ error: 'No token' });
    const token = header.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if(err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// --- ROUTES ---

// 0. AUTH
app.post('/api/auth/register', async (req, res) => {
    const { email, password, display_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    
    try {
        // Check if user exists
        const check = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
        if (check.rows.length > 0) return res.status(409).json({ error: 'User already exists' });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        
        // Insert User
        const result = await pool.query(
            'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING user_id, email, display_name',
            [email, hash, display_name || 'New Learner']
        );
        const user = result.rows[0];

        // Auto-Login
        const token = jwt.sign({ id: user.user_id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { name: user.display_name, email: user.email } });
    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const start = Date.now();
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    
    try {
        console.log(`🔑 Login attempt for: ${email}`);
        
        // 1. Database Query
        const dbStart = Date.now();
        const result = await pool.query('SELECT user_id, email, password_hash, display_name FROM users WHERE email ILIKE $1', [email.trim()]);
        console.log(`   ↳ DB Query took: ${Date.now() - dbStart}ms`);
        
        const user = result.rows[0];
        if (!user) {
            console.log(`   ❌ User not found`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 2. Password Comparison
        const cryptStart = Date.now();
        let isValid = false;
        try {
            isValid = await bcrypt.compare(password, user.password_hash);
        } catch (bcryptErr) {
            // Handle legacy plain-text passwords
            if (String(password).trim() === String(user.password_hash).trim()) {
                isValid = true;
                // Auto-migrate to secure hash
                const salt = await bcrypt.genSalt(10);
                const hash = await bcrypt.hash(password, salt);
                await pool.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hash, user.user_id]);
                console.log(`   🔒 Migrated legacy password`);
            }
        }
        console.log(`   ↳ Bcrypt took: ${Date.now() - cryptStart}ms`);

        if (!isValid) {
             console.log(`   ❌ Invalid password`);
             return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: user.user_id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        console.log(`✅ Login successful in ${Date.now() - start}ms`);
        res.json({ token, user: { name: user.display_name, email: user.email } });
    } catch (err) { 
        console.error("Login Error:", err);
        res.status(500).json({ error: 'Login error' }); 
    }
});

// 1. ENTRIES (Paginated)
app.get('/api/entries', checkAuth, async (req, res) => {
    console.log(`📥 Fetch Entries Request: User ${req.user.id}, Page ${req.query.page}, Search "${req.query.search || ''}"`);
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const search = req.query.search || '';
        const revision = req.query.revision === 'true';
        const category = req.query.category || '';
        const difficulty = parseInt(req.query.difficulty) || null;
        const offset = (page - 1) * limit;

        let whereClause = `WHERE e.user_id = $1`;
        let params = [userId, limit, offset];
        
        if (revision) {
            whereClause += ` AND e.needs_revision = true`;
        }
        
        if (category) {
            params.push(category);
            whereClause += ` AND c.name = $${params.length}`;
        }
        
        if (difficulty) {
            params.push(difficulty);
            whereClause += ` AND e.difficulty_level = $${params.length}`;
        }

        if (search) {
            const searchIdx = params.length + 1;
            params.push(`%${search}%`);
            whereClause += ` AND (e.title ILIKE $${searchIdx} OR e.notes_markdown ILIKE $${searchIdx})`;
        }

        // Count Query
        const countParams = [userId];
        let countWhere = `WHERE user_id = $1`;
        if (revision) countWhere += ` AND needs_revision = true`;
        if (category) {
            countParams.push(category);
            countWhere += ` AND category_id = (SELECT category_id FROM categories WHERE name = $${countParams.length} AND user_id = $1)`;
        }
        if (difficulty) {
            countParams.push(difficulty);
            countWhere += ` AND difficulty_level = $${countParams.length}`;
        }
        if (search) {
            const searchIdx = countParams.length + 1;
            countParams.push(`%${search}%`);
            countWhere += ` AND (title ILIKE $${searchIdx} OR notes_markdown ILIKE $${searchIdx})`;
        }
        
        const countRes = await pool.query(`SELECT COUNT(*) FROM entries ${countWhere}`, countParams);
        const total = parseInt(countRes.rows[0].count);

        const query = `
            SELECT e.entry_id, e.title, e.notes_markdown, e.difficulty_level, e.needs_revision, 
            e.created_at, e.updated_at, TO_CHAR(e.learning_date, 'YYYY-MM-DD') as learning_date, 
            c.name as category_name,
            COALESCE((SELECT array_agg(t.name) FROM entry_tags et JOIN tags t ON et.tag_id = t.tag_id WHERE et.entry_id = e.entry_id), '{}') as tags,
            COALESCE((SELECT array_agg(r.url) FROM resources r WHERE r.entry_id = e.entry_id), '{}') as resources
            FROM entries e LEFT JOIN categories c ON e.category_id = c.category_id
            ${whereClause} 
            ORDER BY e.updated_at DESC 
            LIMIT $2 OFFSET $3
        `;
        const { rows } = await pool.query(query, params);
        // Debugging
        if (revision) console.log(`🔍 Revision Fetch: Found ${rows.length} items for User ${userId}`);
        
        res.json({ data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    } catch (err) { 
        console.error("Fetch Error:", err.message);
        res.status(500).json({ error: 'Fetch failed' }); 
    }
});

// 2. CATEGORIES
app.get('/api/categories', checkAuth, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT name FROM categories WHERE user_id = $1 ORDER BY name', [req.user.id]);
        res.json(rows.map(r => r.name));
    } catch (err) { res.status(500).json({ error: 'Load failed' }); }
});

// 3. STATS
app.get('/api/stats', checkAuth, async (req, res) => {
    try {
        const uid = req.user.id;
        const userToday = req.query.today;

        const counts = await pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE needs_revision = true) as revision FROM entries WHERE user_id = $1`, [uid]);
        const cats = await pool.query(`SELECT c.name, COUNT(e.entry_id) as count FROM entries e JOIN categories c ON e.category_id = c.category_id WHERE e.user_id = $1 GROUP BY c.name`, [uid]);
        const streakRes = await pool.query(`SELECT TO_CHAR(learning_date, 'YYYY-MM-DD') as date FROM entries WHERE user_id = $1 GROUP BY learning_date ORDER BY learning_date DESC`, [uid]);
        
        let streak = 0;
        const dateSet = new Set(streakRes.rows.map(r => r.date));
        
        if (dateSet.size > 0 && userToday) {
            const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            
            let curr = new Date(userToday + 'T00:00:00');
            let yesterday = new Date(curr);
            yesterday.setDate(yesterday.getDate() - 1);
            
            // Start counting from today if exists, otherwise try yesterday to keep streak alive
            let checkDate = dateSet.has(userToday) ? curr : (dateSet.has(fmt(yesterday)) ? yesterday : null);
            
            if (checkDate) {
                streak = 1;
                let walk = new Date(checkDate);
                while (true) {
                    walk.setDate(walk.getDate() - 1);
                    let formatted = fmt(walk);
                    if (dateSet.has(formatted)) {
                        streak++;
                    } else {
                        break;
                    }
                }
            }
        }

        const activity = await pool.query(`SELECT TO_CHAR(learning_date, 'YYYY-MM-DD') as learning_date, COUNT(*) as count FROM entries WHERE user_id = $1 AND learning_date > CURRENT_DATE - INTERVAL '7 days' GROUP BY learning_date ORDER BY learning_date ASC`, [uid]);
        const heatmap = await pool.query(`SELECT TO_CHAR(learning_date, 'YYYY-MM-DD') as learning_date, COUNT(*) as count FROM entries WHERE user_id = $1 AND learning_date > CURRENT_DATE - INTERVAL '1 year' GROUP BY learning_date`, [uid]);

        res.json({ total: parseInt(counts.rows[0].total), revision: parseInt(counts.rows[0].revision), categories: cats.rows, streak, activity: activity.rows, heatmap: heatmap.rows });
    } catch (err) { res.status(500).json({ error: 'Stats failed' }); }
});

// 4. EXPORT
app.get('/api/export', checkAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const query = `
            SELECT e.*, TO_CHAR(e.learning_date, 'YYYY-MM-DD') as learning_date, c.name as category_name,
            COALESCE((SELECT array_agg(t.name) FROM entry_tags et JOIN tags t ON et.tag_id = t.tag_id WHERE et.entry_id = e.entry_id), '{}') as tags,
            COALESCE((SELECT array_agg(r.url) FROM resources r WHERE r.entry_id = e.entry_id), '{}') as resources
            FROM entries e LEFT JOIN categories c ON e.category_id = c.category_id
            WHERE e.user_id = $1 ORDER BY e.created_at ASC
        `;
        const { rows } = await pool.query(query, [userId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Export failed' }); }
});

// 5. AI ROUTES
app.post('/api/ai/global-chat', checkAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { message, history } = req.body;
        
        // 1. Better Keyword Extraction for Context Retrieval
        const cleanMsg = message.toLowerCase().replace(/[^\w\s]/gi, '');
        const stopwords = new Set(['what', 'is', 'how', 'tell', 'me', 'about', 'the', 'this', 'that', 'with']);
        const keywords = cleanMsg.split(' ')
            .filter(w => w.length > 2 && !stopwords.has(w))
            .sort((a,b) => b.length - a.length);
        
        const topKeyword = keywords[0] || message.split(' ')[0] || '';

        // 2. Fetch Relevant Context
        let notesRes = await pool.query(
            `SELECT title, notes_markdown as content FROM entries 
             WHERE user_id = $1 AND (title ILIKE $2 OR notes_markdown ILIKE $2) 
             ORDER BY updated_at DESC LIMIT 10`, 
            [userId, `%${topKeyword}%`]
        );
        
        if (notesRes.rows.length === 0) {
            notesRes = await pool.query(
                'SELECT title, notes_markdown as content FROM entries WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 5', 
                [userId]
            );
        }

        const context = notesRes.rows.map(n => `### ${n.title}\n${n.content}`).join('\n\n---\n\n');
        
        const messages = [
            { 
                role: "system", 
                content: `You are "BrainStack AI", a professional second-brain assistant. 
                Use the following notes from the user's library to answer their question. 
                If the answer isn't in the notes, use your general knowledge but mention it's not in their notes.
                FORMATTING: Use clear Markdown. Use code blocks for any technical snippets.
                
                USER NOTES CONTEXT:
                ${context}` 
            }
        ];

        // 3. Append History (Limit to last 6 messages for token efficiency)
        if (history && Array.isArray(history)) {
            history.slice(-6).forEach(msg => messages.push({ role: msg.role, content: msg.content }));
        }
        
        messages.push({ role: "user", content: message });

        const completion = await groq.chat.completions.create({ 
            messages, 
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            max_tokens: 1024
        });

        res.json({ text: completion.choices[0]?.message?.content || "I couldn't generate a response." });
    } catch (err) { 
        console.error("AI Chat Error:", err);
        res.status(500).json({ error: 'AI Assistant is currently unavailable.' }); 
    }
});

app.post('/api/ai/summarize', checkAuth, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: 'No content' });

        const messages = [
            { role: "system", content: "You are a helpful assistant. Summarize the following note into exactly 3 concise bullet points. Return ONLY the bullet points, nothing else." },
            { role: "user", content: content }
        ];

        const completion = await groq.chat.completions.create({ messages, model: "llama-3.3-70b-versatile" });
        res.json({ summary: completion.choices[0]?.message?.content });
    } catch (err) { 
        console.error("AI Summarize Error:", err);
        res.status(500).json({ error: err.message || 'AI summary failed' }); 
    }
});

// 6. CREATE / UPDATE / DELETE
app.post('/api/entries', checkAuth, async (req, res) => {
    const { title, category_name, date, notes, difficulty, needs_revision, resources, tags } = req.body;
    const userId = req.user.id;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        let cat = await client.query('SELECT category_id FROM categories WHERE name = $1 AND user_id = $2', [category_name, userId]);
        let cid = cat.rows.length > 0 ? cat.rows[0].category_id : (await client.query('INSERT INTO categories (name, user_id) VALUES ($1, $2) RETURNING category_id', [category_name, userId])).rows[0].category_id;
        const ent = await client.query(`INSERT INTO entries (title, user_id, category_id, learning_date, notes_markdown, difficulty_level, needs_revision) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING entry_id`, [title, userId, cid, date, notes, difficulty, needs_revision]);
        const eid = ent.rows[0].entry_id;
        if (resources) for (const url of resources) await client.query('INSERT INTO resources (entry_id, url) VALUES ($1, $2)', [eid, url]);
        if (tags) for (const t of tags) {
            let tr = await client.query('SELECT tag_id FROM tags WHERE name = $1', [t]);
            let tid = tr.rows.length > 0 ? tr.rows[0].tag_id : (await client.query('INSERT INTO tags (name) VALUES ($1) RETURNING tag_id', [t])).rows[0].tag_id;
            await client.query('INSERT INTO entry_tags (entry_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eid, tid]);
        }
        await client.query('COMMIT'); res.json({ success: true });
    } catch (e) { if(client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Save failed' }); } finally { if(client) client.release(); }
});

app.put('/api/entries/:id', checkAuth, async (req, res) => {
    const { title, category_name, date, notes, difficulty, needs_revision, resources, tags } = req.body;
    const userId = req.user.id; const eid = req.params.id;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        let cat = await client.query('SELECT category_id FROM categories WHERE name = $1 AND user_id = $2', [category_name, userId]);
        let cid = cat.rows.length > 0 ? cat.rows[0].category_id : (await client.query('INSERT INTO categories (name, user_id) VALUES ($1, $2) RETURNING category_id', [category_name, userId])).rows[0].category_id;
        await client.query(`UPDATE entries SET title = $1, category_id = $2, learning_date = $3, notes_markdown = $4, difficulty_level = $5, needs_revision = $6, updated_at = NOW() WHERE entry_id = $7 AND user_id = $8`, [title, cid, date, notes, difficulty, needs_revision, eid, userId]);
        await client.query('DELETE FROM resources WHERE entry_id = $1', [eid]);
        if (resources) for (const url of resources) await client.query('INSERT INTO resources (entry_id, url) VALUES ($1, $2)', [eid, url]);
        await client.query('DELETE FROM entry_tags WHERE entry_id = $1', [eid]);
        if (tags) for (const t of tags) {
            let tr = await client.query('SELECT tag_id FROM tags WHERE name = $1', [t]);
            let tid = tr.rows.length > 0 ? tr.rows[0].tag_id : (await client.query('INSERT INTO tags (name) VALUES ($1) RETURNING tag_id', [t])).rows[0].tag_id;
            await client.query('INSERT INTO entry_tags (entry_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eid, tid]);
        }
        await client.query('COMMIT'); res.json({ success: true });
    } catch (e) { if(client) await client.query('ROLLBACK'); res.status(500).json({ error: 'Update failed' }); } finally { if(client) client.release(); }
});

app.delete('/api/danger/clear-all', checkAuth, async (req, res) => {
    const userId = req.user.id;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query('DELETE FROM resources WHERE entry_id IN (SELECT entry_id FROM entries WHERE user_id = $1)', [userId]);
        await client.query('DELETE FROM entry_tags WHERE entry_id IN (SELECT entry_id FROM entries WHERE user_id = $1)', [userId]);
        await client.query('DELETE FROM entries WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM categories WHERE user_id = $1', [userId]);
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) { 
        if(client) await client.query('ROLLBACK');
        console.error("Nuke Route Error:", e);
        res.status(500).json({ error: 'Nuke failed' }); 
    } finally { 
        if(client) client.release(); 
    }
});

app.delete('/api/entries/:id', checkAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM entries WHERE entry_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (e) {
        console.error("Delete Entry Error:", e);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// 7. PROFILE
app.get('/api/profile', checkAuth, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT display_name as name, bio FROM users WHERE user_id = $1', [req.user.id]);
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: 'Profile failed' }); }
});

app.put('/api/profile', checkAuth, async (req, res) => {
    try {
        const { name, bio } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
        await pool.query('UPDATE users SET display_name = $1, bio = $2 WHERE user_id = $3', [name.trim(), bio, req.user.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Profile failed' }); }
});

// 8. SPA ROUTING
app.get('*', (req, res) => res.sendFile(__dirname + '/public/index.html'));

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));