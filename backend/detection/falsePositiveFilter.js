/**
 * False Positive Filter - Removes legitimate high-volume accounts
 *
 * Identifies and filters out:
 * 1. Merchant accounts  — receive from many unique senders, sustained/business-hours
 * 2. Payroll accounts   — send to many unique receivers with regular amounts & schedules
 * 3. Exchange/platform  — very high in AND out degree, low sender-receiver overlap
 * 4. Counterparties     — customers/employees of legitimate hubs
 *
 * Uses the same temporal, velocity, off-hours and behavioral signals
 * as the SmurfingDetector so detection and filtering are consistent.
 */

class FalsePositiveFilter {
    constructor(adjacencyList, reverseAdjList, nodeMetadata) {
        this.adjList = adjacencyList;
        this.reverseAdjList = reverseAdjList;
        this.nodeMetadata = nodeMetadata;
        this.legitimateAccounts = new Set();
        this.legitimateHubs = new Set();
    }

    /**
     * Detect all legitimate accounts and return the set
     */
    detectLegitimate() {
        this._detectMerchants();
        this._detectPayroll();
        this._detectExchangePlatforms();
        this._markCounterpartiesOfLegitimateHubs();
        return this.legitimateAccounts;
    }

    /**
     * Filter suspicious results, removing false positives
     */
    filterResults(suspiciousAccounts, fraudRings) {
        const filteredAccounts = suspiciousAccounts.filter(acc => {
            return !this.legitimateAccounts.has(acc.account_id);
        });

        const filteredRings = [];
        for (const ring of fraudRings) {
            // If the ring's central hub is a legitimate account, drop the entire ring
            const centralNode = ring.aggregatorNode || ring.disperserNode || null;
            if (centralNode && this.legitimateHubs.has(centralNode)) {
                continue;
            }

            // Check if ring has a legitimate hub as member
            const hasLegitimateHub = ring.member_accounts.some(id => this.legitimateHubs.has(id));
            if (hasLegitimateHub) {
                continue;
            }

            // Remove legitimate accounts from ring members
            const filteredMembers = ring.member_accounts.filter(
                id => !this.legitimateAccounts.has(id)
            );

            // Only keep rings with at least 3 members after filtering
            if (filteredMembers.length >= 3) {
                filteredRings.push({
                    ...ring,
                    member_accounts: filteredMembers
                });
            }
        }

        return { filteredAccounts, filteredRings };
    }

