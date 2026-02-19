const ForensicsEngine = require('./detection/forensicsEngine');
const fs = require('fs');
const csv = require('csv-parser');
const { Readable } = require('stream');

const csvString = fs.readFileSync('../test_transactions.csv', 'utf-8');
const results = [];
const stream = Readable.from(csvString);

stream.pipe(csv({
    mapHeaders: ({ header }) => header.trim().toLowerCase(),
    skipEmptyLines: true
})).on('data', (row) => {
    const n = {};
    for (const [k, v] of Object.entries(row)) {
        n[k.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')] = v ? v.trim() : v;
    }
    const amount = parseFloat(n.amount || '0');
    const timestamp = n.timestamp;
    if (n.sender_id && n.receiver_id && !isNaN(amount) && amount > 0 && timestamp && !isNaN(Date.parse(timestamp)) && n.sender_id !== n.receiver_id) {
        results.push({
            transaction_id: n.transaction_id,
            sender_id: n.sender_id,
            receiver_id: n.receiver_id,
            amount,
            timestamp
        });
    }
}).on('end', () => {
    console.log('Valid transactions:', results.length);
    try {
        const engine = new ForensicsEngine(results);
        const r = engine.analyze();
        console.log('Suspicious:', r.suspicious_accounts.length);
        console.log('Rings:', r.fraud_rings.length);
        console.log('Graph nodes:', r.graph_data.nodes.length);
        console.log('Graph edges:', r.graph_data.edges.length);
        console.log('SUCCESS');
    } catch (e) {
        console.error('Error:', e.message);
        console.error(e.stack);
    }
});
