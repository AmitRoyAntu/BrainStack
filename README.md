# 🧠 BrainStack - Your Personal AI-Powered Second Brain

BrainStack is a professional, full-stack personal knowledge management system designed to track what you learn, organize notes via Markdown, and chat with a context-aware AI assistant.

---

## 🚀 Key Features

- **🤖 Global AI Brain:** A context-aware assistant powered by **Groq (Llama 3.3)** that has read all your notes and can answer questions, provide examples, or quiz you.
- **🔒 Secure Authentication:** Standard Email & Password login secured with **JSON Web Tokens (JWT)** and a 7-day session memory.
- **📊 Professional Analytics:** Interactive **Chart.js** visualizations showing your category distribution and learning activity.
- **🔥 Consistency Heatmap:** A GitHub-style activity grid to track your learning streak and daily consistency over the entire year.
- **✍️ Advanced Markdown Editor:** Full Markdown support with live preview, auto-expanding text area, and **one-click code copying**.
- **📱 Ultra-Responsive UI:** Fully polished for mobile and desktop with dynamic scaling typography and an adaptive layout.
- **⚡ Performance Optimized:** Server-side pagination (15 items/page), debounced search, and parallelized data fetching for instant load times.
- **💾 Data Portability:** Full JSON Export and Import functionality for local backups.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (Custom Glassmorphism).
- **Backend:** Node.js, Express.js.
- **AI:** Groq SDK (Llama 3.3 70B model).
- **Database:** PostgreSQL (Optimized for Supabase/Neon).
- **Charts:** Chart.js.

---

## ⚙️ Local Setup

1. **Clone the repository**
2. **Navigate to the `backend/` folder:**
   ```bash
   cd backend
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Configure Environment Variables:**
   Create a `.env` file in the `backend/` folder and add:
   ```text
   DATABASE_URL=your_postgresql_connection_string
   GROQ_API_KEY=your_groq_api_key
   JWT_SECRET=your_secret_random_string
   PORT=3000
   ```
5. **Set up the Database:**
   Run the SQL code in `backend/database_schema.sql` in your PostgreSQL editor (e.g., Supabase SQL Editor).
6. **Start the server:**
   ```bash
   node server.js
   ```
7. **Open in browser:** `http://localhost:3000`

---

## 🛡️ Environment Variables

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | Your full PostgreSQL connection string. |
| `GROQ_API_KEY` | API Key from [Groq Console](https://console.groq.com/). |
| `JWT_SECRET` | A secret string used to sign your login tokens. |
| `PORT` | The port the server runs on (default: 3000). |

---

## 🚀 Deployment (Render)

1. **Root Directory:** Set to `backend` (or leave empty if the repo is just the backend).
2. **Build Command:** `npm install`
3. **Start Command:** `node server.js`
4. **Environment Variables:** Add `DATABASE_URL`, `GROQ_API_KEY`, and `JWT_SECRET` in the Render dashboard settings.

---

*Keep learning, keep growing. 🌱*