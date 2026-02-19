/**
 * Smurfing Detector - Detects Fan-in / Fan-out patterns
 * 
 * Fan-in: Multiple accounts send to one aggregator (10+ senders → 1 receiver)
 * Fan-out: One account disperses to many receivers (1 sender → 10+ receivers)
 * Uses temporal analysis: transactions within a 72-hour window are more suspicious
 */

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const FAN_THRESHOLD = 10; // minimum number of unique counterparties

class SmurfingDetector {
    constructor(adjacencyList, reverseAdjList, nodeMetadata) {
        this.adjList = adjacencyList;
        this.reverseAdjList = reverseAdjList;
        this.nodeMetadata = nodeMetadata;
        this.fanInNodes = [];
        this.fanOutNodes = [];
        this.smurfingGroups = [];
    }

    detect() {
        this._detectFanIn();
        this._detectFanOut();
        this._detectCombinedFanInFanOut();
        return this.smurfingGroups;
    }

    _detectFanIn() {
        // Find nodes receiving from 10+ unique senders
        for (const [node, inEdges] of this.reverseAdjList) {
            const uniqueSenders = new Set(inEdges.map(e => e.from));
            if (uniqueSenders.size >= FAN_THRESHOLD) {
                // Check temporal clustering - are incoming txs within 72h windows?
                const temporalClusters = this._findTemporalClusters(inEdges.map(e => ({
                    counterparty: e.from,
                    timestamp: e.timestamp,
                    amount: e.amount
                })));

                for (const cluster of temporalClusters) {
                    if (cluster.counterparties.size >= FAN_THRESHOLD) {
                        const members = [node, ...cluster.counterparties];
                        const score = this._scoreFanIn(node, cluster);

                        this.smurfingGroups.push({
                            type: 'fan_in',
                            aggregatorNode: node,
                            members,
                            score,
                            temporalWindowHours: cluster.windowHours
                        });
                    }
                }

                // Also flag if overall unique senders >= threshold regardless of temporal window
                if (!this.smurfingGroups.find(g => g.aggregatorNode === node && g.type === 'fan_in')) {
                    const score = this._scoreFanInNonTemporal(node, uniqueSenders);
                    if (score > 30) {
                        this.smurfingGroups.push({
                            type: 'fan_in',
                            aggregatorNode: node,
                            members: [node, ...uniqueSenders],
                            score,
                            temporalWindowHours: null
                        });
                    }
                }
            }
        }
    }

    _detectFanOut() {
        // Find nodes sending to 10+ unique receivers
        for (const [node, outEdges] of this.adjList) {
            const uniqueReceivers = new Set(outEdges.map(e => e.to));
            if (uniqueReceivers.size >= FAN_THRESHOLD) {
                const temporalClusters = this._findTemporalClusters(outEdges.map(e => ({
                    counterparty: e.to,
                    timestamp: e.timestamp,
                    amount: e.amount
                })));

                for (const cluster of temporalClusters) {
                    if (cluster.counterparties.size >= FAN_THRESHOLD) {
                        const members = [node, ...cluster.counterparties];
                        const score = this._scoreFanOut(node, cluster);

                        this.smurfingGroups.push({
                            type: 'fan_out',
                            disperserNode: node,
                            members,
                            score,
                            temporalWindowHours: cluster.windowHours
                        });
                    }
                }

                if (!this.smurfingGroups.find(g =>
                    (g.disperserNode === node || g.aggregatorNode === node) && g.type === 'fan_out'
                )) {
                    const score = this._scoreFanOutNonTemporal(node, uniqueReceivers);
                    if (score > 30) {
                        this.smurfingGroups.push({
                            type: 'fan_out',
                            disperserNode: node,
                            members: [node, ...uniqueReceivers],
                            score,
                            temporalWindowHours: null
                        });
                    }
                }
            }
        }
    }

    _detectCombinedFanInFanOut() {
        // Detect accounts that both receive from many AND send to many (aggregator + disperser)
        for (const [node, meta] of this.nodeMetadata) {
            if (meta.uniqueSenders >= FAN_THRESHOLD && meta.uniqueReceivers >= FAN_THRESHOLD) {
                // Check if already flagged
                const alreadyFlagged = this.smurfingGroups.some(g =>
                    g.aggregatorNode === node || g.disperserNode === node
                );

                if (!alreadyFlagged) {
                    const inEdges = this.reverseAdjList.get(node) || [];
                    const outEdges = this.adjList.get(node) || [];
                    const senders = new Set(inEdges.map(e => e.from));
                    const receivers = new Set(outEdges.map(e => e.to));

                    // Combined pattern is very suspicious
                    this.smurfingGroups.push({
                        type: 'fan_in_fan_out',
                        aggregatorNode: node,
                        disperserNode: node,
                        members: [node, ...senders, ...receivers],
                        score: 85,
                        temporalWindowHours: null
                    });
                }
            }
        }
    }

