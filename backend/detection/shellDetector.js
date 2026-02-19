/**
 * Shell Network Detector - Identifies layered shell networks
 * 
 * Money passes through intermediate "shell" accounts with low transaction counts
 * before reaching the final destination.
 * 
 * Look for chains of 3+ hops where intermediate accounts have only 2-3 total transactions
 */
class ShellNetworkDetector {
    constructor(adjacencyList, reverseAdjList, nodeMetadata) {
        this.adjList = adjacencyList;
        this.reverseAdjList = reverseAdjList;
        this.nodeMetadata = nodeMetadata;
        this.shellChains = [];
        this.MAX_CHAIN_LENGTH = 7;
        this.MIN_CHAIN_LENGTH = 4; // 3+ hops = 4+ nodes (e.g. A→B→C→D)
        this.SHELL_TX_THRESHOLD = 3; // intermediate accounts with <= 3 total transactions
        this.AMOUNT_COHERENCE_MAX_DROP = 10000; // max allowed amount drop between consecutive hops
    }

    detect() {
        // Pre-compute which nodes are shell-like for fast lookup
        const shellNodes = new Set();
        for (const [node, meta] of this.nodeMetadata) {
            if (meta.txCount <= this.SHELL_TX_THRESHOLD && meta.inDegree >= 1 && meta.outDegree >= 1) {
                shellNodes.add(node);
            }
        }

        if (shellNodes.size === 0) return [];

        // Only start chains from nodes that send TO shell nodes
        // This is much more efficient than starting from all non-shell nodes
        for (const shellNode of shellNodes) {
            const inEdges = this.reverseAdjList.get(shellNode) || [];
            for (const edge of inEdges) {
                const startNode = edge.from;
                const startMeta = this.nodeMetadata.get(startNode);
                if (!startMeta) continue;
                // Start node should NOT be shell-like itself
                if (shellNodes.has(startNode)) continue;

                // Trace chain through shell nodes starting from startNode → shellNode
                this._traceShellChain(
                    startNode,
                    shellNode,
                    [startNode, shellNode],
                    new Set([startNode, shellNode]),
                    [edge.amount],
                    [edge.timestamp],
                    shellNodes
                );
            }
        }

        // Deduplicate
        this.shellChains = this._deduplicateChains(this.shellChains);
        return this.shellChains;
    }

    _traceShellChain(startNode, currentNode, path, visited, amounts, timestamps, shellNodes) {
        if (path.length >= this.MAX_CHAIN_LENGTH) return;

        const outEdges = this.adjList.get(currentNode) || [];
        for (const edge of outEdges) {
            const next = edge.to;
            if (visited.has(next)) continue;

            const nextMeta = this.nodeMetadata.get(next);
            if (!nextMeta) continue;

            // Amount-coherence check: the drop between consecutive hops
            // must be <= 10,000.  This prevents false chains where amounts
            // are completely unrelated (e.g. 200,000 followed by 500).
            const prevAmount = amounts[amounts.length - 1];
            const amountDrop = prevAmount - edge.amount;
            if (amountDrop > this.AMOUNT_COHERENCE_MAX_DROP) continue;
            // Also reject if the forwarded amount is MORE than what was received
            if (edge.amount > prevAmount) continue;

            visited.add(next);
            path.push(next);
            amounts.push(edge.amount);
            timestamps.push(edge.timestamp);

            if (shellNodes.has(next)) {
                // Continue through another shell node
                this._traceShellChain(startNode, next, path, visited, amounts, timestamps, shellNodes);
            } else {
                // Reached a non-shell endpoint
                // We have a valid chain if intermediates >= 1 (at least MIN_CHAIN_LENGTH nodes including endpoints)
                const intermediates = path.slice(1, -1); // exclude start and end
                if (intermediates.length >= 1 && path.length >= this.MIN_CHAIN_LENGTH) {
                    const allShell = intermediates.every(n => shellNodes.has(n));
                    if (allShell) {
                        const score = this._scoreChain(path, amounts, timestamps, shellNodes);
                        const amountPattern = this._classifyAmountPattern(amounts);
                        this.shellChains.push({
                            chain: [...path],
                            shellAccounts: [...intermediates],
                            amounts: [...amounts],
                            timestamps: [...timestamps],
                            amountPattern,
                            score
                        });
                    }
                }
            }

            path.pop();
            amounts.pop();
            timestamps.pop();
            visited.delete(next);
        }
    }

    _scoreChain(chain, amounts, timestamps, shellNodes) {
        let score = 45; // Base score

        // Longer chains are more suspicious
        if (chain.length >= 6) score += 20;
        else if (chain.length >= 5) score += 15;
        else if (chain.length >= 4) score += 10;
        else score += 5;

        // ── Amount pattern analysis ──────────────────────────────────
        if (amounts.length >= 2) {
            const pattern = this._classifyAmountPattern(amounts);

            if (pattern === 'exact_passthrough') {
                // All hop amounts are virtually identical – pure layering
                score += 15;
            } else if (pattern === 'gradual_decay') {
                // Consistent small decreases at each hop – fee-skimming
                score += 20;
            } else {
                // Amounts are coherent but not perfectly patterned
                score += 10;
            }
        }

        // Temporal progression (transactions in sequence within reasonable time)
        if (timestamps.length >= 2) {
            let sequential = true;
            let totalTimeMs = 0;
            for (let i = 1; i < timestamps.length; i++) {
                const delta = timestamps[i] - timestamps[i - 1];
                if (delta < 0) sequential = false;
                totalTimeMs += Math.abs(delta);
            }

            if (sequential) {
                const hoursTotal = totalTimeMs / (1000 * 60 * 60);
                if (hoursTotal < 24) score += 15;
                else if (hoursTotal < 72) score += 10;
                else if (hoursTotal < 168) score += 5;
            }
        }

        // Shell accounts with very low activity are more suspicious
        const shellAccounts = chain.slice(1, -1);
        let veryLowActivity = 0;
        for (const node of shellAccounts) {
            const meta = this.nodeMetadata.get(node);
            if (meta && meta.txCount === 2) veryLowActivity++;
        }
        if (shellAccounts.length > 0 && veryLowActivity / shellAccounts.length > 0.5) score += 10;

        return Math.min(100, score);
    }

    /**
     * Classify the amount pattern across hops.
     * @returns {'exact_passthrough' | 'gradual_decay' | 'mixed'}
     */
    _classifyAmountPattern(amounts) {
        if (amounts.length < 2) return 'mixed';

        let allEqual = true;
        let decayCount = 0;

        for (let i = 1; i < amounts.length; i++) {
            const ratio = amounts[i] / amounts[i - 1];
            // "Equal" if within 1%
            if (Math.abs(ratio - 1) > 0.01) allEqual = false;
            // "Decay" if between 80-99% of previous
            if (ratio >= 0.80 && ratio < 0.99) decayCount++;
        }

        if (allEqual) return 'exact_passthrough';
        if (decayCount / (amounts.length - 1) >= 0.5) return 'gradual_decay';
        return 'mixed';
    }

    _deduplicateChains(chains) {
        const seen = new Set();
        const unique = [];

        for (const chain of chains) {
            const key = chain.chain.join('|');
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(chain);
            }
        }

        return unique;
    }
}

module.exports = ShellNetworkDetector;
