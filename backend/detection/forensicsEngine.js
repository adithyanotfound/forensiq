/**
 * ForensicsEngine - Main orchestrator for money muling detection
 * 
 * Combines cycle detection, smurfing detection, shell network detection,
 * and false positive filtering into a unified analysis pipeline.
 */

const GraphBuilder = require('./graphBuilder');
const CycleDetector = require('./cycleDetector');
const SmurfingDetector = require('./smurfingDetector');
const ShellNetworkDetector = require('./shellDetector');
const FalsePositiveFilter = require('./falsePositiveFilter');
const ScoringEngine = require('./scoringEngine');

class ForensicsEngine {
    constructor(transactions) {
        this.transactions = transactions;
        this.results = null;
    }

    analyze() {
        const startTime = Date.now();

        // Step 1: Build the graph
        const graphBuilder = new GraphBuilder(this.transactions);
        const graph = graphBuilder.build();
        const { adjacencyList, reverseAdjList, nodeMetadata, edges, nodes } = graph;

        // Step 2: Detect cycles (circular fund routing)
        const cycleDetector = new CycleDetector(adjacencyList, nodeMetadata);
        const cycles = cycleDetector.detect();

        // Step 3: Detect smurfing patterns (fan-in / fan-out)
        const smurfingDetector = new SmurfingDetector(adjacencyList, reverseAdjList, nodeMetadata);
        const smurfingGroups = smurfingDetector.detect();

        // Step 4: Detect shell networks (layered chains)
        const shellDetector = new ShellNetworkDetector(adjacencyList, reverseAdjList, nodeMetadata);
        const shellChains = shellDetector.detect();

        // Step 5: Build fraud rings and suspicious accounts
        let ringCounter = 1;
        const fraudRings = [];
        const accountSuspicionMap = new Map(); // account_id -> {score, patterns, ring_ids}

        // Process cycles into rings
        for (const cycle of cycles) {
            const ringId = `RING_${String(ringCounter).padStart(3, '0')}`;
            ringCounter++;

            const score = cycleDetector.scoreCycle(cycle);

            fraudRings.push({
                ring_id: ringId,
                member_accounts: [...cycle],
                pattern_type: 'cycle',
                risk_score: Math.round(score * 10) / 10,
                cycle_length: cycle.length
            });

            const patternStr = `cycle_length_${cycle.length}`;
            for (const account of cycle) {
                this._addAccountSuspicion(accountSuspicionMap, account, score, patternStr, ringId);
            }
        }

        // Process smurfing groups into rings
        for (const group of smurfingGroups) {
            const ringId = `RING_${String(ringCounter).padStart(3, '0')}`;
            ringCounter++;

            const patternType = group.type === 'fan_in' ? 'fan_in' :
                group.type === 'fan_out' ? 'fan_out' : 'fan_in_fan_out';

            const members = [...new Set(group.members)];

            fraudRings.push({
                ring_id: ringId,
                member_accounts: members,
                pattern_type: patternType,
                risk_score: Math.round(group.score * 10) / 10,
                temporal_window_hours: group.temporalWindowHours,
                aggregatorNode: group.aggregatorNode || null,
                disperserNode: group.disperserNode || null
            });

            const patterns = [];
            if (group.type === 'fan_in' || group.type === 'fan_in_fan_out') {
                patterns.push('fan_in');
            }
            if (group.type === 'fan_out' || group.type === 'fan_in_fan_out') {
                patterns.push('fan_out');
            }
            if (group.temporalWindowHours) {
                patterns.push('high_velocity');
            }

            for (const account of members) {
                for (const pattern of patterns) {
                    this._addAccountSuspicion(accountSuspicionMap, account, group.score, pattern, ringId);
                }
            }
        }

        // Process shell chains into rings
        for (const chain of shellChains) {
            const ringId = `RING_${String(ringCounter).padStart(3, '0')}`;
            ringCounter++;

            fraudRings.push({
                ring_id: ringId,
                member_accounts: [...chain.chain],
                pattern_type: 'shell_network',
                risk_score: Math.round(chain.score * 10) / 10,
                chain_length: chain.chain.length,
                amount_pattern: chain.amountPattern || 'mixed'
            });

            for (const account of chain.chain) {
                const isShell = chain.shellAccounts.includes(account);
                const pattern = isShell ? 'shell_intermediary' : 'shell_network_endpoint';
                this._addAccountSuspicion(accountSuspicionMap, account, chain.score, pattern, ringId);
            }
        }

        // Step 6: Apply false positive filter
        const fpFilter = new FalsePositiveFilter(adjacencyList, reverseAdjList, nodeMetadata);
        fpFilter.detectLegitimate();

        // Build suspicious accounts list
        let suspiciousAccounts = [];
        for (const [accountId, data] of accountSuspicionMap) {
            suspiciousAccounts.push({
                account_id: accountId,
                suspicion_score: Math.round(data.maxScore * 10) / 10,
                detected_patterns: [...data.patterns],
                ring_id: data.ringIds[0] // Primary ring
            });
        }

        // Filter false positives
        const { filteredAccounts, filteredRings } = fpFilter.filterResults(suspiciousAccounts, fraudRings);

        // Sort by suspicion score descending
        filteredAccounts.sort((a, b) => b.suspicion_score - a.suspicion_score);

        // Merge rings that share significant membership
        const mergedRings = this._mergeOverlappingRings(filteredRings);

        // Reassign ring IDs after merge
        const ringsWithIds = mergedRings.map((ring, idx) => ({
            ...ring,
            ring_id: `RING_${String(idx + 1).padStart(3, '0')}`
        }));

        // ═══════════════════════════════════════════════════════════
        //  SCORING ENGINE — Suspicion Scores → Risk Scores
        //  (accounts scored FIRST, then rings use avg member suspicion)
        // ═══════════════════════════════════════════════════════════
        const scoringEngine = new ScoringEngine(
            this.transactions, adjacencyList, reverseAdjList, nodeMetadata
        );

        // Update ring_id references in accounts
        const ringMapping = new Map();
        for (const ring of ringsWithIds) {
            for (const member of ring.member_accounts) {
                ringMapping.set(member, ring.ring_id);
            }
        }

        const accountsWithRingIds = filteredAccounts.map(acc => ({
            ...acc,
            ring_id: ringMapping.get(acc.account_id) || acc.ring_id
        }));

        // STEP 1: Compute Suspicion Scores for each account
        //   S_account = min(100, max(0, 35·PTR + 35·V + PM − FPP))
        const scoredAccounts = scoringEngine.scoreAllAccounts(accountsWithRingIds);

        // STEP 2: Compute Risk Scores for each fraud ring
        //   S_ring = min(100, avg(S_account) + T_density + C_severity)
        const scoredRings = scoringEngine.scoreAllRings(ringsWithIds, scoredAccounts);

        const finalAccounts = scoredAccounts;
        const finalRings = scoredRings;

        const processingTime = (Date.now() - startTime) / 1000;

        // Build fast lookup for suspicious accounts
        const suspiciousLookup = new Map();
        for (const acc of finalAccounts) {
            suspiciousLookup.set(acc.account_id, acc);
        }

        // Limit graph data to prevent huge payloads
        const MAX_GRAPH_NODES = 300;
        let graphNodes = nodes;
        let graphEdges = edges;

        if (nodes.length > MAX_GRAPH_NODES) {
            const suspiciousIds = new Set(finalAccounts.map(a => a.account_id));
            const selectedIds = new Set(suspiciousIds);

            // Add 1-hop neighbors of suspicious nodes
            for (const e of edges) {
                if (selectedIds.size >= MAX_GRAPH_NODES) break;
                if (suspiciousIds.has(e.source)) selectedIds.add(e.target);
                if (suspiciousIds.has(e.target)) selectedIds.add(e.source);
            }

            // Fill remaining with other nodes
            for (const n of nodes) {
                if (selectedIds.size >= MAX_GRAPH_NODES) break;
                selectedIds.add(n);
            }

            graphNodes = nodes.filter(n => selectedIds.has(n));
            graphEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));
        }

        this.results = {
            suspicious_accounts: finalAccounts,
            fraud_rings: finalRings,
            summary: {
                total_accounts_analyzed: nodes.length,
                suspicious_accounts_flagged: finalAccounts.length,
                fraud_rings_detected: finalRings.length,
                processing_time_seconds: Math.round(processingTime * 10) / 10
            },
            graph_data: {
                nodes: graphNodes.map(n => {
                    const meta = nodeMetadata.get(n);
                    const accountInfo = suspiciousLookup.get(n);
                    return {
                        id: n,
                        totalSent: meta.totalSent,
                        totalReceived: meta.totalReceived,
                        txCount: meta.txCount,
                        inDegree: meta.inDegree,
                        outDegree: meta.outDegree,
                        isSuspicious: !!accountInfo,
                        ringId: accountInfo ? accountInfo.ring_id : null,
                        suspicionScore: accountInfo ? accountInfo.suspicion_score : 0,
                        suspicionLabel: accountInfo ? accountInfo.suspicion_label : null,
                        patterns: accountInfo ? accountInfo.detected_patterns : []
                    };
                }),
                edges: graphEdges.map(e => ({
                    source: e.source,
                    target: e.target,
                    amount: e.amount,
                    timestamp: e.timestamp.toISOString()
                }))
            }
        };

        return this.results;
    }

    _addAccountSuspicion(map, accountId, score, pattern, ringId) {
        if (!map.has(accountId)) {
            map.set(accountId, {
                maxScore: score,
                patterns: new Set(),
                ringIds: []
            });
        }
        const data = map.get(accountId);
        data.maxScore = Math.max(data.maxScore, score);
        data.patterns.add(pattern);
        if (!data.ringIds.includes(ringId)) {
            data.ringIds.push(ringId);
        }
    }

    _mergeOverlappingRings(rings) {
        if (rings.length <= 1) return rings;

        // Use Union-Find to merge rings with significant overlap
        const parent = new Map();
        for (let i = 0; i < rings.length; i++) parent.set(i, i);

        const find = (x) => {
            while (parent.get(x) !== x) {
                parent.set(x, parent.get(parent.get(x)));
                x = parent.get(x);
            }
            return x;
        };

        const union = (a, b) => {
            const ra = find(a), rb = find(b);
            if (ra !== rb) parent.set(ra, rb);
        };

        // Check pairwise overlap
        for (let i = 0; i < rings.length; i++) {
            for (let j = i + 1; j < rings.length; j++) {
                // Only merge if same pattern type and significant overlap
                if (rings[i].pattern_type === rings[j].pattern_type) {
                    const setI = new Set(rings[i].member_accounts);
                    const setJ = new Set(rings[j].member_accounts);
                    let overlap = 0;
                    for (const m of setI) if (setJ.has(m)) overlap++;

                    const minSize = Math.min(setI.size, setJ.size);
                    if (overlap / minSize > 0.5) {
                        union(i, j);
                    }
                }
            }
        }

        // Group rings by their root
        const groups = new Map();
        for (let i = 0; i < rings.length; i++) {
            const root = find(i);
            if (!groups.has(root)) groups.set(root, []);
            groups.get(root).push(rings[i]);
        }

        // Merge each group into a single ring
        const merged = [];
        for (const group of groups.values()) {
            if (group.length === 1) {
                merged.push(group[0]);
            } else {
                const allMembers = new Set();
                let maxScore = 0;
                let patternType = group[0].pattern_type;
                for (const ring of group) {
                    ring.member_accounts.forEach(m => allMembers.add(m));
                    maxScore = Math.max(maxScore, ring.risk_score);
                }

                merged.push({
                    ring_id: group[0].ring_id,
                    member_accounts: [...allMembers],
                    pattern_type: patternType,
                    risk_score: maxScore
                });
            }
        }

        return merged;
    }
}

module.exports = ForensicsEngine;