    _findTemporalClusters(transactions) {
        if (transactions.length === 0) return [];

        // Sort by timestamp
        const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
        const clusters = [];

        // Sliding window approach
        for (let i = 0; i < sorted.length; i++) {
            const windowStart = sorted[i].timestamp;
            const windowEnd = new Date(windowStart.getTime() + SEVENTY_TWO_HOURS_MS);

            const counterparties = new Set();
            const amounts = [];
            let j = i;
            while (j < sorted.length && sorted[j].timestamp <= windowEnd) {
                counterparties.add(sorted[j].counterparty);
                amounts.push(sorted[j].amount);
                j++;
            }

            if (counterparties.size >= FAN_THRESHOLD) {
                clusters.push({
                    counterparties,
                    amounts,
                    windowHours: 72,
                    startTime: windowStart,
                    endTime: windowEnd,
                    txCount: j - i
                });
                // Skip ahead to avoid too many overlapping clusters
                i = Math.max(i, j - Math.floor(FAN_THRESHOLD / 2));
            }
        }

        return clusters;
    }

    _scoreFanIn(node, cluster) {
        let score = 55; // Base score for temporal fan-in

        // More senders = more suspicious
        const senderCount = cluster.counterparties.size;
        if (senderCount >= 20) score += 15;
        else if (senderCount >= 15) score += 10;
        else score += 5;

        // Check for structuring (amounts just below reporting thresholds like $10,000)
        const structuringAmounts = cluster.amounts.filter(a => a >= 8000 && a < 10000);
        if (structuringAmounts.length / cluster.amounts.length > 0.3) score += 15;

        // Amount uniformity (many similar amounts = structuring)
        if (cluster.amounts.length > 1) {
            const avg = cluster.amounts.reduce((a, b) => a + b, 0) / cluster.amounts.length;
            const cv = Math.sqrt(
                cluster.amounts.reduce((sum, a) => sum + Math.pow(a - avg, 2), 0) / cluster.amounts.length
            ) / avg;
            if (cv < 0.2) score += 10;
        }

        // Check throughput ratio: does this node quickly send out what it receives?
        const meta = this.nodeMetadata.get(node);
        if (meta && meta.throughputRatio > 0.7 && meta.throughputRatio < 1.3) {
            score += 10; // Money passes through almost unchanged
        }

        return Math.min(100, score);
    }

    _scoreFanOut(node, cluster) {
        let score = 55;

        const receiverCount = cluster.counterparties.size;
        if (receiverCount >= 20) score += 15;
        else if (receiverCount >= 15) score += 10;
        else score += 5;

        // Check for amounts below reporting thresholds
        const structuringAmounts = cluster.amounts.filter(a => a >= 8000 && a < 10000);
        if (structuringAmounts.length / cluster.amounts.length > 0.3) score += 15;

        // Amount uniformity
        if (cluster.amounts.length > 1) {
            const avg = cluster.amounts.reduce((a, b) => a + b, 0) / cluster.amounts.length;
            const cv = Math.sqrt(
                cluster.amounts.reduce((sum, a) => sum + Math.pow(a - avg, 2), 0) / cluster.amounts.length
            ) / avg;
            if (cv < 0.2) score += 10;
        }

        return Math.min(100, score);
    }

    _scoreFanInNonTemporal(node, senders) {
        let score = 35;

        // More senders = more suspicious, but less so without temporal clustering
        if (senders.size >= 20) score += 10;
        else if (senders.size >= 15) score += 5;

        const meta = this.nodeMetadata.get(node);
        if (meta && meta.throughputRatio > 0.7 && meta.throughputRatio < 1.3) {
            score += 15;
        }

        return Math.min(100, score);
    }

    _scoreFanOutNonTemporal(node, receivers) {
        let score = 35;

        if (receivers.size >= 20) score += 10;
        else if (receivers.size >= 15) score += 5;

        return Math.min(100, score);
    }
}

module.exports = SmurfingDetector;
