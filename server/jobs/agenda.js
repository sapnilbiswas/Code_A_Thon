const { Agenda } = require('agenda');
const { MongoBackend } = require('@agendajs/mongo-backend');
const Transaction = require('../models/Transaction');
const { sendFraudAlert } = require('../utils/sse');

const agenda = new Agenda({
    backend: new MongoBackend({ 
        address: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/codeathon_db',
        collection: 'agendaJobs'
    })
});

// Define the fraud detection job
agenda.define('detect-fraud', async (job) => {
    const { transactionId } = job.attrs.data;
    
    // 1. Fetch the transaction
    const txn = await Transaction.findById(transactionId);
    if (!txn) {
        console.error(`[Agenda] Transaction ${transactionId} not found`);
        return;
    }

    try {
        console.log(`[Agenda] Checking fraud for transaction ${transactionId}...`);
        
        // 2. Call Flask ML service
        const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001';
        const response = await fetch(`${mlServiceUrl}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: txn.amount,
                type: txn.type,
                category: txn.category,
                date: txn.date
            })
        });

        if (!response.ok) {
            throw new Error(`ML Service returned ${response.status}`);
        }

        const result = await response.json();

        // 3. Update the transaction with ML results
        txn.isFlagged = result.isFlagged;
        txn.fraudScore = result.fraudScore;
        txn.flagReasons = result.flagReasons;
        await txn.save();
        
        console.log(`[Agenda] Transaction ${transactionId} fraud check complete. isFlagged: ${result.isFlagged}`);
        
        // 4. Send SSE Alert if flagged
        if (result.isFlagged) {
            sendFraudAlert(txn.user, {
                type: 'fraud_alert',
                transactionId: txn._id,
                amount: txn.amount,
                category: txn.category,
                score: result.fraudScore,
                reasons: result.flagReasons
            });
        }
        
    } catch (error) {
        console.error(`[Agenda] Error during detect-fraud for transaction ${transactionId}:`, error.message);
        // Throw error so agenda can retry if necessary
        throw error;
    }
});

module.exports = agenda;
