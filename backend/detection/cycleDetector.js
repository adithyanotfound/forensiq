/**
 * Cycle Detector - Finds circular fund routing patterns of length 3-5
 * Uses iterative DFS with backtracking to find all simple cycles.
 * Johnson's algorithm variant adapted for bounded cycle length.
 */
class CycleDetector {
    constructor(adjacencyList, nodeMetadata) {
        this.adjList = adjacencyList;
        this.nodeMetadata = nodeMetadata;
        this.cycles = [];
        this.MIN_CYCLE = 3;
        this.MAX_CYCLE = 5;
    }

    detect() {
        const nodes = Array.from(this.adjList.keys());
        const allCycles = [];
        const MAX_RESULTS = 500;
        const MAX_OUT_DEGREE = 30; // Skip very high-degree nodes (likely hubs/exchanges)

        // Sort nodes for deterministic ordering
        nodes.sort();

        for (const startNode of nodes) {
            if (allCycles.length >= MAX_RESULTS) break;

            // Skip nodes with very high out-degree (likely legitimate hubs)
            const edges = this.adjList.get(startNode) || [];
            if (edges.length > MAX_OUT_DEGREE) continue;

            this._dfs(startNode, startNode, [startNode], new Set([startNode]), allCycles, MAX_RESULTS);
        }

        // Deduplicate cycles (canonical form: rotate so smallest node is first)
        const uniqueCycles = this._deduplicateCycles(allCycles);
        this.cycles = uniqueCycles;
        return uniqueCycles;
    }

    _dfs(startNode, currentNode, path, visitedInPath, results, maxResults) {
        if (path.length > this.MAX_CYCLE) return;
        if (results.length >= maxResults) return;

        const neighbors = this.adjList.get(currentNode) || [];
        for (const edge of neighbors) {
            if (results.length >= maxResults) return;
            const next = edge.to;

            // Found a cycle back to start
            if (next === startNode && path.length >= this.MIN_CYCLE) {
                results.push([...path]);
                continue;
            }

            // Continue DFS if not visited in current path and within depth limit
            if (!visitedInPath.has(next) && path.length < this.MAX_CYCLE) {
                // Only explore nodes >= startNode to avoid duplicate cycles
                if (next >= startNode) {
                    // Skip very high-degree neighbors
                    const nextEdges = this.adjList.get(next) || [];
                    if (nextEdges.length > 30) continue;

                    visitedInPath.add(next);
                    path.push(next);
                    this._dfs(startNode, next, path, visitedInPath, results, maxResults);
                    path.pop();
                    visitedInPath.delete(next);
                }
            }
        }
    }

    _deduplicateCycles(cycles) {
        const seen = new Set();
        const unique = [];

        for (const cycle of cycles) {
            const canonical = this._canonicalize(cycle);
            const key = canonical.join('|');
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(cycle);
            }
        }

        return unique;
    }

    _canonicalize(cycle) {
        // Rotate cycle so the smallest element is first
        let minIdx = 0;
        for (let i = 1; i < cycle.length; i++) {
            if (cycle[i] < cycle[minIdx]) minIdx = i;
        }
        return [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
    }

    /**
     * Score a cycle based on suspicious characteristics
     */
    scoreCycle(cycle) {
        let score = 50; // Base score for being a cycle

        // Shorter cycles are more suspicious
        if (cycle.length === 3) score += 15;
        else if (cycle.length === 4) score += 10;
        else score += 5;

        // Check for amount similarity (layering technique)
        const edgeAmounts = this._getCycleEdgeAmounts(cycle);
        if (edgeAmounts.length > 0) {
            const avgAmount = edgeAmounts.reduce((a, b) => a + b, 0) / edgeAmounts.length;
            const variance = edgeAmounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / edgeAmounts.length;
            const cv = avgAmount > 0 ? Math.sqrt(variance) / avgAmount : 0;

            // Low coefficient of variation = similar amounts = more suspicious
            if (cv < 0.1) score += 15;
            else if (cv < 0.3) score += 10;
            else if (cv < 0.5) score += 5;
        }

        // Check temporal proximity
        const timestamps = this._getCycleTimestamps(cycle);
        if (timestamps.length > 1) {
            const sorted = timestamps.sort((a, b) => a - b);
            const totalSpan = sorted[sorted.length - 1] - sorted[0];
            const hoursSpan = totalSpan / (1000 * 60 * 60);

            if (hoursSpan < 24) score += 15;
            else if (hoursSpan < 72) score += 10;
            else if (hoursSpan < 168) score += 5;
        }

        // Check if nodes are low-activity (more suspicious)
        let lowActivityCount = 0;
        for (const node of cycle) {
            const meta = this.nodeMetadata.get(node);
            if (meta && meta.txCount <= 5) lowActivityCount++;
        }
        if (lowActivityCount / cycle.length > 0.5) score += 10;

        return Math.min(100, score);
    }

    _getCycleEdgeAmounts(cycle) {
        const amounts = [];
        for (let i = 0; i < cycle.length; i++) {
            const from = cycle[i];
            const to = cycle[(i + 1) % cycle.length];
            const edges = this.adjList.get(from) || [];
            const edge = edges.find(e => e.to === to);
            if (edge) amounts.push(edge.amount);
        }
        return amounts;
    }

    _getCycleTimestamps(cycle) {
        const timestamps = [];
        for (let i = 0; i < cycle.length; i++) {
            const from = cycle[i];
            const to = cycle[(i + 1) % cycle.length];
            const edges = this.adjList.get(from) || [];
            const edge = edges.find(e => e.to === to);
            if (edge) timestamps.push(edge.timestamp.getTime());
        }
        return timestamps;
    }
}

module.exports = CycleDetector;
