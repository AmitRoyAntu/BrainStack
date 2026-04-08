-- 1. CLEANUP (Ensures a fresh start)
DROP TABLE IF EXISTS entry_tags CASCADE;
DROP TABLE IF EXISTS resources CASCADE;
DROP TABLE IF EXISTS entries CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. CREATE TABLES
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) DEFAULT 'New User',
    bio TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

CREATE TABLE entries (
    entry_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id) ON DELETE CASCADE,
    category_id INT REFERENCES categories(category_id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    notes_markdown TEXT,
    difficulty_level INT DEFAULT 1,
    needs_revision BOOLEAN DEFAULT FALSE,
    learning_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. RESOURCES TABLE (Links)
CREATE TABLE resources (
    resource_id SERIAL PRIMARY KEY,
    entry_id INT REFERENCES entries(entry_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title VARCHAR(255)
);

-- 6. TAGS SYSTEM
CREATE TABLE tags (
    tag_id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE entry_tags (
    entry_id INT REFERENCES entries(entry_id) ON DELETE CASCADE,
    tag_id INT REFERENCES tags(tag_id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, tag_id)
);

-- 7. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_entries_user_updated ON entries(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_user_revision ON entries(user_id, needs_revision) WHERE needs_revision = TRUE;
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_entry_tags_entry ON entry_tags(entry_id);
