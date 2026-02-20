import React, { useRef, useEffect, useCallback } from 'react';

/**
 * Antigravity — Particles scattered across the canvas that are attracted
 * toward and follow the cursor, forming a trailing cloud.
 * Based on the React Bits Antigravity effect.
 */
function Antigravity({
    count = 300,
    magnetRadius = 6,
    ringRadius = 7,
    waveSpeed = 0.4,
    waveAmplitude = 1,
    particleSize = 1.5,
    lerpSpeed = 0.05,
    color = '#5227FF',
    autoAnimate = true,
    particleVariance = 1,
    rotationSpeed = 0,
    depthFactor = 1,
    pulseSpeed = 3,
    particleShape = 'capsule',
    fieldStrength = 10,
}) {
    const canvasRef = useRef(null);
    const animFrameRef = useRef(null);
    const mouseRef = useRef({ x: -1000, y: -1000, active: false });
    const particlesRef = useRef(null);
    const timeRef = useRef(0);

    // Parse hex color
    const parseColor = useCallback((hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }, []);

    // Initialize particles scattered randomly
    const initParticles = useCallback((width, height) => {
        const particles = [];
        for (let i = 0; i < count; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height;
            particles.push({
                // Home = random position across canvas
                homeX: x,
                homeY: y,
                x,
                y,
                // Current drawing position (for smooth lerp)
                drawX: x,
                drawY: y,
                // Random rotation angle for the capsule
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.02,
                // Depth for parallax
                depth: 0.3 + Math.random() * 0.7,
                // Phase offset for wave
                phase: Math.random() * Math.PI * 2,
                // Size variance
                size: particleSize * (1.8 + Math.random() * 2.4),
            });
        }
        return particles;
    }, [count, particleSize]);

    // Main animation
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let width, height;

        const resize = () => {
            const parent = canvas.parentElement;
            if (!parent) return;
            width = parent.offsetWidth;
            height = parent.offsetHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            particlesRef.current = initParticles(width, height);
        };

        resize();
        window.addEventListener('resize', resize);

        const { r: cr, g: cg, b: cb } = parseColor(color);
        const magRadFactor = magnetRadius * 0.06; // Fraction of canvas
        const strength = fieldStrength;

        const animate = () => {
            if (!autoAnimate) return;
            timeRef.current += 0.016;
            const t = timeRef.current;
            const particles = particlesRef.current;
            if (!particles || !width) return;

            ctx.clearRect(0, 0, width, height);

            const mouse = mouseRef.current;
            const mx = mouse.x;
            const my = mouse.y;
            const isActive = mouse.active;
            const magRad = Math.min(width, height) * magRadFactor;

            for (const p of particles) {
                // Target = home position + gentle wave drift
                let targetX = p.homeX + Math.sin(t * waveSpeed + p.phase) * waveAmplitude * 6 * p.depth;
                let targetY = p.homeY + Math.cos(t * waveSpeed * 0.8 + p.phase * 1.5) * waveAmplitude * 4 * p.depth;

                // If mouse active, attract particles toward cursor
                if (isActive) {
                    const dx = mx - p.x;
                    const dy = my - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < magRad && dist > 0) {
                        // Attraction force: stronger when closer
                        const force = (1 - dist / magRad) * strength * p.depth;
                        // Move target toward mouse
                        targetX = p.x + (dx / dist) * force * 4;
                        targetY = p.y + (dy / dist) * force * 4;
                    }
                }

                // Smooth lerp toward target
                p.x += (targetX - p.x) * lerpSpeed;
                p.y += (targetY - p.y) * lerpSpeed;

                // Rotate capsule slowly
                p.rotation += p.rotationSpeed;

                // Depth-based alpha and size — vivid and bright
                const alpha = (0.6 + p.depth * 0.4) * depthFactor;
                const size = p.size * (0.6 + p.depth * 0.4);

                // Color — keep bright, only slight depth variation
                const brightness = 0.75 + p.depth * 0.25;
                const pr = Math.min(255, Math.round(cr * brightness));
                const pg = Math.min(255, Math.round(cg * brightness));
                const pb = Math.min(255, Math.round(cb * brightness));

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = `rgb(${pr},${pg},${pb})`;

                if (particleShape === 'capsule') {
                    // Draw a small rotated capsule/dash
                    const w = size * 5;
                    const h = size * 1.2;
                    const r = h / 2;
                    ctx.beginPath();
                    ctx.moveTo(-w / 2 + r, -h / 2);
                    ctx.lineTo(w / 2 - r, -h / 2);
                    ctx.arc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
                    ctx.lineTo(-w / 2 + r, h / 2);
                    ctx.arc(-w / 2 + r, 0, r, Math.PI / 2, -Math.PI / 2);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, size, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            }

            ctx.globalAlpha = 1;
            animFrameRef.current = requestAnimationFrame(animate);
        };

        animFrameRef.current = requestAnimationFrame(animate);

        // Mouse handlers
        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseRef.current.x = e.clientX - rect.left;
            mouseRef.current.y = e.clientY - rect.top;
            mouseRef.current.active = true;
        };

        const handleMouseLeave = () => {
            mouseRef.current.active = false;
        };

        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            window.removeEventListener('resize', resize);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [
        autoAnimate, color, count, depthFactor, fieldStrength,
        initParticles, lerpSpeed, magnetRadius, parseColor,
        particleShape, pulseSpeed, waveAmplitude, waveSpeed,
    ]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'auto',
            }}
        />
    );
}

export default Antigravity;
