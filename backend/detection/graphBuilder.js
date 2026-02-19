/**
 * Graph Builder - Constructs an adjacency-list based directed graph from transactions
 */
class GraphBuilder {
  constructor(transactions) {
    this.transactions = transactions;
    this.adjacencyList = new Map(); // node -> [{to, amount, timestamp, txId}]
    this.reverseAdjList = new Map(); // node -> [{from, amount, timestamp, txId}]
    this.nodeMetadata = new Map(); // node -> {totalSent, totalReceived, txCount, ...}
    this.edges = [];
  }

  build() {
    for (const tx of this.transactions) {
      const { sender_id, receiver_id, amount, timestamp, transaction_id } = tx;

      // Forward adjacency
      if (!this.adjacencyList.has(sender_id)) this.adjacencyList.set(sender_id, []);
      this.adjacencyList.get(sender_id).push({
        to: receiver_id,
        amount: parseFloat(amount),
        timestamp: new Date(timestamp),
        txId: transaction_id
      });

      // Reverse adjacency
      if (!this.reverseAdjList.has(receiver_id)) this.reverseAdjList.set(receiver_id, []);
      this.reverseAdjList.get(receiver_id).push({
        from: sender_id,
        amount: parseFloat(amount),
        timestamp: new Date(timestamp),
        txId: transaction_id
      });

      // Ensure both nodes exist in adjacency list
      if (!this.adjacencyList.has(receiver_id)) this.adjacencyList.set(receiver_id, []);
      if (!this.reverseAdjList.has(sender_id)) this.reverseAdjList.set(sender_id, []);

      this.edges.push({
        source: sender_id,
        target: receiver_id,
        amount: parseFloat(amount),
        timestamp: new Date(timestamp),
        txId: transaction_id
      });
    }

    // Build node metadata
    for (const node of this.adjacencyList.keys()) {
      const outEdges = this.adjacencyList.get(node) || [];
      const inEdges = this.reverseAdjList.get(node) || [];

      const totalSent = outEdges.reduce((sum, e) => sum + e.amount, 0);
      const totalReceived = inEdges.reduce((sum, e) => sum + e.amount, 0);
      const uniqueSenders = new Set(inEdges.map(e => e.from)).size;
      const uniqueReceivers = new Set(outEdges.map(e => e.to)).size;
      const txCount = outEdges.length + inEdges.length;

      // Collect all timestamps for temporal analysis
      const allTimestamps = [
        ...outEdges.map(e => e.timestamp),
        ...inEdges.map(e => e.timestamp)
      ].sort((a, b) => a - b);

      let minTimeDelta = Infinity;
      for (let i = 1; i < allTimestamps.length; i++) {
        const delta = allTimestamps[i] - allTimestamps[i - 1];
        if (delta < minTimeDelta) minTimeDelta = delta;
      }

      this.nodeMetadata.set(node, {
        totalSent,
        totalReceived,
        uniqueSenders,
        uniqueReceivers,
        txCount,
        outDegree: outEdges.length,
        inDegree: inEdges.length,
        allTimestamps,
        minTimeDeltaMs: minTimeDelta === Infinity ? null : minTimeDelta,
        throughputRatio: totalReceived > 0 ? totalSent / totalReceived : 0
      });
    }

    return {
      adjacencyList: this.adjacencyList,
      reverseAdjList: this.reverseAdjList,
      nodeMetadata: this.nodeMetadata,
      edges: this.edges,
      nodes: Array.from(this.adjacencyList.keys())
    };
  }
}

module.exports = GraphBuilder;
