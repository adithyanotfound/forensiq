/**
 * ScoringEngine — Deterministic Risk Score + Suspicion Score Engine
 *
 * ═══════════════════════════════════════════════════════════════════
 * ACCOUNT-LEVEL  suspicion_score  (0–100)
 * ═══════════════════════════════════════════════════════════════════
 *   S_account = min(100, max(0, (W1·PTR) + (W2·V) + PM − FPP))
 *
 *   PTR  = min(Total_In, Total_Out) / max(Total_In, Total_Out)
 *   V    = txns_in_72h_window / total_txns
 *   PM   = Pattern Modifier (+20 cycle, +25 smurf agg, +25 smurf disp, +30 shell)
 *   FPP  = 50  if txCount > 50 AND PTR < 0.3, else 0
 *   W1   = 35, W2 = 35
 *
 * ═══════════════════════════════════════════════════════════════════
 * RING-LEVEL  risk_score  (0–100)
 * ═══════════════════════════════════════════════════════════════════
 *   S_ring = min(100, avg(S_account) + T_density + C_severity)
 *
 *   T_density  = +15 if all ring txns fall within 72 hours
 *   C_severity = +10 (cycle) | +15 (shell chain > 3 hops) | +20 (smurf ≥ 25 accts)
 *
 * No ML. Fully deterministic and explainable.
 */

class ScoringEngine {
    /**
     * @param {Array} transactions     — [{sender_id, receiver_id, amount, timestamp, transaction_id}]
     * @param {Map}   adjacencyList    — node → [{to, amount, timestamp, txId}]
     * @param {Map}   reverseAdjList   — node → [{from, amount, timestamp, txId}]
     * @param {Map}   nodeMetadata     — node → {totalSent, totalReceived, txCount, inDegree, outDegree, allTimestamps, …}
     */
    constructor(transactions, adjacencyList, reverseAdjList, nodeMetadata) {
        this.transactions = transactions;
        this.adjList = adjacencyList;
        this.reverseAdjList = reverseAdjList;
        this.nodeMetadata = nodeMetadata;
    }

    // ═════════════════════════════════════════════════════════════════
    //  PART 1 — SUSPICION SCORE  (Account Level)
    //  S = min(100, max(0, W1·PTR + W2·V + PM − FPP))
    // ═════════════════════════════════════════════════════════════════

    /**
     * Compute the Suspicion Score for a single account.
     *
     * @param {string} accountId
     * @param {Array}  detectedPatterns — e.g. ['cycle_length_3', 'fan_in', 'shell_intermediary']
     * @returns {Object} scoring result with UI-compatible field names
     */
    computeSuspicionScore(accountId, detectedPatterns) {
        const W1 = 35;
        const W2 = 35;

        const meta = this.nodeMetadata.get(accountId);
        if (!meta) {
            return this._emptySuspicionResult();
        }

        // ── PTR (Pass-Through Rate) ──────────────────────────────
        // PTR = min(In, Out) / max(In, Out)
        // Close to 1.0 ⇒ money passes straight through (mule behavior)
        const totalIn = meta.totalReceived || 0;
        const totalOut = meta.totalSent || 0;
        const maxIO = Math.max(totalIn, totalOut);
        const ptr = maxIO > 0 ? Math.min(totalIn, totalOut) / maxIO : 0;

        // ── V (Temporal Velocity — 72-hour window) ───────────────
        // V = max txns in any 72h sliding window / total txns
        const velocity = this._computeVelocity72h(meta.allTimestamps || []);

        // ── PM (Pattern Modifier) ────────────────────────────────
        const pm = this._computePatternModifier(detectedPatterns, meta);

        // ── FPP (False Positive Penalty) ─────────────────────────
        // High-volume accounts with LOW pass-through are likely merchants/payroll
        const fpp = (meta.txCount > 50 && ptr < 0.3) ? 50 : 0;

        // ── Final Suspicion Score ────────────────────────────────
        const rawScore = (W1 * ptr) + (W2 * velocity) + pm - fpp;
        const suspicion_score = Math.min(100, Math.max(0, Math.round(rawScore * 10) / 10));

        // Interpretation
        let suspicion_label;
        if (suspicion_score >= 75) suspicion_label = 'High Risk';
        else if (suspicion_score >= 50) suspicion_label = 'Suspicious';
        else if (suspicion_score >= 20) suspicion_label = 'Monitor';
        else suspicion_label = 'Stable / Merchant';

        // Return with UI-compatible field names
        // (field names match existing frontend expectations)
        return {
            suspicion_score,
            suspicion_label,
            // Top-level summary values (shown in section headers)
            acceleration_score: Math.round(ptr * 1000) / 1000,
            stability_score: fpp > 0 ? 1 : 0,
            ring_participation_bonus: Math.round((pm / 100) * 1000) / 1000,
            // Detailed breakdown
            acceleration_details: {
                burst_ratio: Math.round(ptr * 1000) / 1000,
                flow_ratio: Math.round(velocity * 1000) / 1000,
                short_lifespan_factor: Math.round((pm / 100) * 1000) / 1000,
                velocity_ratio: Math.round((fpp / 100) * 1000) / 1000
            },
            stability_details: {
                amount_diversity: Math.round(ptr * 1000) / 1000,
                active_hours_spread: Math.round(velocity * 1000) / 1000,
                sink_behavior: Math.round((1 - ptr) * 1000) / 1000
            }
        };
    }

