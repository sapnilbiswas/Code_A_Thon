# 🚀 Hackathon Project Roadmap — Fraud Detection & Budget Dashboard

> **Stack:** Node.js · Express · EJS · Passport.js · MongoDB · Agenda · Python Flask (ML)

---

## 📁 Final Project Structure

```
Hackathon_Code_A_Thon/
├── server.js                          ← Entry point (Express app)
├── .env                               ← Environment variables
├── .gitignore
├── package.json
│
├── server/
│   ├── models/
│   │   ├── User.js                    ✅ DONE
│   │   ├── Transaction.js             ✅ DONE
│   │   └── Budget.js                  ✅ DONE
│   │
│   ├── routes/
│   │   ├── auth.js                    ← Register / Login / Logout
│   │   ├── transactions.js            ← CRUD + trigger fraud check
│   │   └── dashboard.js               ← Aggregation + render dashboard
│   │
│   ├── views/
│   │   ├── partials/
│   │   │   ├── header.ejs             ← Navbar + Head (shared layout)
│   │   │   ├── footer.ejs             ← Footer + Scripts
│   │   │   └── flash.ejs              ← Flash message alerts
│   │   ├── layouts/
│   │   │   └── boilerplate.ejs        ← Master layout (ejs-mate)
│   │   ├── login.ejs                  ← Login page
│   │   ├── register.ejs               ← Register page
│   │   ├── dashboard.ejs              ← Main dashboard
│   │   ├── transactions.ejs           ← Transaction list + form
│   │   └── budgets.ejs                ← Budget management
│   │
│   ├── public/
│   │   ├── css/
│   │   │   └── style.css              ← All custom styles
│   │   └── js/
│   │   │   ├── sse.js                 ← SSE listener for fraud alerts
│   │   │   └── charts.js              ← Chart.js dashboard charts
│   │
│   ├── middleware/
│   │   └── auth.js                    ← isLoggedIn middleware
│   │
│   └── jobs/
│       └── agenda.js                  ← Agenda setup + fraud job
│
└── ml-service/
    ├── app.py                         ← Flask API (/predict endpoint)
    ├── model.py                       ← ML model (IsolationForest)
    ├── requirements.txt               ← Flask, scikit-learn, shap
    └── sample_data.csv                ← Seed data for training
```

---

## 🗓️ Phase-by-Phase Roadmap

---

### PHASE 1: Authentication System
**Priority: 🔴 Critical — Everything depends on this**

#### 1.1 Create Middleware — `server/middleware/auth.js`
```js
// isLoggedIn — protects all dashboard/transaction routes
module.exports.isLoggedIn = (req, res, next) => {
    if (!req.isAuthenticated()) {
        req.session.returnTo = req.originalUrl;
        return res.redirect('/auth/login');
    }
    next();
};
```

#### 1.2 Auth Routes — `server/routes/auth.js`
| Method | Path              | Action                          |
|--------|-------------------|---------------------------------|
| GET    | `/auth/register`  | Render register form            |
| POST   | `/auth/register`  | Create user → redirect dashboard|
| GET    | `/auth/login`     | Render login form               |
| POST   | `/auth/login`     | Passport authenticate           |
| GET    | `/auth/logout`    | Logout → redirect login         |

#### 1.3 EJS Views
- `register.ejs` — Name, email/username, password fields
- `login.ejs` — Username, password fields
- `layouts/boilerplate.ejs` — Shared HTML head, navbar, `<%- body %>`

#### 1.4 Wire Routes in `server.js`
```js
const authRoutes = require('./server/routes/auth');
app.use('/auth', authRoutes);
```

#### ✅ Checkpoint: Can register, login, logout, and see a protected dashboard page.

---

### PHASE 2: Transaction CRUD (Sync Path)
**Priority: 🔴 Critical — Core feature**

