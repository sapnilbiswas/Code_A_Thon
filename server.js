require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const path = require('path');
const engine = require('ejs-mate');
const methodOverride=require('method-override')

const User = require('./server/models/User');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
.then(()=>{
    console.log("Connected to MongoDB")
})

// --- View Engine Setup ---
app.engine('ejs', engine);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'server', 'views'));

// --- Middleware ---
app.use(express.static(path.join(__dirname, 'server', 'public')));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(methodOverride('_method'))
app.use(express.json({ limit: '50mb' }));

// --- Sessions ---
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Don't save empty sessions
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        httpOnly: true,
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 1 week
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

// --- Passport Config ---
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

// --- Passport Google OAuth Config ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'DUMMY_GOOGLE_CLIENT_ID',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'DUMMY_GOOGLE_CLIENT_SECRET',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3200/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            const email = profile.emails && profile.emails[0] ? profile.emails[0].value : '';
            if (email) {
                user = await User.findOne({ username: email });
            }
            
            if (!user) {
                user = new User({
                    googleId: profile.id,
                    username: email || `google_${profile.id}@google.com`,
                    firstName: profile.name && profile.name.givenName ? profile.name.givenName : 'Google',
                    lastName: profile.name && profile.name.familyName ? profile.name.familyName : 'User'
                });
                await user.save();
            } else {
                user.googleId = profile.id;
                await user.save();
            }
        }
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Make currentUser, activePage, and session flash messages available in all templates
app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    res.locals.activePage = req.originalUrl ? req.originalUrl.split('?')[0] : '';
    res.locals.success = req.session.success || '';
    res.locals.error = req.session.error || '';
    delete req.session.success;
    delete req.session.error;
    next();
});

// --- Routes ---
const authRoutes = require('./server/routes/auth');
const transactionsRoutes = require('./server/routes/transactions');
const dashboardRoutes = require('./server/routes/dashboard');
const budgetRoutes = require('./server/routes/budget');
const savingsRoutes = require('./server/routes/savings');
const reportRoutes = require('./server/routes/report');
const adviceRoutes = require('./server/routes/advice');
const chatRoutes = require('./server/routes/chat');
const { isLoggedIn } = require('./server/middleware/auth');

app.use('/auth', authRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/budgets', budgetRoutes);
app.use('/savings', savingsRoutes);
app.use('/reports', reportRoutes);
app.use('/advice', adviceRoutes);
app.use('/chat', chatRoutes);
app.use('/', dashboardRoutes);

app.get('/', (req, res) => {
    res.redirect('/auth/login');
});

const { addClient, removeClient } = require('./server/utils/sse');

// SSE Endpoint for real-time fraud alerts
app.get('/stream', isLoggedIn, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Register this client connection
    const userId = req.user._id;
    addClient(userId, res);

    // Keep connection alive with periodic pings
    const interval = setInterval(() => {
        res.write('data: {"type": "ping"}\n\n');
    }, 30000);

    req.on('close', () => {
        clearInterval(interval);
        removeClient(userId, res);
    });
});

// --- Server Start ---
const agenda = require('./server/jobs/agenda');

mongoose.connection.once('open', async () => {
    await agenda.start();
    console.log('📋 Agenda job queue started');
});
app.set('agenda', agenda); // Make accessible in routes

app.listen(3200,()=>{
    console.log("server is running on port 3200")
})
// Trigger nodemon restart