    /**
     * PM (Pattern Modifier) — fixed points based on structural role.
     * Each role can contribute at most once.
     *
     *   Cycle Member:      +20
     *   Smurf Aggregator:  +25  (fan_in, receiving from 10+ senders)
     *   Smurf Disperser:   +25  (fan_out, sending to 10+ receivers)
     *   Shell Account:     +30  (shell_intermediary with 2-3 total txns)
     */
    _computePatternModifier(detectedPatterns, meta) {
        let pm = 0;
        const patterns = new Set(detectedPatterns || []);

        let hasCycle = false;
        let hasFanIn = false;
        let hasFanOut = false;
        let hasShell = false;

        for (const p of patterns) {
            if (!hasCycle && p.includes('cycle')) {
                pm += 20;
                hasCycle = true;
            }
            if (!hasFanIn && p === 'fan_in') {
                pm += 25;
                hasFanIn = true;
            }
            if (!hasFanOut && p === 'fan_out') {
                pm += 25;
                hasFanOut = true;
            }
            if (!hasShell && (p === 'shell_intermediary' || p === 'shell_network_endpoint')) {
                // Shell account: intermediate node in 3+ hop chain
                // Extra weight if the node has exactly 2-3 total transactions
                if (meta && meta.txCount <= 3) {
                    pm += 30;
                } else {
                    pm += 15; // endpoint or higher-activity shell participant
                }
                hasShell = true;
            }
        }

        return pm;
    }

    /**
     * V (Velocity) — max transactions in any 72-hour sliding window / total txns.
     * Returns a value between 0 and 1.
     */
    _computeVelocity72h(allTimestamps) {
        if (!allTimestamps || allTimestamps.length <= 1) return 1; // single tx = 100% in window

        const sorted = allTimestamps.map(t => t.getTime()).sort((a, b) => a - b);
        const window72h = 72 * 3600 * 1000;
        let maxInWindow = 1;

        for (let i = 0; i < sorted.length; i++) {
            const windowEnd = sorted[i] + window72h;
            let j = i;
            while (j < sorted.length && sorted[j] <= windowEnd) j++;
            maxInWindow = Math.max(maxInWindow, j - i);
        }

        return maxInWindow / sorted.length;
    }

    /**
     * Empty result for accounts with no metadata.
     */
    _emptySuspicionResult() {
        return {
            suspicion_score: 0,
            suspicion_label: 'Stable / Merchant',
            acceleration_score: 0,
            stability_score: 0,
            ring_participation_bonus: 0,
            acceleration_details: {
                burst_ratio: 0,
                flow_ratio: 0,
                short_lifespan_factor: 0,
                velocity_ratio: 0
            },
            stability_details: {
                amount_diversity: 0,
                active_hours_spread: 0,
                sink_behavior: 0
            }
        };
    }


    // ═════════════════════════════════════════════════════════════════
    //  PART 2 — RISK SCORE  (Ring Level)
    //  S_ring = min(100, avg(S_account) + T_density + C_severity)
    // ═════════════════════════════════════════════════════════════════

