/**
 * Smurfing Detector - Detects Fan-in / Fan-out patterns with advanced
 * false-positive reduction via temporal, velocity, time-of-day, and
 * behavioral amount analysis.
 *
 * Fan-in:  Multiple accounts send to one aggregator (10+ senders → 1 receiver)
 * Fan-out: One account disperses to many receivers (1 sender → 10+ receivers)
 *
 * Multi-criteria scoring (out of 100):
 *   1. Structural score   — fan degree (how many counterparties)
 *   2. Temporal burst      — standard deviation of time gaps; tight = suspicious
 *   3. Off-hours activity  — majority of txns between 11 PM – 5 AM
 *   4. Transaction velocity — total amount ÷ time window (hours)
 *   5. Behavioral amounts  — random-looking vs. structured product/salary amounts
 *   6. Legitimacy penalty  — sustained/spread activity lowers score
 */

const FAN_THRESHOLD = 10; // minimum unique counterparties

class SmurfingDetector {
    constructor(adjacencyList, reverseAdjList, nodeMetadata) {
        this.adjList = adjacencyList;
        this.reverseAdjList = reverseAdjList;
        this.nodeMetadata = nodeMetadata;
        this.smurfingGroups = [];
    }

    detect() {
        this._detectFanIn();
        this._detectFanOut();
        this._detectCombinedFanInFanOut();
        return this.smurfingGroups;
    }

    // ───────────────────────────────────────────────── Fan-in ──────
    _detectFanIn() {
        for (const [node, inEdges] of this.reverseAdjList) {
            const uniqueSenders = new Set(inEdges.map(e => e.from));
            if (uniqueSenders.size < FAN_THRESHOLD) continue;

            const txs = inEdges.map(e => ({
                counterparty: e.from,
                timestamp: e.timestamp,
                amount: e.amount
            }));

            const score = this._computeSmurfScore(node, txs, 'fan_in');

            if (score >= 40) {
                const members = [node, ...uniqueSenders];
                const windowHrs = this._timeWindowHours(txs);

                this.smurfingGroups.push({
                    type: 'fan_in',
                    aggregatorNode: node,
                    members,
                    score,
                    temporalWindowHours: windowHrs
                });
            }
        }
    }

    // ───────────────────────────────────────────────── Fan-out ─────
    _detectFanOut() {
        for (const [node, outEdges] of this.adjList) {
            const uniqueReceivers = new Set(outEdges.map(e => e.to));
            if (uniqueReceivers.size < FAN_THRESHOLD) continue;

            const txs = outEdges.map(e => ({
                counterparty: e.to,
                timestamp: e.timestamp,
                amount: e.amount
            }));

            const score = this._computeSmurfScore(node, txs, 'fan_out');

            if (score >= 40) {
                const members = [node, ...uniqueReceivers];
                const windowHrs = this._timeWindowHours(txs);

                this.smurfingGroups.push({
                    type: 'fan_out',
                    disperserNode: node,
                    members,
                    score,
                    temporalWindowHours: windowHrs
                });
            }
        }
    }

