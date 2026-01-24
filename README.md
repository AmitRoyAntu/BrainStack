# 🧠 BrainStack - Personal Learning Tracker

BrainStack is a robust, full-stack personal knowledge management system designed to help you track your learning journey. It combines the simplicity of a note-taking app with the power of a revision system, ensuring you retain what you learn.

## ✨ Key Features

- **📊 Dynamic Dashboard:**
    - Real-time statistics on total entries, streaks, and revision needs.
    - Visual charts for difficulty distribution and top categories.
    - "Recent Activity" feed sorted by your most recently updated notes.

- **📚 Advanced Library:**
    - **Global Search:** Instantly find notes by title, content, or tags.
    - **Smart Filters:** Filter by Category (e.g., "Frontend") and Difficulty (1-5 stars).
    - **Tag System:** Organize knowledge with flexible tags (e.g., `#react`, `#sql`).

- **✍️ Rich Note Taking:**
    - **Markdown Support:** Write notes with headings, lists, code blocks, and bold/italic text.
    - **Live Preview:** See how your Markdown looks instantly.
    - **Resource Links:** Save and manage external tutorial links.

- **⚡ Revision System:**
    - Flag notes with "Needs Revision".
    - **Flashcard Mode:** A focused interface to review difficult topics one by one.

- **💾 Data Management:**
    - **Import/Export:** Full JSON backup and restore functionality.
    - **Clean Database:** Automatic cleanup of unused tags and categories.
    - **Safety:** "Danger Zone" for data clearing with double-confirmation protection.

- **🎨 User Experience:**
    - **Dark/Light Mode:** Toggle themes for comfortable reading.
    - **Local Time:** All dates and times respect your local system timezone.

## 🛠️ Tech Stack

- **Frontend:**
    - Vanilla JavaScript (ES6+)
    - HTML5 & CSS3 (Custom Grid/Flexbox Layouts)
    - CSS Variables for Theming

- **Backend:**
    - **Runtime:** Node.js
    - **Framework:** Express.js
    - **Database:** PostgreSQL (Optimized for Supabase/Neon)
    - **Driver:** `pg` (node-postgres)

## 🚀 Getting Started

### Prerequisites
- Node.js installed on your machine.
- A PostgreSQL database (e.g., local, Supabase, Neon).

### 1. Database Setup
Run the SQL commands from `backend/database_schema.sql` in your database query editor to create the necessary tables (`users`, `entries`, `categories`, `tags`, `resources`, `entry_tags`).

### 2. Backend Installation
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure Environment:
   Create a `.env` file in the `backend/` folder:
   ```env
   DATABASE_URL=postgresql://user:password@host:port/database
   PORT=3000
   ```
4. Start the Server:
   ```bash
   npm start
   # or for development
   npm run dev
   ```

### 3. Frontend Usage
Simply open the `index.html` file in your preferred web browser. It is configured to connect to `http://localhost:3000` by default.

## 📖 Usage Guide

- **Adding a Note:** Click "Add Entry", fill in the details, write your notes in Markdown, and hit Save.
- **Filtering:** Go to the Library and use the dropdowns to find specific topics.
- **Importing Data:** Go to Settings -> Import Backup and select a valid `.json` file (structure example in `mock_data.json`).
- **Resetting Data:** Go to Settings -> Danger Zone -> Clear All Data (Warning: This wipes the DB!).

## 🤝 Contributing
Feel free to fork this project and submit pull requests. Suggestions and improvements are welcome!

---
*Built with ❤️ for lifelong learners.*
