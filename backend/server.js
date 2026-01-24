require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Serve Static Frontend Files
app.use(express.static('public'));

// Debug: Log the connection string (Masking the password)
const dbUrl = process.env.DATABASE_URL || '';
const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
console.log(`🔌 Attempting to connect to: ${maskedUrl}`);

// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Supabase/Neon/Render
    }
});

// Test Connection on Startup & Ensure Default User
pool.query('SELECT NOW()', async (err, res) => {
    if (err) {
        console.error("❌ Database Connection Failed:", err);
    } else {
        console.log("✅ Database Connected Successfully");
        
        // Ensure Default User (ID 1) exists so foreign keys work
        try {
            await pool.query(`
                INSERT INTO users (user_id, email, password_hash, display_name)
                VALUES (1, 'demo@brainstack.app', 'demo', 'Jane Dev')
                ON CONFLICT (user_id) DO NOTHING
            `);
            console.log("👤 Default User Verified");
        } catch (uErr) {
            console.error("⚠️ Could not verify default user:", uErr);
        }
    }
});

// ==========================================
// API ROUTES
// ==========================================

// 0. AUTH: VERIFY PIN
app.post('/api/auth/verify', (req, res) => {
    const { pin } = req.body;
    const correctPin = process.env.GLOBAL_PIN || '1234';
    
    if (pin === correctPin) {
        res.json({ success: true, message: 'Authenticated' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid PIN' });
    }
});

// 1. GET ALL ENTRIES (With Pagination & Search)
app.get('/api/entries', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        // Base WHERE clause
        let whereClause = `WHERE e.user_id = 1`;
        let params = [limit, offset];
        let paramCount = 3; // $1 is limit, $2 is offset

        if (search) {
            params.push(`%${search}%`);
            whereClause += ` AND (
                e.title ILIKE $${paramCount} OR 
                e.notes_markdown ILIKE $${paramCount} OR
                EXISTS (
                    SELECT 1 FROM entry_tags et 
                    JOIN tags t ON et.tag_id = t.tag_id 
                    WHERE et.entry_id = e.entry_id AND t.name ILIKE $${paramCount}
                )
            )`;
        }

        // Get total count (considering search)
        // We need to construct the count query dynamically too
        const countQuery = `
            SELECT COUNT(*) 
            FROM entries e 
            ${whereClause}
        `;
        // For count, we only need the search param if it exists
        const countParams = search ? [`%${search}%`] : [];
        // Note: The param index in countQuery will be $1 if search exists. 
        // We need to adjust the count query placeholders or just pass the specific value.
        // Simpler approach for count:
        const finalCountQuery = countQuery.replace(/\$\d+/g, '$1'); 
        
        const countRes = await pool.query(finalCountQuery, countParams);
        const totalEntries = parseInt(countRes.rows[0].count);

        const query = `
            SELECT 
                e.entry_id, 
                e.title, 
                c.name as category_name, 
                e.learning_date, 
                e.notes_markdown, 
                e.difficulty_level, 
                e.needs_revision, 
                e.created_at,
                e.updated_at,
                COALESCE(
                    (SELECT array_agg(t.name) FROM entry_tags et JOIN tags t ON et.tag_id = t.tag_id WHERE et.entry_id = e.entry_id), 
                    '{}'
                ) as tags,
                COALESCE(
                    (SELECT array_agg(r.url) FROM resources r WHERE r.entry_id = e.entry_id), 
                    '{}'
                ) as resources
            FROM entries e
            LEFT JOIN categories c ON e.category_id = c.category_id
            ${whereClause}
            ORDER BY e.updated_at DESC
            LIMIT $1 OFFSET $2
        `;
        
        const { rows } = await pool.query(query, params);
        
        res.json({
            data: rows,
            pagination: {
                total: totalEntries,
                page: page,
                limit: limit,
                totalPages: Math.ceil(totalEntries / limit)
            }
        });
    } catch (err) {
        console.error("Error fetching entries:", err);
        res.status(500).json({ error: 'Failed to fetch entries' });
    }
});