    /**
     * Compute the Risk Score for a single fraud ring.
     *
     * @param {Object} ring                 — ring with pattern_type, member_accounts, etc.
     * @param {Array}  memberSuspicionScores — suspicion_scores of all member accounts
     * @param {Array}  ringTransactions      — transactions among ring members
     * @returns {Object} { risk_score, risk_label, risk_details }
     */
    computeRiskScore(ring, memberSuspicionScores, ringTransactions) {
        // ── avg(S_account) ───────────────────────────────────────
        const avgAccountSuspicion = memberSuspicionScores.length > 0
            ? memberSuspicionScores.reduce((a, b) => a + b, 0) / memberSuspicionScores.length
            : 0;

        // ── T_density (+15 if entire pattern executes within 72h) ─
        let tDensity = 0;
        const timestamps = ringTransactions
            .map(tx => new Date(tx.timestamp).getTime())
            .filter(t => !isNaN(t))
            .sort((a, b) => a - b);

        if (timestamps.length >= 2) {
            const spanHours = (timestamps[timestamps.length - 1] - timestamps[0]) / (3600 * 1000);
            if (spanHours <= 72) tDensity = 15;
        } else {
            tDensity = 15; // single or zero txns trivially within 72h
        }

        // ── C_severity (complexity / severity bonus) ─────────────
        const patternType = this._normalizePatternType(ring.pattern_type);
        let cSeverity = 0;
        if (patternType === 'cycle_ring') {
            // Cycles of length 3-5
            cSeverity = 10;
        } else if (patternType === 'layered_chain') {
            // Shell chains: +15 if > 3 hops, else +10
            const hopLength = ring.chain_length
                ? ring.chain_length - 1
                : ring.member_accounts.length - 1;
            cSeverity = hopLength > 3 ? 15 : 10;
        } else if (patternType === 'smurf_cluster') {
            // Massive smurfing: +20 if ≥ 25 accounts, else +10
            cSeverity = ring.member_accounts.length >= 25 ? 20 : 10;
        }

        // ── Final Ring Risk Score ────────────────────────────────
        const rawRisk = avgAccountSuspicion + tDensity + cSeverity;
        const risk_score = Math.min(100, Math.max(0, Math.round(rawRisk * 10) / 10));

        // Interpretation
        let risk_label;
        if (risk_score >= 80) risk_label = 'Critical';
        else if (risk_score >= 60) risk_label = 'High';
        else if (risk_score >= 40) risk_label = 'Medium';
        else risk_label = 'Low';

        // Extract ring features for the detail panel
        const features = this._extractRingFeatures(ring, ringTransactions);

        return {
            risk_score,
            risk_label,
            risk_details: {
                base_score: Math.round(avgAccountSuspicion * 10) / 10,
                pattern_type_normalized: patternType,
                features,
                bonuses: {
                    time_compression: tDensity,     // T_density
                    flow_through: cSeverity,        // C_severity
                    shell_density: 0,
                    hop_length: 0
                }
            }
        };
    }

    /**
     * Extract ring features for the detail panel display.
     */
    _extractRingFeatures(ring, ringTransactions) {
        const members = ring.member_accounts;
        const ringSize = members.length;

        // hop_length
        const hopLength = ring.chain_length
            ? ring.chain_length - 1
            : ring.cycle_length
                ? ring.cycle_length
                : members.length;

        // Timestamps
        const timestamps = ringTransactions
            .map(tx => new Date(tx.timestamp).getTime())
            .filter(t => !isNaN(t))
            .sort((a, b) => a - b);

        let totalTimeWindowHours = 0;
        if (timestamps.length >= 2) {
            totalTimeWindowHours = (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60);
        }

        let avgInterTxnGap = 0;
        if (timestamps.length >= 2) {
            const gaps = [];
            for (let i = 1; i < timestamps.length; i++) {
                gaps.push((timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60));
            }
            avgInterTxnGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        }

        const totalAmountMoved = ringTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

        // shell_node_ratio: nodes with degree ≤ 2
        let shellNodeCount = 0;
        for (const member of members) {
            const meta = this.nodeMetadata.get(member);
            if (meta) {
                const totalDegree = (meta.inDegree || 0) + (meta.outDegree || 0);
                if (totalDegree <= 2) shellNodeCount++;
            }
        }
        const shellNodeRatio = ringSize > 0 ? shellNodeCount / ringSize : 0;

        // inflow_outflow_ratio
        let inflowOutflowRatio = null;
        const memberSet = new Set(members);
        let totalInflow = 0;
        let totalOutflow = 0;
        for (const member of members) {
            const inEdges = this.reverseAdjList.get(member) || [];
            for (const e of inEdges) {
                if (!memberSet.has(e.from)) totalInflow += e.amount;
            }
            const outEdges = this.adjList.get(member) || [];
            for (const e of outEdges) {
                if (!memberSet.has(e.to)) totalOutflow += e.amount;
            }
        }
        if (totalOutflow > 0) {
            inflowOutflowRatio = totalInflow / totalOutflow;
        } else if (totalInflow > 0) {
            inflowOutflowRatio = Infinity;
        }

        return {
            ring_size: ringSize,
            hop_length: hopLength,
            total_time_window_hours: Math.round(totalTimeWindowHours * 100) / 100,
            average_inter_txn_gap: Math.round(avgInterTxnGap * 100) / 100,
            total_amount_moved: Math.round(totalAmountMoved * 100) / 100,
            shell_node_ratio: Math.round(shellNodeRatio * 100) / 100,
            inflow_outflow_ratio: inflowOutflowRatio !== null
                ? Math.round(inflowOutflowRatio * 100) / 100
                : null
        };
    }