#### 2.1 Transaction Routes — `server/routes/transactions.js`
| Method | Path                    | Action                                  |
|--------|-------------------------|-----------------------------------------|
| GET    | `/transactions`         | List all user transactions              |
| GET    | `/transactions/new`     | Render "Add Transaction" form           |
| POST   | `/transactions`         | Save transaction → trigger fraud job    |
| GET    | `/transactions/:id`     | View single transaction details         |
| PATCH  | `/transactions/:id`     | Update a transaction                    |
| DELETE | `/transactions/:id`     | Delete a transaction                    |

#### 2.2 Form Fields (in `transactions.ejs`)
- Amount (Number)
- Type (Dropdown: Income / Expense)
- Category (Dropdown: Groceries, Rent, Entertainment, Transfer, Salary, Other)
- Description (Text)
- Date (Date picker, defaults to today)

#### 2.3 Key Logic in POST `/transactions`
```js
// 1. Save to MongoDB immediately (Sync path)
const txn = await Transaction.create({ ...req.body, user: req.user._id });

// 2. Queue fraud detection (Async path)
const agenda = req.app.get('agenda');
await agenda.now('detect-fraud', { transactionId: txn._id });

// 3. Redirect back to dashboard
res.redirect('/dashboard');
```

#### ✅ Checkpoint: Can add, view, edit, and delete transactions.

---

### PHASE 3: Dashboard & Charts
**Priority: 🟡 High — The "wow" factor for judges**

#### 3.1 Dashboard Route — `server/routes/dashboard.js`
| Method | Path          | Action                              |
|--------|---------------|-------------------------------------|
| GET    | `/dashboard`  | Aggregate data → render dashboard   |

#### 3.2 Data to Aggregate (in route handler)
```js
// All of these are per-user, per-current-month
const totalIncome = await Transaction.aggregate([...]);
const totalExpense = await Transaction.aggregate([...]);
const categoryBreakdown = await Transaction.aggregate([...]); // group by category
const flaggedTransactions = await Transaction.find({ user, isFlagged: true });
const budgets = await Budget.find({ user, periodMonth, periodYear });
```

#### 3.3 Dashboard UI Components
| Component              | Library / Tool       | Data Source                |
|------------------------|----------------------|----------------------------|
| Income vs Expense bar  | Chart.js             | totalIncome, totalExpense  |
| Category pie chart     | Chart.js             | categoryBreakdown          |
| Health Score gauge      | Custom CSS / SVG     | overallHealthScore         |
| Budget progress bars   | HTML + CSS           | budgets + spent amounts    |
| Flagged alerts list    | EJS loop             | flaggedTransactions        |
| Recent transactions    | EJS table            | last 10 transactions       |

#### 3.4 Client-Side Charts — `server/public/js/charts.js`
- Use **Chart.js CDN** (no npm install needed)
- Pass data from EJS to JS using `<script>` tags with JSON

```ejs
<script>
  const chartData = <%- JSON.stringify(categoryBreakdown) %>;
</script>
<script src="/js/charts.js"></script>
```

#### ✅ Checkpoint: Dashboard renders with live charts from real data.

---

### PHASE 4: Budget Management
**Priority: 🟡 High**

#### 4.1 Budget Routes (can be part of `dashboard.js` or separate)
| Method | Path              | Action                          |
|--------|-------------------|---------------------------------|
| GET    | `/budgets`        | List budgets for current month  |
| POST   | `/budgets`        | Create a new budget limit       |
| DELETE | `/budgets/:id`    | Remove a budget                 |

#### 4.2 Budget Alert Logic
```js
// In dashboard route, for each budget:
const spent = await Transaction.aggregate([
    { $match: { user: userId, category: budget.category, type: 'expense', date: { $gte: monthStart } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
]);
const percentUsed = (spent / budget.limitAmount) * 100;
// If percentUsed >= alertThreshold → show warning in UI
```

#### ✅ Checkpoint: Can set category budgets and see progress bars with alerts.

---