// 1b. GET ALL CATEGORIES
app.get('/api/categories', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT name FROM categories WHERE user_id = 1 ORDER BY name');
        res.json(rows.map(r => r.name));
    } catch (err) {
        res.status(500).json({ error: 'Failed to load categories' });
    }
});

// 2. CREATE NEW ENTRY
app.post('/api/entries', async (req, res) => {
    const { title, category_name, date, notes, difficulty, needs_revision, resources, tags } = req.body;
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN'); // Start Transaction

        // A. Handle Category (Find or Create)
        // Hardcoding user_id=1 for now since we don't have login yet
        let catResult = await client.query('SELECT category_id FROM categories WHERE name = $1', [category_name]);
        let category_id;
        
        if (catResult.rows.length > 0) {
            category_id = catResult.rows[0].category_id;
        } else {
            const newCat = await client.query(
                'INSERT INTO categories (name, user_id) VALUES ($1, 1) RETURNING category_id', 
                [category_name]
            );
            category_id = newCat.rows[0].category_id;
        }

        // B. Insert Entry
        const entryResult = await client.query(
            `INSERT INTO entries (title, user_id, category_id, learning_date, notes_markdown, difficulty_level, needs_revision) 
             VALUES ($1, 1, $2, $3, $4, $5, $6) RETURNING entry_id, created_at`,
            [title, category_id, date, notes, difficulty, needs_revision]
        );
        const entryId = entryResult.rows[0].entry_id;

        // C. Insert Resources
        if (resources && resources.length > 0) {
            for (const url of resources) {
                await client.query(
                    'INSERT INTO resources (entry_id, url) VALUES ($1, $2)',
                    [entryId, url]
                );
            }
        }

        // D. Handle Tags
        if (tags && tags.length > 0) {
            for (const tagName of tags) {
                // Find or Create Tag
                let tagRes = await client.query('SELECT tag_id FROM tags WHERE name = $1', [tagName]);
                let tagId;
                
                if (tagRes.rows.length > 0) {
                    tagId = tagRes.rows[0].tag_id;
                } else {
                    const newTag = await client.query('INSERT INTO tags (name) VALUES ($1) RETURNING tag_id', [tagName]);
                    tagId = newTag.rows[0].tag_id;
                }
                
                // Link Entry to Tag
                await client.query(
                    'INSERT INTO entry_tags (entry_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [entryId, tagId]
                );
            }
        }

        await client.query('COMMIT'); // Commit Transaction
        
        // Return the formatted object expected by frontend
        res.json({
            id: entryResult.rows[0].entry_id, // Use DB ID
            timestamp: entryResult.rows[0].created_at, // Use DB time
            success: true
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to save entry' });
    } finally {
        client.release();
    }
});

// 3. UPDATE ENTRY
app.put('/api/entries/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`📝 UPDATE Request for ID: ${id}`, req.body);
    
    const { title, category_name, date, notes, difficulty, needs_revision, resources, tags } = req.body;
    
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // A. Handle Category (Find or Create)
        let category_id = null;
        if (category_name) {
            let catResult = await client.query('SELECT category_id FROM categories WHERE name = $1', [category_name]);
            
            if (catResult.rows.length > 0) {
                category_id = catResult.rows[0].category_id;
            } else {
                const newCat = await client.query(
                    'INSERT INTO categories (name, user_id) VALUES ($1, 1) RETURNING category_id', 
                    [category_name]
                );
                category_id = newCat.rows[0].category_id;
            }
        }

        // B. Update Entry Fields
        // We use explicit values because the frontend sends the full state of the entry.
        // If we used COALESCE, we couldn't easily unset values (though most here aren't nullable).
        const result = await client.query(
            `UPDATE entries SET 
                title = $1, 
                category_id = $2,
                learning_date = $3, 
                notes_markdown = $4, 
                difficulty_level = $5,
                needs_revision = $6,
                updated_at = NOW() 
             WHERE entry_id = $7 RETURNING *`,
            [title, category_id, date, notes, difficulty, needs_revision, id]
        );
        
        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Entry not found' });
        }

        // C. Update Resources (Delete All & Re-insert)
        // We treat the 'resources' array as the Source of Truth.
        await client.query('DELETE FROM resources WHERE entry_id = $1', [id]);
        if (resources && resources.length > 0) {
            for (const url of resources) {
                await client.query(
                    'INSERT INTO resources (entry_id, url) VALUES ($1, $2)',
                    [id, url]
                );
            }
        }

        // D. Update Tags (Delete All & Re-insert)
        // We treat the 'tags' array as the Source of Truth.
        await client.query('DELETE FROM entry_tags WHERE entry_id = $1', [id]);
        if (tags && tags.length > 0) {
            for (const tagName of tags) {
                // Find or Create Tag
                let tagRes = await client.query('SELECT tag_id FROM tags WHERE name = $1', [tagName]);
                let tagId;
                
                if (tagRes.rows.length > 0) {
                    tagId = tagRes.rows[0].tag_id;
                } else {
                    const newTag = await client.query('INSERT INTO tags (name) VALUES ($1) RETURNING tag_id', [tagName]);
                    tagId = newTag.rows[0].tag_id;
                }
                
                // Link Entry to Tag
                await client.query(
                    'INSERT INTO entry_tags (entry_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [id, tagId]
                );
            }
        }

        // E. Cleanup Unused Tags & Categories
        await cleanupTagsAndCategories(client);

        await client.query('COMMIT');
        console.log("✅ Update Success:", result.rows[0]);
        res.json(result.rows[0]);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Update Failed:", err);
        res.status(500).json({ error: 'Failed to update' });
    } finally {
        client.release();
    }
});