    /**
     * Map internal pattern types to canonical types.
     */
    _normalizePatternType(patternType) {
        switch (patternType) {
            case 'shell_network':
            case 'layered_chain':
                return 'layered_chain';
            case 'fan_in':
            case 'fan_out':
            case 'fan_in_fan_out':
            case 'smurf_cluster':
                return 'smurf_cluster';
            case 'cycle':
            case 'cycle_ring':
                return 'cycle_ring';
            default:
                return patternType;
        }
    }


    // ═════════════════════════════════════════════════════════════════
    //  BATCH METHODS
    // ═════════════════════════════════════════════════════════════════

    /**
     * Find transactions whose sender AND receiver are both ring members.
     */
    static findRingTransactions(transactions, memberAccounts) {
        const memberSet = new Set(memberAccounts);
        return transactions.filter(tx =>
            memberSet.has(tx.sender_id) && memberSet.has(tx.receiver_id)
        );
    }

    /**
     * STEP 1 — Score all accounts (suspicion scores).
     * Must be called BEFORE scoreAllRings because risk scores depend on these.
     *
     * @param {Array} accounts — [{account_id, detected_patterns, ring_id, …}]
     * @returns {Array} accounts enriched with suspicion_score, suspicion_label, scoring_details
     */
    scoreAllAccounts(accounts) {
        const scoredAccounts = [];
        const processedIds = new Set();

        for (const acc of accounts) {
            if (processedIds.has(acc.account_id)) continue;
            processedIds.add(acc.account_id);

            const scoring = this.computeSuspicionScore(
                acc.account_id,
                acc.detected_patterns || []
            );

            scoredAccounts.push({
                ...acc,
                suspicion_score: scoring.suspicion_score,
                suspicion_label: scoring.suspicion_label,
                scoring_details: {
                    acceleration_score: scoring.acceleration_score,
                    stability_score: scoring.stability_score,
                    ring_participation_bonus: scoring.ring_participation_bonus,
                    acceleration_details: scoring.acceleration_details,
                    stability_details: scoring.stability_details
                }
            });
        }

        // Sort by suspicion score descending
        scoredAccounts.sort((a, b) => b.suspicion_score - a.suspicion_score);
        return scoredAccounts;
    }

    /**
     * STEP 2 — Score all rings (risk scores).
     * Must be called AFTER scoreAllAccounts.
     *
     * @param {Array} fraudRings     — [{ring_id, member_accounts, pattern_type, …}]
     * @param {Array} scoredAccounts — accounts with suspicion_score already set
     * @returns {Array} rings enriched with risk_score, risk_label, risk_details
     */
    scoreAllRings(fraudRings, scoredAccounts) {
        // Build lookup: accountId → suspicion_score
        const suspicionLookup = new Map();
        for (const acc of scoredAccounts) {
            suspicionLookup.set(acc.account_id, acc.suspicion_score);
        }

        return fraudRings.map(ring => {
            const memberScores = ring.member_accounts
                .map(m => suspicionLookup.get(m) || 0);

            const ringTxns = ScoringEngine.findRingTransactions(
                this.transactions, ring.member_accounts
            );

            const scoring = this.computeRiskScore(ring, memberScores, ringTxns);

            return {
                ...ring,
                risk_score: scoring.risk_score,
                risk_label: scoring.risk_label,
                risk_details: scoring.risk_details
            };
        });
    }
}

module.exports = ScoringEngine;