### PHASE 5: Python ML Microservice (Async Path)
**Priority: 🟠 Medium-High — The differentiator**

#### 5.1 Flask Setup — `ml-service/app.py`
```python
from flask import Flask, request, jsonify
from model import predict_fraud

app = Flask(__name__)

@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    result = predict_fraud(data)
    return jsonify(result)

if __name__ == '__main__':
    app.run(port=5001, debug=True)
```

#### 5.2 ML Model — `ml-service/model.py`

**Hackathon Strategy (2 tiers):**

| Tier | Approach                | Time Needed | Impressiveness |
|------|-------------------------|-------------|----------------|
| 1    | Rule-based thresholds   | 30 min      | ⭐⭐            |
| 2    | IsolationForest + SHAP  | 2-3 hrs     | ⭐⭐⭐⭐⭐       |

**Tier 1 (start here):**
```python
def predict_fraud(data):
    reasons = []
    score = 0.0
    if data['amount'] > 5000:
        score += 0.4
        reasons.append("Unusually high amount")
    if data['category'] == 'Transfer' and data['amount'] > 2000:
        score += 0.3
        reasons.append("Large transfer detected")
    return {
        "isFlagged": score >= 0.5,
        "fraudScore": min(score, 1.0),
        "flagReasons": reasons
    }
```

**Tier 2 (if time permits):**
- Train IsolationForest on `sample_data.csv`
- Use SHAP for explainability (`flagReasons`)
- Cache model in memory on Flask startup

#### 5.3 `ml-service/requirements.txt`
```
flask
scikit-learn
shap
pandas
numpy
```

#### ✅ Checkpoint: `curl -X POST http://localhost:5001/predict -H "Content-Type: application/json" -d '{"amount": 9999, "category": "Transfer"}' ` returns a fraud result.

---

### PHASE 6: Agenda Background Jobs
**Priority: 🟠 Medium-High — Connects ML to Node**

#### 6.1 Agenda Setup — `server/jobs/agenda.js`
```js
const Agenda = require('agenda');
const Transaction = require('../models/Transaction');

const agenda = new Agenda({
    db: { address: process.env.MONGODB_URI, collection: 'agendaJobs' }
});

// Define the fraud detection job
agenda.define('detect-fraud', async (job) => {
    const { transactionId } = job.attrs.data;
    const txn = await Transaction.findById(transactionId);
    if (!txn) return;

    // Call Flask ML service
    const response = await fetch('http://localhost:5001/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount: txn.amount,
            type: txn.type,
            category: txn.category
        })
    });
    const result = await response.json();

    // Update the transaction with ML results
    txn.isFlagged = result.isFlagged;
    txn.fraudScore = result.fraudScore;
    txn.flagReasons = result.flagReasons;
    await txn.save();
});

module.exports = agenda;
```

#### 6.2 Start Agenda in `server.js`
```js
const agenda = require('./server/jobs/agenda');

// After mongoose.connect():
agenda.start().then(() => console.log('📋 Agenda job queue started'));
app.set('agenda', agenda); // Make accessible in routes
```

#### ✅ Checkpoint: Adding a transaction triggers a background fraud check, and the Transaction document gets updated with `isFlagged`, `fraudScore`, `flagReasons`.

---

### PHASE 7: Real-Time Fraud Alerts (SSE)
**Priority: 🟢 Medium — Polish & demo wow-factor**

#### 7.1 SSE Endpoint in `server.js` or a new route file
```js
// Store active SSE connections per user
const sseClients = new Map();

app.get('/stream', isLoggedIn, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const userId = req.user._id.toString();
    sseClients.set(userId, res);

    req.on('close', () => sseClients.delete(userId));
});

// Helper function (export or attach to app)
function sendFraudAlert(userId, data) {
    const client = sseClients.get(userId);
    if (client) {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    }
}
```