// Helper: Cleanup Unused Tags & Categories
async function cleanupTagsAndCategories(client) {
    // 1. Delete Tags not used by any entry
    await client.query(`
        DELETE FROM tags 
        WHERE tag_id NOT IN (SELECT DISTINCT tag_id FROM entry_tags)
    `);
    
    // 2. Delete Categories not used by any entry (ignoring NULL category_ids in entries)
    await client.query(`
        DELETE FROM categories 
        WHERE category_id NOT IN (SELECT DISTINCT category_id FROM entries WHERE category_id IS NOT NULL)
    `);
}

// 4. DELETE ENTRY
app.delete('/api/entries/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM entries WHERE entry_id = $1', [req.params.id]);
        
        // Cleanup after delete
        await cleanupTagsAndCategories(client);
        
        await client.query('COMMIT');
        res.json({ message: 'Deleted' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to delete' });
    } finally {
        client.release();
    }
});

// 5. GET USER PROFILE
app.get('/api/profile', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT display_name as name, bio FROM users WHERE user_id = 1');
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load profile' });
    }
});

// 6. UPDATE USER PROFILE
app.put('/api/profile', async (req, res) => {
    const { name, bio } = req.body;
    try {
        await pool.query(
            'UPDATE users SET display_name = $1, bio = $2 WHERE user_id = 1',
            [name, bio]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// 7. DANGER: CLEAR ALL DATA
app.delete('/api/danger/clear-all', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Delete all entries for user 1 (Cascades to resources and entry_tags)
        await client.query('DELETE FROM entries WHERE user_id = 1');
        
        // Delete all categories for user 1
        await client.query('DELETE FROM categories WHERE user_id = 1');
        
        // Delete tags that are now unused (Global tags)
        await client.query(`
            DELETE FROM tags 
            WHERE tag_id NOT IN (SELECT DISTINCT tag_id FROM entry_tags)
        `);

        await client.query('COMMIT');
        res.json({ success: true, message: 'All data cleared' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Clear All Failed:", err);
        res.status(500).json({ error: 'Failed to clear data' });
    } finally {
        client.release();
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// Fallback for SPA (Must be last)
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});