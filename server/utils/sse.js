// server/utils/sse.js

// Store active SSE connections per user
// Map structure: { "userId": [res1, res2, ...] } to support multiple tabs
const sseClients = new Map();

function addClient(userId, res) {
    const id = userId.toString();
    if (!sseClients.has(id)) {
        sseClients.set(id, new Set());
    }
    sseClients.get(id).add(res);
}

function removeClient(userId, res) {
    const id = userId.toString();
    if (sseClients.has(id)) {
        sseClients.get(id).delete(res);
        if (sseClients.get(id).size === 0) {
            sseClients.delete(id);
        }
    }
}

function sendFraudAlert(userId, data) {
    const id = userId.toString();
    if (sseClients.has(id)) {
        const clients = sseClients.get(id);
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        
        clients.forEach(client => {
            try {
                client.write(payload);
            } catch (err) {
                console.error(`Error sending SSE to user ${id}:`, err);
            }
        });
    }
}

module.exports = {
    addClient,
    removeClient,
    sendFraudAlert
};