#### 7.2 Trigger Alert from Agenda Job
After updating the transaction in the `detect-fraud` job:
```js
if (result.isFlagged) {
    const { sendFraudAlert } = require('../path/to/sse');
    sendFraudAlert(txn.user.toString(), {
        type: 'fraud_alert',
        transactionId: txn._id,
        amount: txn.amount,
        score: result.fraudScore,
        reasons: result.flagReasons
    });
}
```

#### 7.3 Client-Side Listener — `server/public/js/sse.js`
```js
const evtSource = new EventSource('/stream');
evtSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'fraud_alert') {
        showToast(`⚠️ Fraud Alert! $${data.amount} flagged. Reason: ${data.reasons.join(', ')}`);
    }
};
```

#### ✅ Checkpoint: Adding a suspicious transaction → 2-3 seconds later → toast notification pops up on the dashboard in real-time.

---

### PHASE 8: Styling & Polish
**Priority: 🟢 Medium — Makes or breaks the demo**

#### 8.1 CSS Strategy
- Use **CSS custom properties** for a consistent dark theme
- Glassmorphism cards for dashboard widgets
- Smooth transitions on hover/focus states

#### 8.2 Key UI Elements to Style
| Element              | Style Goal                                   |
|----------------------|----------------------------------------------|
| Login / Register     | Centered card, gradient background            |
| Dashboard            | Grid layout, dark theme, glassmorphism cards  |
| Charts               | Chart.js with custom colors matching theme   |
| Budget bars           | Animated progress bars (green → yellow → red) |
| Fraud toast          | Slide-in from top-right, red accent          |
| Transaction table    | Striped rows, flagged rows highlighted red   |
| Navbar               | Sticky, transparent blur                     |

#### 8.3 External Resources (CDN)
```html
<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<!-- Google Fonts (Inter) -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
```

---

## ⏱️ Suggested Time Allocation (for a 24hr hackathon)

| Phase | Task                        | Time     | Status  |
|-------|-----------------------------|----------|---------|
| 0     | Project setup & models      | 1 hr     | ✅ DONE |
| 1     | Auth (routes + views)       | 1.5 hrs  | ✅ DONE |
| 2     | Transaction CRUD            | 2 hrs    | ⬜      |
| 3     | Dashboard + Charts          | 3 hrs    | ⬜      |
| 4     | Budget management           | 1.5 hrs  | ⬜      |
| 5     | Python ML service           | 2-3 hrs  | ✅ DONE |
| 6     | Agenda jobs                 | 1 hr     | ⬜      |
| 7     | SSE real-time alerts        | 1 hr     | ⬜      |
| 8     | Styling & polish            | 3-4 hrs  | ⬜      |
|       | **Buffer / debugging**      | **2 hrs**|         |
|       | **Total**                   | ~18 hrs  |         |

---

## 🔑 Environment Variables (`.env`)

```
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/hackathon_fraud_db
SESSION_SECRET=thisismyhackathonsecret
ML_SERVICE_URL=http://localhost:5001
```

---

## 🧪 Quick Verification Commands

```bash
# Start MongoDB (if not running)
mongosh

# Start Node server
npx nodemon server.js

# Start Flask ML service (in a separate terminal)
cd ml-service && pip install -r requirements.txt && python app.py

# Test ML endpoint
curl -X POST http://localhost:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"amount": 9999, "category": "Transfer", "type": "expense"}'
```

---

## 🎯 Demo Flow (for judges)

1. **Register** a new account
2. **Add 3-4 normal transactions** (groceries $50, rent $1200)
3. **Set a budget** for Groceries at $200
4. **Show the dashboard** — charts populate, budget bars show progress
5. **Add a suspicious transaction** ($9999 transfer)
6. **Watch the fraud alert toast** pop up in real-time ⚡
7. **Click the flagged transaction** — show the ML reasons (SHAP explainability)
8. **Show budget exceeded warning** — add another grocery expense to cross the limit

---

> **Built with ❤️ for the Hackathon by Team Code-A-Thon**
