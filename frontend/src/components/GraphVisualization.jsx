import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';

function GraphVisualization({ graphData, fraudRings }) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);
    const [dimensions, setDimensions] = useState({ width: 960, height: 600 });

    // Build ring membership lookup
    const ringMembership = useMemo(() => {
        const map = new Map();
        if (fraudRings) {
            for (const ring of fraudRings) {
                for (const member of ring.member_accounts) {
                    if (!map.has(member)) map.set(member, []);
                    map.get(member).push(ring.ring_id);
                }
            }
        }
        return map;
    }, [fraudRings]);

    // Color scale for rings
    const ringColorScale = useMemo(() => {
        if (!fraudRings || fraudRings.length === 0) return () => '#6366f1';
        const ringIds = fraudRings.map(r => r.ring_id);
        const colors = [
            '#ef4444', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6',
            '#f97316', '#8b5cf6', '#06b6d4', '#d946ef', '#84cc16'
        ];
        const scale = {};
        ringIds.forEach((id, i) => {
            scale[id] = colors[i % colors.length];
        });
        return (ringId) => scale[ringId] || '#6366f1';
    }, [fraudRings]);

    useEffect(() => {
        if (!graphData || !svgRef.current) return;

        const container = containerRef.current;
        if (container) {
            const rect = container.getBoundingClientRect();
            setDimensions({ width: rect.width, height: 600 });
        }

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = dimensions.width;
        const height = dimensions.height;

        // Limit nodes for performance (show most relevant)
        let nodes = [...graphData.nodes];
        let edges = [...graphData.edges];

        // If too many nodes, prioritize suspicious ones and their neighbors
        const MAX_NODES = 300;
        if (nodes.length > MAX_NODES) {
            const suspiciousIds = new Set(nodes.filter(n => n.isSuspicious).map(n => n.id));
            const relevantIds = new Set(suspiciousIds);

            // Add neighbors of suspicious nodes
            for (const edge of edges) {
                if (suspiciousIds.has(edge.source) || suspiciousIds.has(edge.target)) {
                    relevantIds.add(edge.source);
                    relevantIds.add(edge.target);
                }
            }

            // If still too many, limit neighbors
            if (relevantIds.size > MAX_NODES) {
                nodes = nodes.filter(n => suspiciousIds.has(n.id)).slice(0, MAX_NODES);
            } else {
                // Add random normal nodes to fill
                const remaining = nodes.filter(n => !relevantIds.has(n.id));
                const added = remaining.slice(0, MAX_NODES - relevantIds.size);
                added.forEach(n => relevantIds.add(n.id));
                nodes = nodes.filter(n => relevantIds.has(n.id));
            }

            const nodeIdSet = new Set(nodes.map(n => n.id));
            edges = edges.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));
        }

        // Create copy for D3 mutation
        const simNodes = nodes.map(n => ({ ...n }));
        const simLinks = edges.map(e => ({ ...e }));

        // Create container groups
        const g = svg.append('g');

        // Zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 5])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        // Arrow markers for directed edges
        const defs = svg.append('defs');

        defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', 'rgba(148, 163, 184, 0.4)');

        defs.append('marker')
            .attr('id', 'arrowhead-suspicious')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 24)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', 'rgba(239, 68, 68, 0.6)');

        // Glow filter for suspicious nodes
        const filter = defs.append('filter')
            .attr('id', 'glow');
        filter.append('feGaussianBlur')
            .attr('stdDeviation', '3')
            .attr('result', 'coloredBlur');
        const feMerge = filter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Force simulation
        const simulation = d3.forceSimulation(simNodes)
            .force('link', d3.forceLink(simLinks)
                .id(d => d.id)
                .distance(80)
                .strength(0.3))
            .force('charge', d3.forceManyBody()
                .strength(-150)
                .distanceMax(400))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(d => d.isSuspicious ? 18 : 12))
            .force('x', d3.forceX(width / 2).strength(0.05))
            .force('y', d3.forceY(height / 2).strength(0.05));

        // Draw edges
        const link = g.append('g')
            .selectAll('line')
            .data(simLinks)
            .join('line')
            .attr('stroke', d => {
                const sourceNode = simNodes.find(n => n.id === (d.source.id || d.source));
                const targetNode = simNodes.find(n => n.id === (d.target.id || d.target));
                if (sourceNode?.isSuspicious && targetNode?.isSuspicious) return 'rgba(239, 68, 68, 0.4)';
                if (sourceNode?.isSuspicious || targetNode?.isSuspicious) return 'rgba(239, 68, 68, 0.2)';
                return 'rgba(148, 163, 184, 0.12)';
            })
            .attr('stroke-width', d => {
                const sourceNode = simNodes.find(n => n.id === (d.source.id || d.source));
                const targetNode = simNodes.find(n => n.id === (d.target.id || d.target));
                if (sourceNode?.isSuspicious && targetNode?.isSuspicious) return 2;
                return 1;
            })
            .attr('marker-end', d => {
                const sourceNode = simNodes.find(n => n.id === (d.source.id || d.source));
                const targetNode = simNodes.find(n => n.id === (d.target.id || d.target));
                if (sourceNode?.isSuspicious || targetNode?.isSuspicious) return 'url(#arrowhead-suspicious)';
                return 'url(#arrowhead)';
            });

        // Draw nodes
        const node = g.append('g')
            .selectAll('g')
            .data(simNodes)
            .join('g')
            .call(d3.drag()
                .on('start', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }))
            .style('cursor', 'pointer');

        // Suspicious node outer ring
        node.filter(d => d.isSuspicious)
            .append('circle')
            .attr('r', 16)
            .attr('fill', 'none')
            .attr('stroke', d => {
                const rings = ringMembership.get(d.id);
                return rings ? ringColorScale(rings[0]) : '#ef4444';
            })
            .attr('stroke-width', 2.5)
            .attr('stroke-dasharray', '4,2')
            .style('filter', 'url(#glow)')
            .style('animation', 'pulse 2s ease-in-out infinite');

        // Main node circle
        node.append('circle')
            .attr('r', d => {
                if (d.isSuspicious) return 10;
                return 4 + Math.min(Math.sqrt(d.txCount), 6);
            })
            .attr('fill', d => {
                if (d.isSuspicious) {
                    const rings = ringMembership.get(d.id);
                    return rings ? ringColorScale(rings[0]) : '#ef4444';
                }
                return '#6366f1';
            })
            .attr('fill-opacity', d => d.isSuspicious ? 0.9 : 0.5)
            .attr('stroke', d => d.isSuspicious ? 'rgba(255,255,255,0.3)' : 'rgba(99,102,241,0.3)')
            .attr('stroke-width', d => d.isSuspicious ? 2 : 1);

        // Labels for suspicious nodes
        node.filter(d => d.isSuspicious)
            .append('text')
            .text(d => d.id.length > 12 ? d.id.slice(0, 12) + '…' : d.id)
            .attr('font-size', '8px')
            .attr('font-family', 'JetBrains Mono, monospace')
            .attr('fill', 'var(--text-primary)')
            .attr('text-anchor', 'middle')
            .attr('dy', 28)
            .attr('font-weight', '600');

        // Hover interactions
        node.on('mouseenter', (event, d) => {
            const [x, y] = d3.pointer(event, containerRef.current);
            setTooltip({
                x: Math.min(x + 15, dimensions.width - 250),
                y: Math.max(y - 10, 10),
                data: d
            });

            // Highlight connected edges
            link.attr('stroke-opacity', l => {
                return (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.1;
            }).attr('stroke-width', l => {
                return (l.source.id === d.id || l.target.id === d.id) ? 2.5 : 0.5;
            });

            // Dim unconnected nodes
            const connectedIds = new Set();
            connectedIds.add(d.id);
            simLinks.forEach(l => {
                if (l.source.id === d.id) connectedIds.add(l.target.id);
                if (l.target.id === d.id) connectedIds.add(l.source.id);
            });

            node.select('circle:last-of-type')
                .attr('fill-opacity', n => connectedIds.has(n.id) ? 1 : 0.1);
        })
            .on('mouseleave', () => {
                setTooltip(null);
                link.attr('stroke-opacity', 1).attr('stroke-width', d => {
                    const sourceNode = simNodes.find(n => n.id === (d.source.id || d.source));
                    const targetNode = simNodes.find(n => n.id === (d.target.id || d.target));
                    if (sourceNode?.isSuspicious && targetNode?.isSuspicious) return 2;
                    return 1;
                });
                node.select('circle:last-of-type')
                    .attr('fill-opacity', n => n.isSuspicious ? 0.9 : 0.5);
            });

        // Tick function
        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Initial zoom to fit
        setTimeout(() => {
            const bounds = g.node().getBBox();
            const dx = bounds.width;
            const dy = bounds.height;
            const x = bounds.x + dx / 2;
            const y = bounds.y + dy / 2;
            const scale = Math.min(0.8 * width / dx, 0.8 * height / dy, 2);
            const transform = d3.zoomIdentity
                .translate(width / 2, height / 2)
                .scale(scale)
                .translate(-x, -y);
            svg.transition().duration(750).call(zoom.transform, transform);
        }, 2000);

        return () => {
            simulation.stop();
        };
    }, [graphData, dimensions, ringMembership, ringColorScale]);

    if (!graphData) return null;

    return (
        <div className="graph-container" ref={containerRef} id="graph-container">
            <div className="graph-container__header">
                <div className="graph-container__title">
                    <span>🕸️</span>
                    Transaction Network Graph
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                        ({graphData.nodes.length} nodes, {graphData.edges.length} edges)
                    </span>
                </div>
                <div className="graph-container__legend">
                    <div className="legend-item">
                        <div className="legend-dot legend-dot--normal" />
                        <span>Normal Account</span>
                    </div>
                    <div className="legend-item">
                        <div className="legend-dot legend-dot--suspicious" />
                        <span>Suspicious</span>
                    </div>
                    <div className="legend-item">
                        <div className="legend-dot legend-dot--ring" />
                        <span>Ring Member</span>
                    </div>
                </div>
            </div>

            <svg ref={svgRef} className="graph-svg" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} />

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="node-tooltip"
                    style={{
                        left: tooltip.x,
                        top: tooltip.y + 50,
                        opacity: 1
                    }}
                >
                    <div className="node-tooltip__title">{tooltip.data.id}</div>
                    <div className="node-tooltip__row">
                        <span className="node-tooltip__label">Total Sent</span>
                        <span className="node-tooltip__value">${tooltip.data.totalSent?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="node-tooltip__row">
                        <span className="node-tooltip__label">Total Received</span>
                        <span className="node-tooltip__value">${tooltip.data.totalReceived?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="node-tooltip__row">
                        <span className="node-tooltip__label">Transactions</span>
                        <span className="node-tooltip__value">{tooltip.data.txCount}</span>
                    </div>
                    <div className="node-tooltip__row">
                        <span className="node-tooltip__label">In / Out</span>
                        <span className="node-tooltip__value">{tooltip.data.inDegree} / {tooltip.data.outDegree}</span>
                    </div>
                    {tooltip.data.isSuspicious ? (
                        <div className="node-tooltip__badge node-tooltip__badge--danger">
                            ⚠️ Suspicion Score: {tooltip.data.suspicionScore} — {tooltip.data.patterns?.join(', ')}
                        </div>
                    ) : (
                        <div className="node-tooltip__badge node-tooltip__badge--safe">
                            ✅ No suspicious activity detected
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default GraphVisualization;
