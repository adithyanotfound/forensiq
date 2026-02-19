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
        this.MIN_CHAIN_LENGTH = 3;
        this.SHELL_TX_THRESHOLD = 3; // intermediate accounts with <= 3 total transactions
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
                // Start node should have reasonable activity (the source of funds)
                if (startMeta.txCount < 2) continue;

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
                        this.shellChains.push({
                            chain: [...path],
                            shellAccounts: [...intermediates],
                            amounts: [...amounts],
                            timestamps: [...timestamps],
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

        // Check amount decay (money laundering often involves small fees at each hop)
        if (amounts.length >= 2) {
            let decayCount = 0;
            for (let i = 1; i < amounts.length; i++) {
                if (amounts[i] < amounts[i - 1] && amounts[i] > amounts[i - 1] * 0.8) {
                    decayCount++;
                }
            }
            if (decayCount / (amounts.length - 1) > 0.5) score += 15;
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