    // ─────────────────────────────────── Combined Fan-in + Fan-out ─
    _detectCombinedFanInFanOut() {
        for (const [node, meta] of this.nodeMetadata) {
            if (meta.uniqueSenders >= FAN_THRESHOLD && meta.uniqueReceivers >= FAN_THRESHOLD) {
                const alreadyFlagged = this.smurfingGroups.some(g =>
                    g.aggregatorNode === node || g.disperserNode === node
                );

                if (!alreadyFlagged) {
                    const inEdges = this.reverseAdjList.get(node) || [];
                    const outEdges = this.adjList.get(node) || [];
                    const allTxs = [
                        ...inEdges.map(e => ({ counterparty: e.from, timestamp: e.timestamp, amount: e.amount })),
                        ...outEdges.map(e => ({ counterparty: e.to, timestamp: e.timestamp, amount: e.amount }))
                    ];

                    const score = this._computeSmurfScore(node, allTxs, 'fan_in_fan_out');

                    if (score >= 40) {
                        const senders = new Set(inEdges.map(e => e.from));
                        const receivers = new Set(outEdges.map(e => e.to));
                        this.smurfingGroups.push({
                            type: 'fan_in_fan_out',
                            aggregatorNode: node,
                            disperserNode: node,
                            members: [node, ...senders, ...receivers],
                            score,
                            temporalWindowHours: this._timeWindowHours(allTxs)
                        });
                    }
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Core multi-criteria scoring engine
    // ═══════════════════════════════════════════════════════════════
    _computeSmurfScore(node, transactions, patternType) {
        if (transactions.length === 0) return 0;

        const counterparties = new Set(transactions.map(t => t.counterparty));
        const amounts = transactions.map(t => t.amount);
        const timestamps = transactions.map(t => t.timestamp).sort((a, b) => a - b);

        let score = 0;

        // ─── 1. Structural: fan degree ──────────────────────── (max 25)
        score += this._scoreStructural(counterparties.size);

        // ─── 2. Temporal burst ──────────────────────────────── (max 25)
        score += this._scoreTemporalBurst(timestamps);

        // ─── 3. Off-hours activity ──────────────────────────── (max 15)
        score += this._scoreOffHours(timestamps);

        // ─── 4. Transaction velocity ────────────────────────── (max 20)
        score += this._scoreVelocity(amounts, timestamps);

        // ─── 5. Behavioral amount analysis ──────────────────── (max 15)
        score += this._scoreBehavioralAmounts(amounts);

        // ─── 6. Throughput ratio (pass-through mule) ────────── (max 10)
        score += this._scoreThroughput(node);

        // ─── 7. Legitimacy penalty (sustained/spread = legit) ─ (deducts)
        score -= this._legitimacyPenalty(node, timestamps, amounts, patternType);

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    // ──────────────────────── 1. Structural score ─────────────
    _scoreStructural(fanDegree) {
        // 10 counterparties = 10 pts, scales up to 25
        if (fanDegree >= 30) return 25;
        if (fanDegree >= 20) return 20;
        if (fanDegree >= 15) return 15;
        return 10;
    }

    // ──────────────────────── 2. Temporal burst ───────────────
    // Low stddev of inter-tx gaps = bursty/unnatural
    _scoreTemporalBurst(timestamps) {
        if (timestamps.length < 3) return 0;

        // Compute time deltas (in hours)
        const deltas = [];
        for (let i = 1; i < timestamps.length; i++) {
            deltas.push((timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60));
        }

        const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        const variance = deltas.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / deltas.length;
        const stdDev = Math.sqrt(variance);

        // Total time window in hours
        const windowHours = (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60);

        // Very tight window (< 6 hrs for 10+ txns) → max burst score
        if (windowHours < 6 && timestamps.length >= 10) return 25;
        // Tight window (< 12 hrs) → high burst
        if (windowHours < 12 && timestamps.length >= 10) return 22;
        // Low stddev relative to mean → suspiciously regular/rapid
        if (mean > 0 && stdDev / mean < 0.3 && windowHours < 24) return 20;
        // Moderate burst
        if (windowHours < 24) return 12;
        // Spread over multiple days but still a burst pattern
        if (windowHours < 72) return 6;

        return 0; // Sustained over many days = likely legitimate
    }

    // ──────────────────────── 3. Off-hours activity ───────────
    _scoreOffHours(timestamps) {
        if (timestamps.length < 5) return 0;

        let offHoursCount = 0;
        for (const ts of timestamps) {
            const hour = ts.getHours();
            // 11 PM (23) to 5 AM (4) = off-hours
            if (hour >= 23 || hour <= 4) {
                offHoursCount++;
            }
        }

        const offHoursRatio = offHoursCount / timestamps.length;

        if (offHoursRatio > 0.7) return 15;     // Overwhelming off-hours
        if (offHoursRatio > 0.5) return 10;     // Majority off-hours
        if (offHoursRatio > 0.3) return 5;      // Notable off-hours

        return 0; // Mostly business hours = normal
    }

    // ──────────────────────── 4. Transaction velocity ──────────
    _scoreVelocity(amounts, timestamps) {
        if (timestamps.length < 2) return 0;

        const totalAmount = amounts.reduce((a, b) => a + b, 0);
        const windowHours = Math.max(
            (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60),
            0.1
        );
        const velocityPerHour = totalAmount / windowHours;

        // Very high velocity: >$2000/hr flowing through a single node
        if (velocityPerHour > 5000) return 20;
        if (velocityPerHour > 2000) return 15;
        if (velocityPerHour > 1000) return 10;
        if (velocityPerHour > 500) return 5;

        return 0; // Low velocity = normal business
    }

    // ──────────────────────── 5. Behavioral amount analysis ────
    _scoreBehavioralAmounts(amounts) {
        if (amounts.length < 5) return 0;

        let score = 0;

        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const cv = avg > 0
            ? Math.sqrt(amounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / amounts.length) / avg
            : 0;

        // ── Structuring: amounts just below reporting threshold ($10,000) ──
        const structuringCount = amounts.filter(a => a >= 8000 && a < 10000).length;
        if (structuringCount / amounts.length > 0.3) {
            score += 8;
        }

        // ── Randomized amounts (Smurfing often uses random-looking amounts) ──
        // Mid-range CV (0.2–0.6) with amounts between $500–$2000 = suspicious
        if (cv >= 0.2 && cv <= 0.6) {
            const midRange = amounts.filter(a => a >= 200 && a <= 3000);
            if (midRange.length / amounts.length > 0.6) {
                score += 5;
            }
        }

        // ── Very uniform amounts with unrounded values = possible payroll (LEGIT) ──
        // e.g., $2412.33 repeated → this REDUCES suspicion (handled in penalty)

        // ── All amounts have decimal cents (typical of payroll) = legit signal ──
        const decimalAmounts = amounts.filter(a => {
            const cents = Math.round((a % 1) * 100);
            return cents !== 0; // Has cents
        });
        if (decimalAmounts.length / amounts.length > 0.7) {
            // Precision amounts = likely payroll/invoicing, not smurfing
            score -= 5;
        }

        return Math.max(0, Math.min(15, score));
    }

    // ──────────────────────── 6. Throughput ratio ──────────────
    _scoreThroughput(node) {
        const meta = this.nodeMetadata.get(node);
        if (!meta) return 0;

        // Money passes through almost unchanged (received ≈ sent)
        // Ratio close to 1.0 = pure pass-through mule
        if (meta.throughputRatio > 0.7 && meta.throughputRatio < 1.3 && meta.totalReceived > 0 && meta.totalSent > 0) {
            return 10;
        }
        return 0;
    }

    // ──────────────────────── 7. Legitimacy penalty ────────────
    // Deducts score for patterns that look like legitimate merchants/payroll
    _legitimacyPenalty(node, timestamps, amounts, patternType) {
        let penalty = 0;
        const meta = this.nodeMetadata.get(node);
        if (!meta) return 0;

        // ── A. Sustained activity (> 3 days) = likely legitimate ──
        if (timestamps.length >= 2) {
            const windowHours = (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60);
            if (windowHours > 72) penalty += 10;     // > 3 days
            if (windowHours > 168) penalty += 10;    // > 1 week
            if (windowHours > 720) penalty += 15;    // > 30 days
        }

        // ── B. Business-hours transactions (> 70% in 8 AM – 6 PM) ──
        if (timestamps.length >= 5) {
            let businessHoursCount = 0;
            for (const ts of timestamps) {
                const hour = ts.getHours();
                if (hour >= 8 && hour <= 18) businessHoursCount++;
            }
            const businessRatio = businessHoursCount / timestamps.length;
            if (businessRatio > 0.7) penalty += 10; // Mostly business hours
        }

        // ── C. Regular time intervals (payroll/scheduled = legit) ──
        if (timestamps.length >= 5) {
            const deltas = [];
            for (let i = 1; i < timestamps.length; i++) {
                deltas.push(timestamps[i] - timestamps[i - 1]);
            }
            const dayMs = 24 * 60 * 60 * 1000;
            const commonIntervals = [dayMs, 7 * dayMs, 14 * dayMs, 30 * dayMs];

            for (const interval of commonIntervals) {
                const closeCount = deltas.filter(d => {
                    const ratio = d / interval;
                    return ratio > 0.8 && ratio < 1.2;
                }).length;
                if (closeCount / deltas.length > 0.5) {
                    penalty += 15; // Regular schedule = very likely legitimate
                    break;
                }
            }
        }

        // ── D. Amount regularity (payroll: same amounts repeated) ──
        if (amounts.length >= 5) {
            const rounded = amounts.map(a => Math.round(a * 100) / 100);
            const freq = new Map();
            for (const a of rounded) {
                freq.set(a, (freq.get(a) || 0) + 1);
            }
            const maxFreq = Math.max(...freq.values());
            // If a single amount appears in > 40% of txns, likely salary/subscription
            if (maxFreq / amounts.length > 0.4) {
                penalty += 10;
            }
        }

        // ── E. Fan-in with one-way flow & no overlap = likely merchant ──
        if (patternType === 'fan_in') {
            const inEdges = this.reverseAdjList.get(node) || [];
            const outEdges = this.adjList.get(node) || [];
            const senders = new Set(inEdges.map(e => e.from));
            const receivers = new Set(outEdges.map(e => e.to));

            // Merchant: receives from many, sends to few, minimal overlap
            if (receivers.size <= 5 && senders.size >= 15) {
                let overlap = 0;
                for (const r of receivers) {
                    if (senders.has(r)) overlap++;
                }
                if (overlap / Math.max(senders.size, 1) < 0.1) {
                    penalty += 15; // Very merchant-like
                }
            }
        }

        // ── F. Fan-out with no return flow & regular amounts = payroll ──
        if (patternType === 'fan_out') {
            const outEdges = this.adjList.get(node) || [];
            const inEdges = this.reverseAdjList.get(node) || [];
            const receivers = new Set(outEdges.map(e => e.to));
            const senders = new Set(inEdges.map(e => e.from));

            if (senders.size <= 5 && receivers.size >= 10) {
                let overlap = 0;
                for (const r of receivers) {
                    if (senders.has(r)) overlap++;
                }
                if (overlap === 0) {
                    penalty += 10; // Disbursement/payroll-like
                }
            }
        }

        return penalty;
    }

    // ─────────────────────────── Helper ────────────────────────
    _timeWindowHours(txs) {
        if (txs.length < 2) return null;
        const sorted = txs.map(t => t.timestamp).sort((a, b) => a - b);
        return Math.round((sorted[sorted.length - 1] - sorted[0]) / (1000 * 60 * 60) * 10) / 10;
    }
}

module.exports = SmurfingDetector;
