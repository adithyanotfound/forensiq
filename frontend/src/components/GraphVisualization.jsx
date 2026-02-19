import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';

/**
 * Canvas-based graph visualization — dramatically more efficient than SVG.
 * Nodes are color-coded by detection pattern:
 *   - Cycle: Hot Pink (#ff007f)
 *   - Shell Network: Orange (#ff8c00)
 *   - Fan-in/Fan-out: Green (#00ff00)
 *   - Normal: Indigo (#6366f1)
 */
function GraphVisualization({ graphData, fraudRings }) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const simulationRef = useRef(null);
    const transformRef = useRef(d3.zoomIdentity);
    const hoveredNodeRef = useRef(null);
    const dragNodeRef = useRef(null);
    const nodesRef = useRef([]);
    const linksRef = useRef([]);
    const nodeMapRef = useRef(new Map());
    const [tooltip, setTooltip] = useState(null);
    const [nodeCount, setNodeCount] = useState(0);
    const [edgeCount, setEdgeCount] = useState(0);

    const WIDTH = 960;
    const HEIGHT = 600;
    const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    // Build pattern type lookup per node from fraud rings
    const nodePatternMap = useMemo(() => {
        const map = new Map();
        if (fraudRings) {
            fraudRings.forEach((ring) => {
                ring.member_accounts.forEach(id => {
                    if (!map.has(id)) {
                        map.set(id, ring.pattern_type);
                    }
                });
            });
        }
        return map;
    }, [fraudRings]);

    // Filter and prepare graph data
    const { filteredNodes, filteredEdges } = useMemo(() => {
        if (!graphData) return { filteredNodes: [], filteredEdges: [] };

        let nodes = graphData.nodes;
        let edges = graphData.edges;

        const MAX_NODES = 200;

        if (nodes.length > MAX_NODES) {
            // Keep all suspicious nodes
            const suspiciousIds = new Set(nodes.filter(n => n.isSuspicious).map(n => n.id));
            const neighborIds = new Set();

            // Add 1-hop neighbors of suspicious nodes (limited)
            for (const edge of edges) {
                if (suspiciousIds.has(edge.source)) neighborIds.add(edge.target);
                if (suspiciousIds.has(edge.target)) neighborIds.add(edge.source);
            }

            const relevantIds = new Set([...suspiciousIds]);
            // Add neighbors up to the limit
            for (const id of neighborIds) {
                if (relevantIds.size >= MAX_NODES) break;
                relevantIds.add(id);
            }

            // Fill remaining with random nodes
            if (relevantIds.size < MAX_NODES) {
                for (const n of nodes) {
                    if (relevantIds.size >= MAX_NODES) break;
                    relevantIds.add(n.id);
                }
            }

            nodes = nodes.filter(n => relevantIds.has(n.id));
            const nodeIdSet = new Set(nodes.map(n => n.id));
            edges = edges.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));
        }

        return {
            filteredNodes: nodes.map(n => ({ ...n })),
            filteredEdges: edges.map(e => ({ ...e }))
        };
    }, [graphData]);

    // Get node color based on pattern type
    const getNodeColor = useCallback((node) => {
        if (!node.isSuspicious) return '#6366f1';

        const pattern = nodePatternMap.get(node.id);
        if (!pattern) return '#ff007f'; // default suspicious to hotpink

        if (pattern === 'cycle') return '#ff007f';           // Hot pink
        if (pattern === 'shell_network') return '#ff8c00';   // Orange
        if (pattern === 'fan_in' || pattern === 'fan_out' || pattern === 'fan_in_fan_out') return '#00ff00'; // Green

        return '#ff007f'; // fallback
    }, [nodePatternMap]);

    // Get node radius
    const getNodeRadius = useCallback((node) => {
        if (node.isSuspicious) return 8;
        return 3 + Math.min(Math.sqrt(node.txCount || 1), 4);
    }, []);

    // Draw the entire scene on canvas
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const transform = transformRef.current;
        const nodes = nodesRef.current;
        const links = linksRef.current;
        const hovered = hoveredNodeRef.current;

        // Clear
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Apply zoom transform (accounting for DPR)
        ctx.setTransform(
            DPR * transform.k, 0, 0,
            DPR * transform.k,
            DPR * transform.x,
            DPR * transform.y
        );

        // Build hovered connections set AND ring-peer set for highlighting
        let connectedIds = null;
        let ringPeerIds = null;
        if (hovered) {
            connectedIds = new Set([hovered.id]);
            for (const l of links) {
                const sid = l.source.id || l.source;
                const tid = l.target.id || l.target;
                if (sid === hovered.id) connectedIds.add(tid);
                if (tid === hovered.id) connectedIds.add(sid);
            }

            // Also collect all nodes that share a fraud ring with the hovered node
            ringPeerIds = new Set([hovered.id]);
            if (fraudRings) {
                for (const ring of fraudRings) {
                    if (ring.member_accounts.includes(hovered.id)) {
                        ring.member_accounts.forEach(id => ringPeerIds.add(id));
                    }
                }
            }
        }

        // --- Draw edges ---
        for (const l of links) {
            const sx = l.source.x, sy = l.source.y;
            const tx = l.target.x, ty = l.target.y;
            if (sx === undefined || ty === undefined) continue;

            const srcSus = l.source.isSuspicious;
            const tgtSus = l.target.isSuspicious;
            const sid = l.source.id || l.source;
            const tid = l.target.id || l.target;

            let alpha = 0.12;
            let width = 0.5;

            if (srcSus && tgtSus) {
                alpha = 0.5;
                width = 1.5;
            } else if (srcSus || tgtSus) {
                alpha = 0.25;
                width = 0.8;
            }

            // Dim edges not connected to hovered node, but keep ring-peer edges visible
            if (hovered) {
                const directlyConnected = sid === hovered.id || tid === hovered.id;
                const inSameRing = ringPeerIds && ringPeerIds.has(sid) && ringPeerIds.has(tid);

                if (directlyConnected) {
                    alpha = 0.8;
                    width = 2;
                } else if (inSameRing) {
                    alpha = 0.4;
                    width = 1.5;
                } else {
                    alpha = 0.03;
                    width = 0.3;
                }
            }

            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(tx, ty);

            if (srcSus && tgtSus) {
                ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
            } else if (srcSus || tgtSus) {
                ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
            } else {
                ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
            }
            ctx.lineWidth = width;
            ctx.stroke();

            // Draw arrowhead for visible edges
            if (alpha > 0.1) {
                const dx = tx - sx, dy = ty - sy;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0) {
                    const r = getNodeRadius(l.target);
                    const ux = dx / len, uy = dy / len;
                    const ax = tx - ux * (r + 3), ay = ty - uy * (r + 3);
                    const arrowSize = 4;
                    ctx.beginPath();
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(ax - arrowSize * ux + arrowSize * 0.5 * uy, ay - arrowSize * uy - arrowSize * 0.5 * ux);
                    ctx.lineTo(ax - arrowSize * ux - arrowSize * 0.5 * uy, ay - arrowSize * uy + arrowSize * 0.5 * ux);
                    ctx.closePath();
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.fill();
                }
            }
        }

        // --- Draw nodes ---
        for (const node of nodes) {
            if (node.x === undefined) continue;

            const r = getNodeRadius(node);
            const color = getNodeColor(node);
            let nodeAlpha = node.isSuspicious ? 0.9 : 0.5;

            // Dim nodes not connected to hovered (but keep ring peers visible)
            if (hovered && connectedIds) {
                if (connectedIds.has(node.id)) {
                    nodeAlpha = 1.0;
                } else if (ringPeerIds && ringPeerIds.has(node.id)) {
                    nodeAlpha = 0.7;
                } else {
                    nodeAlpha = 0.08;
                }
            }

            // Suspicious outer ring (simple dashed circle, no glow filter)
            if (node.isSuspicious) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 2]);
                ctx.globalAlpha = nodeAlpha;
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Main circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            ctx.globalAlpha = nodeAlpha;
            ctx.fillStyle = color;
            ctx.fill();

            // Stroke
            ctx.strokeStyle = node.isSuspicious ? 'rgba(255,255,255,0.3)' : 'rgba(99,102,241,0.2)';
            ctx.lineWidth = node.isSuspicious ? 1.5 : 0.5;
            ctx.stroke();

            ctx.globalAlpha = 1;
        }

        // --- Draw labels (only for suspicious nodes, at sufficient zoom) ---
        if (transform.k > 0.5) {
            ctx.font = `600 ${Math.max(7, 9 / transform.k)}px "Geist Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            for (const node of nodes) {
                if (!node.isSuspicious || node.x === undefined) continue;

                let labelAlpha = 0.85;
                if (hovered && connectedIds) {
                    if (connectedIds.has(node.id)) {
                        labelAlpha = 1.0;
                    } else if (ringPeerIds && ringPeerIds.has(node.id)) {
                        labelAlpha = 0.6;
                    } else {
                        labelAlpha = 0.08;
                    }
                }

                const r = getNodeRadius(node);
                const label = node.id.length > 14 ? node.id.slice(0, 14) + '...' : node.id;

                ctx.globalAlpha = labelAlpha;
                ctx.fillStyle = '#e2e8f0';
                ctx.fillText(label, node.x, node.y + r + 6);
                ctx.globalAlpha = 1;
            }
        }

        // --- Hovered node highlight ring ---
        if (hovered && hovered.x !== undefined) {
            const r = getNodeRadius(hovered);
            ctx.beginPath();
            ctx.arc(hovered.x, hovered.y, r + 3, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.restore();
    }, [DPR, getNodeColor, getNodeRadius, fraudRings]);

    // Find node at canvas position
    const findNodeAt = useCallback((canvasX, canvasY) => {
        const transform = transformRef.current;
        // Convert screen coords to graph coords
        const gx = (canvasX - transform.x) / transform.k;
        const gy = (canvasY - transform.y) / transform.k;

        const nodes = nodesRef.current;
        let closest = null;
        let closestDist = Infinity;

        for (const node of nodes) {
            if (node.x === undefined) continue;
            const dx = node.x - gx;
            const dy = node.y - gy;
            const dist = dx * dx + dy * dy;
            const r = getNodeRadius(node) + 4; // add hit margin
            if (dist < r * r && dist < closestDist) {
                closest = node;
                closestDist = dist;
            }
        }
        return closest;
    }, [getNodeRadius]);

    // Main effect: setup simulation and canvas interaction
    useEffect(() => {
        if (!filteredNodes.length || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const container = containerRef.current;
        const rect = container?.getBoundingClientRect();
        const width = rect?.width || WIDTH;
        const height = HEIGHT;

        // Set canvas size for HiDPI
        canvas.width = width * DPR;
        canvas.height = height * DPR;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        // Copy data for D3 mutation
        const simNodes = filteredNodes.map(n => ({ ...n }));
        const simLinks = filteredEdges.map(e => ({ ...e }));

        nodesRef.current = simNodes;
        linksRef.current = simLinks;
        setNodeCount(simNodes.length);
        setEdgeCount(simLinks.length);

        // Build node lookup
        const nodeMap = new Map();
        simNodes.forEach(n => nodeMap.set(n.id, n));
        nodeMapRef.current = nodeMap;

        // Force simulation
        const simulation = d3.forceSimulation(simNodes)
            .force('link', d3.forceLink(simLinks)
                .id(d => d.id)
                .distance(60)
                .strength(0.4))
            .force('charge', d3.forceManyBody()
                .strength(-100)
                .distanceMax(300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(d => d.isSuspicious ? 14 : 8))
            .force('x', d3.forceX(width / 2).strength(0.06))
            .force('y', d3.forceY(height / 2).strength(0.06))
            .alphaDecay(0.03)
            .velocityDecay(0.4);

        simulationRef.current = simulation;

        // On tick: just redraw canvas (no DOM manipulation!)
        simulation.on('tick', draw);

        // Stop simulation after stabilization to save CPU
        simulation.on('end', () => {
            draw(); // final draw
        });

        // Zoom behavior on canvas using d3-zoom
        const canvasSelection = d3.select(canvas);

        const zoom = d3.zoom()
            .scaleExtent([0.1, 6])
            .on('zoom', (event) => {
                transformRef.current = event.transform;
                draw();
            });

        canvasSelection.call(zoom);

        // Initial zoom to fit (after simulation settles a bit)
        setTimeout(() => {
            if (simNodes.length === 0) return;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const n of simNodes) {
                if (n.x === undefined) continue;
                if (n.x < minX) minX = n.x;
                if (n.y < minY) minY = n.y;
                if (n.x > maxX) maxX = n.x;
                if (n.y > maxY) maxY = n.y;
            }
            const dx = maxX - minX || 1;
            const dy = maxY - minY || 1;
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            const scale = Math.min(0.8 * width / dx, 0.8 * height / dy, 2.5);
            const t = d3.zoomIdentity
                .translate(width / 2, height / 2)
                .scale(scale)
                .translate(-cx, -cy);
            canvasSelection.transition().duration(800).call(zoom.transform, t);
        }, 1500);

        // Mouse interactions
        const handleMouseMove = (event) => {
            const r = canvas.getBoundingClientRect();
            const x = event.clientX - r.left;
            const y = event.clientY - r.top;

            if (dragNodeRef.current) {
                // Dragging: update node position
                const transform = transformRef.current;
                const gx = (x - transform.x) / transform.k;
                const gy = (y - transform.y) / transform.k;
                dragNodeRef.current.fx = gx;
                dragNodeRef.current.fy = gy;
                simulation.alpha(0.3).restart();
                return;
            }

            const node = findNodeAt(x, y);
            const prev = hoveredNodeRef.current;

            if (node !== prev) {
                hoveredNodeRef.current = node;
                canvas.style.cursor = node ? 'pointer' : 'grab';
                draw();

                if (node) {
                    setTooltip({
                        x: Math.min(event.clientX - r.left + 15, width - 260),
                        y: Math.max(event.clientY - r.top - 10, 10),
                        data: node
                    });
                } else {
                    setTooltip(null);
                }
            }
        };

        const handleMouseDown = (event) => {
            const r = canvas.getBoundingClientRect();
            const x = event.clientX - r.left;
            const y = event.clientY - r.top;
            const node = findNodeAt(x, y);

            if (node) {
                event.stopPropagation();
                dragNodeRef.current = node;
                const transform = transformRef.current;
                node.fx = (x - transform.x) / transform.k;
                node.fy = (y - transform.y) / transform.k;
                simulation.alphaTarget(0.3).restart();

                // Disable zoom while dragging
                canvasSelection.on('.zoom', null);
            }
        };

        const handleMouseUp = () => {
            if (dragNodeRef.current) {
                dragNodeRef.current.fx = null;
                dragNodeRef.current.fy = null;
                dragNodeRef.current = null;
                simulation.alphaTarget(0);

                // Re-enable zoom
                canvasSelection.call(zoom);
            }
        };

        const handleMouseLeave = () => {
            hoveredNodeRef.current = null;
            setTooltip(null);
            draw();
        };

        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseLeave);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            simulation.stop();
            simulationRef.current = null;
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('mouseleave', handleMouseLeave);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [filteredNodes, filteredEdges, DPR, draw, findNodeAt]);

    if (!graphData) return null;

    return (
        <div className="graph-container" ref={containerRef} id="graph-container">
            <div className="graph-container__header">
                <div className="graph-container__title">
                    Transaction Network Graph
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>
                        ({nodeCount} nodes, {edgeCount} edges
                        {graphData.nodes.length > nodeCount && ` of ${graphData.nodes.length} total`})
                    </span>
                </div>
                <div className="graph-container__legend">
                    <div className="legend-item">
                        <div className="legend-dot legend-dot--cycle" />
                        <span>Cycle</span>
                    </div>
                    <div className="legend-item">
                        <div className="legend-dot legend-dot--shell" />
                        <span>Shell Network</span>
                    </div>
                    <div className="legend-item">
                        <div className="legend-dot legend-dot--fanio" />
                        <span>Fan-in / Fan-out</span>
                    </div>
                    <div className="legend-item">
                        <div className="legend-dot legend-dot--normal" />
                        <span>Normal</span>
                    </div>
                </div>
            </div>

            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: HEIGHT, cursor: 'grab', display: 'block' }}
            />

            {/* Tooltip overlay */}
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
                        <span className="node-tooltip__value">
                            ${tooltip.data.totalSent?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    <div className="node-tooltip__row">
                        <span className="node-tooltip__label">Total Received</span>
                        <span className="node-tooltip__value">
                            ${tooltip.data.totalReceived?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
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
                            Score: {tooltip.data.suspicionScore} | {tooltip.data.patterns?.join(', ')}
                        </div>
                    ) : (
                        <div className="node-tooltip__badge node-tooltip__badge--safe">
                            No suspicious activity
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default GraphVisualization;
