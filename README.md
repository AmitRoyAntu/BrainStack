# 🧠 BrainStack - Your Personal AI-Powered Second Brain

BrainStack is a professional, full-stack personal knowledge management system designed to track what you learn, organize notes via Markdown, and chat with a context-aware AI assistant.

---

## 🚀 Key Features

- **🤖 Global AI Brain:** A context-aware assistant powered by **Groq (Llama 3.3)**. It retrieves relevant context from your notes using advanced keyword extraction to provide precise answers, summaries, and code snippets in beautiful Markdown.
- **📊 Professional Analytics:** Interactive **Chart.js** visualizations. Track category distribution, 7-day learning activity, and long-term consistency via a GitHub-style **Activity Heatmap**.
- **🔍 Intelligent Search:** Powerful server-side "search-as-you-type" functionality. Filter your entire knowledge base by category, difficulty, or content with sub-second latency.
- **✍️ Advanced Markdown Editor:** Full Markdown support with live preview, intelligent text wrapping for formatting, and **automatic draft restoration**.
- **🛡️ Data Protection:** Includes **Navigation Guards** to prevent losing unsaved notes and a robust **Auto-Save** system.
- **🔒 Secure Authentication:** Standard Email & Password login secured with **JSON Web Tokens (JWT)**.
- **📱 Mobile-First Design:** Fully polished, ultra-responsive UI with smooth slide-in animations and adaptive layouts for a native-app feel on mobile.
- **💾 Data Portability:** High-reliability JSON Export and Import using modern Blob technology for seamless backups and restoration.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (Custom Glassmorphism).
- **Backend:** Node.js, Express.js.
- **AI:** Groq SDK (Llama 3.3 70B model).
- **Database:** PostgreSQL (Optimized with performance indexes).
- **Charts:** Chart.js.

---

## ⚙️ Local Setup

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- **PostgreSQL** database

### 2. Clone the repository
```bash
git clone https://github.com/AmitRoyAntu/BrainStack.git
cd BrainStack
```

### 3. Install dependencies
Navigate to the `backend/` folder and install packages:
```bash
cd backend
npm install
```

### 4. Configure Environment Variables
Create a `.env` file in the `backend/` folder:
```text
DATABASE_URL=postgres://user:password@localhost:5432/brainstack
GROQ_API_KEY=your_groq_api_key
JWT_SECRET=your_secret_random_string
PORT=3000
```
*Get your API key from [Groq Console](https://console.groq.com/).*

### 5. Set up the Database
Run the SQL code in `backend/database_schema.sql` in your PostgreSQL editor (e.g., pgAdmin, psql, or Supabase). This will create all necessary tables and **performance indexes**.

### 6. Start the server
```bash
npm start
```
For development with auto-reload:
```bash
npm run dev
```

### 7. Open in browser
Go to [http://localhost:3000](http://localhost:3000)

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
