# 🛡️ FraudGuard — Smart Financial Dashboard with ML Fraud Detection

> A full-stack personal finance dashboard that tracks income & expenses, enforces budgets, and uses **real-time AI-powered fraud detection** to flag suspicious transactions.

---

## 🏆 Team Developers
**Members:** 
- Sapnil Biswas
- Dhruvesh Mishra
- Pawan Tiwari
- Tejaswi Verma

---

## 📖 Project Overview

FraudGuard is a web application where users can manage their personal finances while being protected by a machine learning fraud detection system running in the background. When a user adds a transaction, it is saved instantly to the database. Simultaneously, an asynchronous background job sends the transaction data to a Python ML microservice for fraud analysis. If the transaction is flagged as suspicious, a real-time toast notification slides into the user's browser without needing a page refresh.

---

## 🎨 Theme & UI Information

FraudGuard uses a premium, cinematic **Dark Theme** designed to feel like an enterprise-grade fintech dashboard.
- **Glassmorphism:** Translucent cards with backdrop-blurring for deep layering and visual hierarchy.
- **3D Visualization:** Features an interactive **Three.js** digital globe with a holographic Rupee (₹) symbol in the background, rotating fluidly as the user navigates.
- **Micro-animations:** Smooth hover-lift effects on cards, fading SPA-like page transitions, and elegant toast notification slides.

---

## 🛠️ Tech Stack & Dependencies

### Core Tech Stack
- **Frontend:** HTML5, Vanilla CSS, EJS (Embedded JavaScript)
- **Backend:** Node.js, Express.js
- **Database:** MongoDB, Mongoose
- **Machine Learning:** Python, Flask, Scikit-Learn

### External APIs Used
1. **Google Gemini AI API** (`@google/generative-ai`): Powers the Multimodal bank statement extraction (JSON parsing from PDFs/Images) and the AI Financial Advisor chatbot.
2. **Google OAuth 2.0 API**: Used for secure "Continue with Google" one-tap user authentication.

### NPM Libraries & Dependencies
- `express` (^5.2.1) - Core web framework for Node.js
- `mongoose` (^9.6.2) - MongoDB object modeling and schema validation
- `passport` / `passport-google-oauth20` / `passport-local` - Core authentication and Google OAuth handling
- `passport-local-mongoose` - Plugin for simplifying local username/password auth
- `@google/generative-ai` (^0.24.1) - Official Google Gemini API SDK
- `agenda` / `@agendajs/mongo-backend` - MongoDB-backed asynchronous background job queue
- `express-session` / `connect-mongo` - Session management and persistence across server restarts
- `ejs` / `ejs-mate` - Server-side templating engines
- `three` (^0.184.0) - WebGL library used for the 3D interactive background globe
- `dotenv` - Environment variable management
- `pdfkit` - Server-side PDF generation for mock bank statements
- `method-override` - HTTP verb overrides for RESTful routing

### Python Dependencies (ML Service)
- `flask` - Python REST API microservice framework
- `scikit-learn` - Machine learning library (IsolationForest model for anomaly detection)
- `shap` - Explainable AI framework (translates ML mathematics into human-readable fraud reasons)
- `pandas` / `numpy` - Data manipulation and arrays

---

## 🔄 Workflow & Architecture