    // ═════════════════════════════════════════════════════════════
    //  Merchant Detection
    // ═════════════════════════════════════════════════════════════
    _detectMerchants() {
        for (const [node, meta] of this.nodeMetadata) {
            // Merchant pattern: high in-degree, very low out-degree
            if (meta.uniqueSenders >= 10 && meta.uniqueReceivers <= 5) {
                const inEdges = this.reverseAdjList.get(node) || [];
                const outEdges = this.adjList.get(node) || [];
                const senders = new Set(inEdges.map(e => e.from));
                const receivers = new Set(outEdges.map(e => e.to));

                // Calculate overlap between senders and receivers
                let overlap = 0;
                for (const r of receivers) {
                    if (senders.has(r)) overlap++;
                }

                // Low overlap = one-way flow (merchant receiving payments)
                if (overlap / Math.max(senders.size, 1) < 0.2) {
                    let legitimacyScore = 0;

                    // ── Amount variance: merchants receive diverse amounts (different products)
                    const inAmounts = inEdges.map(e => e.amount);
                    if (inAmounts.length > 5) {
                        const avg = inAmounts.reduce((a, b) => a + b, 0) / inAmounts.length;
                        const cv = avg > 0
                            ? Math.sqrt(inAmounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / inAmounts.length) / avg
                            : 0;
                        if (cv > 0.4) legitimacyScore += 20; // Diverse amounts
                    }

                    // ── Temporal spread: merchants receive over many days
                    const timestamps = inEdges.map(e => e.timestamp).sort((a, b) => a - b);
                    if (timestamps.length >= 2) {
                        const windowHours = (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60);
                        if (windowHours > 168) legitimacyScore += 25;       // > 1 week
                        else if (windowHours > 72) legitimacyScore += 15;   // > 3 days
                    }

                    // ── Business hours: merchants receive during the day
                    if (timestamps.length >= 5) {
                        let businessCount = 0;
                        for (const ts of timestamps) {
                            const hour = ts.getHours();
                            if (hour >= 8 && hour <= 20) businessCount++;
                        }
                        if (businessCount / timestamps.length > 0.6) legitimacyScore += 20;
                    }

                    // ── Even spacing between transactions (consistent traffic)
                    if (timestamps.length >= 5) {
                        const deltas = [];
                        for (let i = 1; i < timestamps.length; i++) {
                            deltas.push((timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60));
                        }
                        const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
                        if (mean > 0) {
                            const cv = Math.sqrt(deltas.reduce((s, d) => s + Math.pow(d - mean, 2), 0) / deltas.length) / mean;
                            if (cv < 0.8) legitimacyScore += 15; // Consistent spacing
                        }
                    }

                    // ── Low velocity: merchants don't have insane $/hr
                    if (timestamps.length >= 2) {
                        const totalAmt = inAmounts.reduce((a, b) => a + b, 0);
                        const windowH = Math.max((timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60), 0.1);
                        const velocity = totalAmt / windowH;
                        if (velocity < 500) legitimacyScore += 10;
                    }

                    // Mark as legitimate if enough signals
                    if (legitimacyScore >= 40) {
                        this.legitimateAccounts.add(node);
                        this.legitimateHubs.add(node);
                    }
                }
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  Payroll Detection
    // ═════════════════════════════════════════════════════════════
    _detectPayroll() {
        for (const [node, meta] of this.nodeMetadata) {
            // Payroll pattern: sends to many, receives from few
            if (meta.uniqueReceivers >= 10 && meta.uniqueSenders <= 5) {
                const outEdges = this.adjList.get(node) || [];
                const inEdges = this.reverseAdjList.get(node) || [];
                if (outEdges.length < 10) continue;

                const receivers = new Set(outEdges.map(e => e.to));
                const senders = new Set(inEdges.map(e => e.from));

                // No circular flow (receivers don't send back)
                let overlap = 0;
                for (const r of receivers) {
                    if (senders.has(r)) overlap++;
                }
                if (overlap > 0) continue; // Circular flow = possible mule

                let legitimacyScore = 0;

                // ── Amount regularity: payroll sends similar/identical amounts
                const amounts = outEdges.map(e => e.amount);
                const amountGroups = this._groupAmounts(amounts, 0.1);
                const largestGroupSize = Math.max(...amountGroups.map(g => g.length));
                if (largestGroupSize / amounts.length > 0.3) legitimacyScore += 20;

                // ── Exact decimal amounts (e.g., $2412.33) = salary precision
                const decimalCount = amounts.filter(a => {
                    const cents = Math.round((a % 1) * 100);
                    return cents !== 0;
                }).length;
                if (decimalCount / amounts.length > 0.5) legitimacyScore += 15;

                // ── Repeat payments to same receivers (pay cycles)
                const receiverCounts = new Map();
                for (const edge of outEdges) {
                    receiverCounts.set(edge.to, (receiverCounts.get(edge.to) || 0) + 1);
                }
                const repeatReceivers = [...receiverCounts.values()].filter(c => c >= 2).length;
                if (repeatReceivers / receivers.size > 0.4) legitimacyScore += 15;

                // ── Temporal regularity (consistent scheduling)
                const timestamps = outEdges.map(e => e.timestamp).sort((a, b) => a - b);
                if (this._checkTemporalRegularity(timestamps)) legitimacyScore += 20;

                // ── Business hours disbursement
                if (timestamps.length >= 5) {
                    let businessCount = 0;
                    for (const ts of timestamps) {
                        const hour = ts.getHours();
                        if (hour >= 8 && hour <= 18) businessCount++;
                    }
                    if (businessCount / timestamps.length > 0.7) legitimacyScore += 10;
                }

                // ── Sustained activity (spread over many days)
                if (timestamps.length >= 2) {
                    const windowHours = (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60);
                    if (windowHours > 168) legitimacyScore += 15;     // > 1 week
                    else if (windowHours > 72) legitimacyScore += 10; // > 3 days
                }

                if (legitimacyScore >= 40) {
                    this.legitimateAccounts.add(node);
                    this.legitimateHubs.add(node);
                }
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  Exchange / Platform Detection
    // ═════════════════════════════════════════════════════════════
    _detectExchangePlatforms() {
        for (const [node, meta] of this.nodeMetadata) {
            // Exchange/platform: very high both in AND out degree
            if (meta.uniqueSenders >= 20 && meta.uniqueReceivers >= 20) {
                const inEdges = this.reverseAdjList.get(node) || [];
                const outEdges = this.adjList.get(node) || [];
                const senders = new Set(inEdges.map(e => e.from));
                const receivers = new Set(outEdges.map(e => e.to));

                // Low overlap between senders and receivers
                let overlap = 0;
                for (const r of receivers) {
                    if (senders.has(r)) overlap++;
                }
                const overlapRatio = overlap / Math.max(senders.size, receivers.size, 1);

                if (overlapRatio < 0.15) {
                    // Additionally check for sustained activity
                    const allTimestamps = [
                        ...inEdges.map(e => e.timestamp),
                        ...outEdges.map(e => e.timestamp)
                    ].sort((a, b) => a - b);

                    if (allTimestamps.length >= 2) {
                        const windowHours = (allTimestamps[allTimestamps.length - 1] - allTimestamps[0]) / (1000 * 60 * 60);
                        if (windowHours > 48) { // Active for > 2 days = likely platform
                            this.legitimateAccounts.add(node);
                            this.legitimateHubs.add(node);
                        }
                    }
                }
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    //  Mark counterparties of legitimate hubs
    // ═════════════════════════════════════════════════════════════
    _markCounterpartiesOfLegitimateHubs() {
        for (const hubNode of this.legitimateHubs) {
            const outEdges = this.adjList.get(hubNode) || [];
            const inEdges = this.reverseAdjList.get(hubNode) || [];

            // Senders to legitimate hubs (customers)
            for (const edge of inEdges) {
                const cp = edge.from;
                const cpMeta = this.nodeMetadata.get(cp);
                if (cpMeta) {
                    const cpOutEdges = this.adjList.get(cp) || [];
                    const sendsToHub = cpOutEdges.filter(e => e.to === hubNode).length;
                    const totalSends = cpOutEdges.length;

                    // Counterparty mainly sends to this hub and has low overall activity
                    if (totalSends <= 3 || sendsToHub / totalSends > 0.5) {
                        if (cpMeta.txCount <= 5) {
                            this.legitimateAccounts.add(cp);
                        }
                    }
                }
            }

            // Receivers from legitimate hubs (employees, vendors)
            for (const edge of outEdges) {
                const cp = edge.to;
                const cpMeta = this.nodeMetadata.get(cp);
                if (cpMeta) {
                    const cpInEdges = this.reverseAdjList.get(cp) || [];
                    const receivesFromHub = cpInEdges.filter(e => e.from === hubNode).length;
                    const totalReceives = cpInEdges.length;

                    if (totalReceives <= 3 || receivesFromHub / totalReceives > 0.5) {
                        if (cpMeta.txCount <= 5) {
                            this.legitimateAccounts.add(cp);
                        }
                    }
                }
            }
        }
    }

    // ═══════════════════════ Helpers ══════════════════════════
    _groupAmounts(amounts, tolerance) {
        if (amounts.length === 0) return [];
        const sorted = [...amounts].sort((a, b) => a - b);
        const groups = [];
        let currentGroup = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            const groupAvg = currentGroup.reduce((a, b) => a + b, 0) / currentGroup.length;
            if (Math.abs(sorted[i] - groupAvg) / Math.max(groupAvg, 0.01) <= tolerance) {
                currentGroup.push(sorted[i]);
            } else {
                groups.push(currentGroup);
                currentGroup = [sorted[i]];
            }
        }
        groups.push(currentGroup);
        return groups;
    }

    _checkTemporalRegularity(timestamps) {
        if (timestamps.length < 5) return false;

        const deltas = [];
        for (let i = 1; i < timestamps.length; i++) {
            deltas.push(timestamps[i] - timestamps[i - 1]);
        }

        // Check if deltas cluster around common payroll/business intervals
        const dayMs = 24 * 60 * 60 * 1000;
        const commonIntervals = [
            60 * 60 * 1000,      // 1 hour (hourly batch)
            dayMs,                // daily
            7 * dayMs,            // weekly
            14 * dayMs,           // bi-weekly
            30 * dayMs            // monthly
        ];

        for (const interval of commonIntervals) {
            const closeToInterval = deltas.filter(d => {
                const ratio = d / interval;
                return ratio > 0.75 && ratio < 1.25;
            });
            if (closeToInterval.length / deltas.length > 0.4) return true;
        }

        return false;
    }
}

module.exports = FalsePositiveFilter;
