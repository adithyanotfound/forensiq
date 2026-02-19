/**
 * False Positive Filter - Removes legitimate high-volume accounts
 * 
 * Identifies and filters out:
 * 1. Merchant accounts (receive from many unique senders but never/rarely send to those senders back)
 * 2. Payroll accounts (send to many unique receivers with regular patterns)
 * 3. Hub accounts with legitimate behavior patterns
 * 4. Counterparties of legitimate hubs (customers, employees, etc.)
 */

class FalsePositiveFilter {
    constructor(adjacencyList, reverseAdjList, nodeMetadata) {
        this.adjList = adjacencyList;
        this.reverseAdjList = reverseAdjList;
        this.nodeMetadata = nodeMetadata;
        this.legitimateAccounts = new Set();
        this.legitimateHubs = new Set(); // Hub nodes that are legitimate
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
                continue; // Drop entire ring
            }

            // Check if ring has a legitimate hub as member
            const hasLegitimateHub = ring.member_accounts.some(id => this.legitimateHubs.has(id));
            if (hasLegitimateHub) {
                continue; // Drop entire ring - it's organized around a legitimate hub
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

    _detectMerchants() {
        for (const [node, meta] of this.nodeMetadata) {
            // Merchant pattern: high in-degree, very low out-degree relative to in-degree
            // MUST have some outbound (paying suppliers/costs) to be a merchant
            if (meta.uniqueSenders >= 15 && meta.uniqueReceivers >= 1 && meta.uniqueReceivers <= 5) {
                const inSenders = new Set((this.reverseAdjList.get(node) || []).map(e => e.from));
                const outReceivers = new Set((this.adjList.get(node) || []).map(e => e.to));

                // Calculate overlap between senders and receivers
                let overlap = 0;
                for (const r of outReceivers) {
                    if (inSenders.has(r)) overlap++;
                }

                // If less than 20% overlap with senders, likely a merchant
                if (overlap / Math.max(inSenders.size, 1) < 0.2) {
                    // Additional check: amount variance is moderate-to-high (different products)
                    const inAmounts = (this.reverseAdjList.get(node) || []).map(e => e.amount);
                    if (inAmounts.length > 5) {
                        const avg = inAmounts.reduce((a, b) => a + b, 0) / inAmounts.length;
                        const cv = Math.sqrt(
                            inAmounts.reduce((sum, a) => sum + Math.pow(a - avg, 2), 0) / inAmounts.length
                        ) / Math.max(avg, 0.01);

                        // High variance in incoming amounts = likely different products
                        // AND must have outbound transactions (paying suppliers)
                        if (cv > 0.5 && meta.outDegree >= 1) {
                            this.legitimateAccounts.add(node);
                            this.legitimateHubs.add(node);
                        }
                    }

                    // Mark as merchant if ratio is very high AND has outbound to non-senders
                    if (meta.uniqueSenders >= 30 && meta.uniqueReceivers >= 1 && overlap === 0) {
                        this.legitimateAccounts.add(node);
                        this.legitimateHubs.add(node);
                    }
                }
            }
        }
    }

    _detectPayroll() {
        for (const [node, meta] of this.nodeMetadata) {
            // Payroll pattern: sends to many accounts with similar amounts at regular intervals
            if (meta.uniqueReceivers >= 10 && meta.uniqueSenders <= 5) {
                const outEdges = this.adjList.get(node) || [];

                if (outEdges.length < 10) continue;

                // Check that the node doesn't receive from its receivers
                const receivers = new Set(outEdges.map(e => e.to));
                const inEdges = this.reverseAdjList.get(node) || [];
                const senders = new Set(inEdges.map(e => e.from));
                let overlap = 0;
                for (const r of receivers) {
                    if (senders.has(r)) overlap++;
                }

                // No circular money flow = potentially payroll/disbursement
                if (overlap === 0) {
                    // Check amount regularity (payroll amounts cluster around salary values)
                    const amounts = outEdges.map(e => e.amount);
                    const amountGroups = this._groupAmounts(amounts, 0.1);
                    const largestGroupSize = Math.max(...amountGroups.map(g => g.length));
                    const groupCoverage = largestGroupSize / amounts.length;

                    // MUST have temporal regularity to be payroll
                    // Payroll has multiple pay cycles (same receiver appears multiple times)
                    const receiverCounts = new Map();
                    for (const edge of outEdges) {
                        receiverCounts.set(edge.to, (receiverCounts.get(edge.to) || 0) + 1);
                    }
                    const repeatReceivers = [...receiverCounts.values()].filter(c => c >= 2).length;
                    const hasRepeatPayments = repeatReceivers / receivers.size > 0.5;

                    // Check temporal regularity
                    const timestamps = outEdges.map(e => e.timestamp).sort((a, b) => a - b);
                    const regularPattern = this._checkTemporalRegularity(timestamps);

                    // Payroll: amounts are regular AND (temporal pattern OR repeat payments)
                    if (groupCoverage > 0.4 && (regularPattern || hasRepeatPayments)) {
                        this.legitimateAccounts.add(node);
                        this.legitimateHubs.add(node);
                    }
                }
            }
        }
    }

    _detectExchangePlatforms() {
        for (const [node, meta] of this.nodeMetadata) {
            // Exchange/platform pattern: very high in AND out degree
            if (meta.uniqueSenders >= 20 && meta.uniqueReceivers >= 20) {
                const inEdges = this.reverseAdjList.get(node) || [];
                const outEdges = this.adjList.get(node) || [];
                const senders = new Set(inEdges.map(e => e.from));
                const receivers = new Set(outEdges.map(e => e.to));

                // Low overlap between senders and receivers — typical exchange
                let overlap = 0;
                for (const r of receivers) {
                    if (senders.has(r)) overlap++;
                }
                const overlapRatio = overlap / Math.max(senders.size, receivers.size, 1);
                if (overlapRatio < 0.15) {
                    this.legitimateAccounts.add(node);
                    this.legitimateHubs.add(node);
                }
            }
        }
    }

    /**
     * Mark counterparties of legitimate hubs as legitimate too
     * (customers of merchants, employees of payroll, depositors/withdrawers of exchanges)
     * ONLY if those counterparties have no other suspicious patterns
     */
    _markCounterpartiesOfLegitimateHubs() {
        for (const hubNode of this.legitimateHubs) {
            // Get all direct counterparties
            const outEdges = this.adjList.get(hubNode) || [];
            const inEdges = this.reverseAdjList.get(hubNode) || [];

            // Mark counterparties that ONLY interact with this hub (or very few others)
            for (const edge of inEdges) {
                const counterparty = edge.from;
                const cpMeta = this.nodeMetadata.get(counterparty);
                if (cpMeta) {
                    // If this counterparty has very low activity and mainly interacts with the hub
                    const cpOutEdges = this.adjList.get(counterparty) || [];
                    const sendsToHub = cpOutEdges.filter(e => e.to === hubNode).length;
                    const totalSends = cpOutEdges.length;

                    // Counterparty mainly sends to this hub
                    if (totalSends <= 3 || sendsToHub / totalSends > 0.5) {
                        // Don't mark as legitimate if they're in a cycle
                        if (cpMeta.txCount <= 5) {
                            this.legitimateAccounts.add(counterparty);
                        }
                    }
                }
            }

            for (const edge of outEdges) {
                const counterparty = edge.to;
                const cpMeta = this.nodeMetadata.get(counterparty);
                if (cpMeta) {
                    const cpInEdges = this.reverseAdjList.get(counterparty) || [];
                    const receivesFromHub = cpInEdges.filter(e => e.from === hubNode).length;
                    const totalReceives = cpInEdges.length;

                    if (totalReceives <= 3 || receivesFromHub / totalReceives > 0.5) {
                        if (cpMeta.txCount <= 5) {
                            this.legitimateAccounts.add(counterparty);
                        }
                    }
                }
            }
        }
    }

    _groupAmounts(amounts, tolerance) {
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

        // Calculate deltas between consecutive timestamps
        const deltas = [];
        for (let i = 1; i < timestamps.length; i++) {
            deltas.push(timestamps[i] - timestamps[i - 1]);
        }

        // Check if deltas cluster around common payroll intervals
        const dayMs = 24 * 60 * 60 * 1000;
        const commonIntervals = [dayMs, 7 * dayMs, 14 * dayMs, 30 * dayMs];

        for (const interval of commonIntervals) {
            const closeToInterval = deltas.filter(d => {
                const ratio = d / interval;
                return ratio > 0.8 && ratio < 1.2;
            });
            if (closeToInterval.length / deltas.length > 0.5) return true;
        }

        return false;
    }
}

module.exports = FalsePositiveFilter;