```text
┌──────────────────────────────────────────────────┐
│                   Browser (EJS)                  │
│  ┌────────────┐ ┌────────────┐ ┌──────────────┐ │
│  │ Dashboard   │ │ Add Txn    │ │ Fraud Toast  │ │
│  │ (Charts)    │ │ (Form)     │ │ (SSE)        │ │
│  └────────────┘ └─────┬──────┘ └──────▲───────┘ │
└───────────────────────┼───────────────┼──────────┘
                        │               │
              HTTP POST │               │ SSE Push
                        ▼               │
┌──────────────────────────────────────────────────┐
│              Express Server (Node.js)            │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌─────────────────┐ │
│  │ Passport │  │ Routes   │  │ SSE Endpoint    │ │
│  │ Auth     │  │ (CRUD)   │  │ GET /stream     │ │
│  └─────────┘  └────┬─────┘  └────────▲────────┘ │
│                     │                 │          │
│          ┌──────────▼──────────┐      │          │
│          │     SYNC PATH       │      │          │
│          │  Save to MongoDB    │      │          │
│          └──────────┬──────────┘      │          │
│                     │                 │          │
│          ┌──────────▼──────────┐      │          │
│          │    ASYNC PATH       │      │          │
│          │  Agenda Job Queue   │──────┘          │
│          │  (MongoDB-backed)   │                 │
│          └──────────┬──────────┘                 │
└─────────────────────┼────────────────────────────┘
                      │
            HTTP POST │ /predict
                      ▼
┌──────────────────────────────────────────────────┐
│         Python Flask Microservice (:5001)        │
│                                                  │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Isolation    │  │ SHAP Explainability    │   │
│  │ Forest Model │  │ (flagReasons)          │   │
│  └──────────────┘  └────────────────────────┘   │
│                                                  │
│  Returns: { isFlagged, fraudScore, flagReasons } │
└──────────────────────────────────────────────────┘
```

**The Two Data Paths Explained:**
- **Sync:** Transaction saved to MongoDB → Dashboard reflects it immediately (Instant UI feedback).
- **Async:** Agenda queues a job → Job calls Flask `/predict` → MongoDB updated → SSE pushes alert (2–3 seconds).

---

## 📂 Filesystem Structure

```text
/
├── .env                  # Environment secrets & API keys
├── server.js             # Entry point for the Node.js application
├── seed.js               # Demo data seeding script
├── package.json          # Node.js dependencies list
├── README.md             # Project documentation
│
├── server/
│   ├── models/           # Mongoose schemas (User, Transaction, Budget, SavingsGoal)
│   ├── routes/           # Express route controllers (auth, dashboard, transactions, advice)
│   ├── middleware/       # Custom middleware (authentication checks)
│   ├── jobs/             # Agenda background workers (fraud checking)
│   ├── utils/            # Helper functions (SSE real-time push logic)
│   │
│   ├── views/            # EJS Templates
│   │   ├── layouts/      # Boilerplate layout (contains Three.js injection & navbar)
│   │   └── *.ejs         # Dashboard, login, register, and AI advisor pages
│   │
│   └── public/           # Static frontend assets
│       ├── css/          # Vanilla CSS styling & themes
│       └── js/           # Client-side scripts (page transitions, 3D globe, chart configs)
│
└── ml-service/           # Python Microservice
    ├── app.py            # Flask API endpoint
    ├── model.py          # Machine learning logic (Isolation Forest & SHAP)
    ├── generate_data.py  # Script to generate training datasets
    └── requirements.txt  # Python dependencies
```

---

## ✨ Features Highlight

1. **🔐 User Authentication**: Secure registration and login using Passport.js (Local & Google OAuth).
2. **💳 Smart Transactions**: Add transactions manually or extract them automatically from uploaded PDFs using Google Gemini.
3. **📊 Dynamic Dashboard**: Interactive Chart.js charts (Income vs Expense, Category Breakdown) injected server-side.
4. **💰 Budgets & Savings**: Set monthly category limits with animated progress bars that shift from green to red.
5. **🤖 ML Fraud Detection**: Background Python service flags suspicious activity based on spending velocity, anomalies, and locations.
6. **🧠 Explainable AI (SHAP)**: Flagged transactions explicitly explain *why* they were flagged (e.g., "Unusually high amount for this category").
7. **⚡ Real-Time Alerts**: Server-Sent Events (SSE) push fraud warnings directly to the active browser session instantly.

---

## 🚀 Getting Started

```bash
# Clone the repository
git clone https://github.com/sapnilbiswas/Code_A_Thon.git
cd Code_A_Thon

# Install Node dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your MongoDB URI, Google OAuth keys, and Gemini API key

# Start the Node server
npm start

# In a separate terminal, start the ML service
cd ml-service
pip install -r requirements.txt
python3 app.py
```
