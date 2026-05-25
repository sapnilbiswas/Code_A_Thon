require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./server/models/User');
const Transaction = require('./server/models/Transaction');
const agenda = require('./server/jobs/agenda');

async function testAgenda() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codeathon_db');
    
    console.log("Starting Agenda...");
    await agenda.start();
    
    // Create a mock user if one doesn't exist
    let user = await User.findOne({});
    if (!user) {
        user = new User({ username: 'testuser', email: 'test@example.com', firstName: 'Test', lastName: 'User' });
        await user.save();
    }
    
    console.log("Creating a mock suspicious transaction...");
    const txn = new Transaction({
        amount: 9999,
        type: 'expense',
        category: 'Transfer',
        description: 'Large transfer for testing',
        date: new Date(),
        user: user._id
    });
    await txn.save();
    console.log(`Saved transaction with ID: ${txn._id}`);
    
    console.log("Queueing 'detect-fraud' job...");
    await agenda.now('detect-fraud', { transactionId: txn._id });
    
    console.log("Job queued! Wait a few seconds for the background worker to process it, then check the MongoDB logs.");
    
    setTimeout(() => {
        console.log("Exiting test script. (In production, the node server stays alive).");
        process.exit(0);
    }, 5000);
}

testAgenda().catch(console.error);
