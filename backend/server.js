/**
 * Forensiq Engine - Express Server
 * 
 * Provides REST API endpoints for:
 * - CSV file upload and processing
 * - Analysis results retrieval
 * - JSON output download
 */

const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

const ForensicsEngine = require('./detection/forensicsEngine');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS
app.use(cors());

app.use(express.json({ limit: '50mb' }));

// Configure multer for CSV upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.csv') {
            return cb(new Error('Only CSV files are allowed'));
        }
        cb(null, true);
    }
});

// Store results in memory (keyed by session)
const resultsStore = new Map();

/**
 * POST /api/analyze - Upload CSV and run analysis
 */
app.post('/api/analyze', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No CSV file provided' });
        }

        const csvBuffer = req.file.buffer;
        const csvString = csvBuffer.toString('utf-8');

        // Parse CSV
        const transactions = await parseCSV(csvString);

        // Validate transactions
        const validation = validateTransactions(transactions);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error, details: validation.details });
        }

        // Run analysis
        const engine = new ForensicsEngine(transactions);
        const results = engine.analyze();

        // Store results
        const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        resultsStore.set(sessionId, results);

        // Clean up old results (keep last 20)
        if (resultsStore.size > 20) {
            const oldestKey = resultsStore.keys().next().value;
            resultsStore.delete(oldestKey);
        }

        res.json({
            success: true,
            sessionId,
            results
        });

    } catch (err) {
        console.error('Analysis error:', err);
        res.status(500).json({
            error: 'Analysis failed',
            message: err.message
        });
    }
});

/**
 * GET /api/results/:sessionId - Get stored results
 */
app.get('/api/results/:sessionId', (req, res) => {
    const results = resultsStore.get(req.params.sessionId);
    if (!results) {
        return res.status(404).json({ error: 'Results not found or expired' });
    }
    res.json(results);
});

/**
 * GET /api/download/:sessionId - Download JSON results
 */
app.get('/api/download/:sessionId', (req, res) => {
    const results = resultsStore.get(req.params.sessionId);
    if (!results) {
        return res.status(404).json({ error: 'Results not found or expired' });
    }

    // Create downloadable JSON (without graph_data to match spec)
    const downloadData = {
        suspicious_accounts: results.suspicious_accounts,
        fraud_rings: results.fraud_rings,
        summary: results.summary
    };

    res.setHeader('Content-Disposition', 'attachment; filename=forensics_results.json');
    res.setHeader('Content-Type', 'application/json');
    res.json(downloadData);
});

/**
 * Parse CSV string into array of transaction objects
 */
function parseCSV(csvString) {
    return new Promise((resolve, reject) => {
        const results = [];
        const stream = Readable.from(csvString);

        stream
            .pipe(csv({
                mapHeaders: ({ header }) => header.trim().toLowerCase(),
                skipEmptyLines: true
            }))
            .on('data', (row) => {
                // Normalize column names (handle various formats)
                const normalized = {};
                for (const [key, value] of Object.entries(row)) {
                    const cleanKey = key.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                    normalized[cleanKey] = value ? value.trim() : value;
                }

                results.push({
                    transaction_id: normalized.transaction_id || normalized.transactionid || normalized.txn_id || normalized.id,
                    sender_id: normalized.sender_id || normalized.senderid || normalized.sender || normalized.from_id,
                    receiver_id: normalized.receiver_id || normalized.receiverid || normalized.receiver || normalized.to_id,
                    amount: parseFloat(normalized.amount || '0'),
                    timestamp: normalized.timestamp || normalized.datetime || normalized.date || normalized.time
                });
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

/**
 * Validate parsed transactions
 */
function validateTransactions(transactions) {
    if (!transactions || transactions.length === 0) {
        return { valid: false, error: 'CSV file is empty or has no valid rows' };
    }

    const errors = [];
    const validTransactions = [];

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        const rowNum = i + 2; // Account for header + 0-index

        if (!tx.transaction_id) {
            errors.push(`Row ${rowNum}: Missing transaction_id`);
            continue;
        }
        if (!tx.sender_id) {
            errors.push(`Row ${rowNum}: Missing sender_id`);
            continue;
        }
        if (!tx.receiver_id) {
            errors.push(`Row ${rowNum}: Missing receiver_id`);
            continue;
        }
        if (isNaN(tx.amount) || tx.amount <= 0) {
            errors.push(`Row ${rowNum}: Invalid amount '${tx.amount}'`);
            continue;
        }
        if (!tx.timestamp || isNaN(Date.parse(tx.timestamp))) {
            errors.push(`Row ${rowNum}: Invalid timestamp '${tx.timestamp}'`);
            continue;
        }

        // Self-transfer check
        if (tx.sender_id === tx.receiver_id) {
            errors.push(`Row ${rowNum}: Self-transfer detected (sender = receiver = ${tx.sender_id})`);
            continue;
        }

        validTransactions.push(tx);
    }

    if (validTransactions.length === 0) {
        return {
            valid: false,
            error: 'No valid transactions found in CSV',
            details: errors.slice(0, 20) // Show first 20 errors
        };
    }

    // Replace original array with valid transactions only
    transactions.length = 0;
    transactions.push(...validTransactions);

    if (errors.length > 0) {
        console.warn(`Skipped ${errors.length} invalid rows during parsing`);
    }

    return { valid: true };
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Forensiq Engine running on port ${PORT}`);
    console.log(`   API endpoint: http://localhost:${PORT}/api/analyze`);
});

module.exports = app;
