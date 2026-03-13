// ==================== NEXUS LOGIN - 3D GLOBE + PARTICLES ====================
// Canvas-based: wireframe globe, floating particles, mouse interaction
// Optimized: requestAnimationFrame, distance culling, throttled mouse

(function () {
    'use strict';

    const canvas = document.getElementById('nexusCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // === CONFIG ===
    const CFG = {
        // Colors
        pink: '#ff2d78',
        pinkGlow: 'rgba(255, 45, 120, ',
        purple: '#7b2fbe',
        purpleGlow: 'rgba(123, 47, 190, ',
        blue: '#3a7bd5',
        blueGlow: 'rgba(58, 123, 213, ',
        // Globe
        globeRadius: 0,         // set on resize
        globePoints: 120,
        globeRotSpeed: 0.002,
        globeConnectionDist: 0.35,
        // Particles
        particleCount: 50,
        particleMaxSpeed: 0.3,
        // Mouse
        mouseRadius: 120,
        mouseForce: 0.02
    };

    // === STATE ===
    let W = 0, H = 0, cx = 0, cy = 0;
    let mouse = { x: -9999, y: -9999 };
    let globeAngleY = 0, globeAngleX = 0.3;
    let globeNodes = [];
    let particles = [];
    let animId = null;

    // === RESIZE ===
    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = canvas.clientWidth;
        H = canvas.clientHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cx = W / 2;
        cy = H / 2;
        CFG.globeRadius = Math.min(W, H) * 0.32;
    }

    // === GLOBE POINTS (Fibonacci sphere) ===
    function initGlobe() {
        globeNodes = [];
        const n = CFG.globePoints;
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < n; i++) {
            const y = 1 - (i / (n - 1)) * 2;
            const r = Math.sqrt(1 - y * y);
            const theta = goldenAngle * i;
            globeNodes.push({
                ox: Math.cos(theta) * r,
                oy: y,
                oz: Math.sin(theta) * r,
                x: 0, y: 0, z: 0,
                sx: 0, sy: 0,
                pulse: Math.random() * Math.PI * 2,
                size: 1.2 + Math.random() * 1.2
            });
        }
    }

    // === FLOATING PARTICLES ===
    function initParticles() {
        particles = [];
        for (let i = 0; i < CFG.particleCount; i++) {
            particles.push({
                x: Math.random() * W,
                y: Math.random() * H,
                vx: (Math.random() - 0.5) * CFG.particleMaxSpeed,
                vy: (Math.random() - 0.5) * CFG.particleMaxSpeed,
                size: Math.random() * 2.5 + 1,
                alpha: Math.random() * 0.5 + 0.2,
                color: Math.random() > 0.5 ? CFG.pink : CFG.purple
            });
        }
    }

    // === 3D ROTATION + PROJECTION ===
    function rotateY(p, angle) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const x = p.ox * cos - p.oz * sin;
        const z = p.ox * sin + p.oz * cos;
        return { x: x, y: p.oy, z: z };
    }

    function rotateX(p, angle) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const y = p.y * cos - p.z * sin;
        const z = p.y * sin + p.z * cos;
        return { x: p.x, y: y, z: z };
    }

    function project(p3d) {
        const perspective = 600;
        const scale = perspective / (perspective + p3d.z * CFG.globeRadius);
        return {
            x: cx + p3d.x * CFG.globeRadius * scale,
            y: cy + p3d.y * CFG.globeRadius * scale,
            scale: scale,
            z: p3d.z
        };
    }

    // === DRAW GLOBE ===
    function drawGlobe(time) {
        globeAngleY += CFG.globeRotSpeed;

        // Transform all points
        for (let i = 0; i < globeNodes.length; i++) {
            const n = globeNodes[i];
            const ry = rotateY(n, globeAngleY);
            const rx = rotateX(ry, globeAngleX);
            const p = project(rx);
            n.x = p.x;
            n.y = p.y;
            n.z = rx.z;
            n.sx = p.scale;
            n.sy = p.scale;
        }

        // Draw connections (only front-facing, distance-culled)
        ctx.lineWidth = 0.5;
        for (let i = 0; i < globeNodes.length; i++) {
            const a = globeNodes[i];
            if (a.z < -0.2) continue; // cull back-facing
            for (let j = i + 1; j < globeNodes.length; j++) {
                const b = globeNodes[j];
                if (b.z < -0.2) continue;
                const dx = a.ox - b.ox, dy = a.oy - b.oy, dz = a.oz - b.oz;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < CFG.globeConnectionDist) {
                    const alpha = (1 - dist / CFG.globeConnectionDist) * 0.25 * Math.min(a.z + 0.5, 1) * Math.min(b.z + 0.5, 1);
                    ctx.strokeStyle = CFG.pinkGlow + alpha + ')';
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }

        // Draw nodes
        for (let i = 0; i < globeNodes.length; i++) {
            const n = globeNodes[i];
            if (n.z < -0.3) continue;

            const depthAlpha = Math.max(0, Math.min(1, (n.z + 0.5) * 1.2));
            const pulse = 1 + Math.sin(time * 0.003 + n.pulse) * 0.3;
            const size = n.size * n.sx * pulse;

            // Glow
            ctx.beginPath();
            ctx.arc(n.x, n.y, size * 2.5, 0, Math.PI * 2);
            ctx.fillStyle = CFG.pinkGlow + depthAlpha * 0.12 + ')';
            ctx.fill();

            // Core
            ctx.beginPath();
            ctx.arc(n.x, n.y, size, 0, Math.PI * 2);
            ctx.fillStyle = CFG.pinkGlow + depthAlpha * 0.7 + ')';
            ctx.fill();
        }
    }

    // === DRAW PARTICLES ===
    function drawParticles() {
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            // Mouse attraction
            const dx = mouse.x - p.x;
            const dy = mouse.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < CFG.mouseRadius && dist > 1) {
                p.vx += (dx / dist) * CFG.mouseForce;
                p.vy += (dy / dist) * CFG.mouseForce;
            }

            // Damping
            p.vx *= 0.99;
            p.vy *= 0.99;

            // Clamp speed
            const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            if (speed > CFG.particleMaxSpeed * 2) {
                p.vx = (p.vx / speed) * CFG.particleMaxSpeed * 2;
                p.vy = (p.vy / speed) * CFG.particleMaxSpeed * 2;
            }

            // Move
            p.x += p.vx;
            p.y += p.vy;

            // Wrap edges
            if (p.x < -10) p.x = W + 10;
            if (p.x > W + 10) p.x = -10;
            if (p.y < -10) p.y = H + 10;
            if (p.y > H + 10) p.y = -10;

            // Glow
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            ctx.fillStyle = (p.color === CFG.pink ? CFG.pinkGlow : CFG.purpleGlow) + (p.alpha * 0.15) + ')';
            ctx.fill();

            // Core
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = (p.color === CFG.pink ? CFG.pinkGlow : CFG.purpleGlow) + p.alpha + ')';
            ctx.fill();
        }

        // Draw connections between close particles
        ctx.lineWidth = 0.4;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const a = particles[i], b = particles[j];
                const dx = a.x - b.x, dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 100) {
                    const alpha = (1 - dist / 100) * 0.15;
                    ctx.strokeStyle = CFG.purpleGlow + alpha + ')';
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }
    }

    // === MAIN LOOP ===
    function animate(time) {
        ctx.clearRect(0, 0, W, H);
        drawGlobe(time);
        drawParticles();
        animId = requestAnimationFrame(animate);
    }

    // === MOUSE TRACKING (throttled) ===
    let mouseThrottle = false;
    canvas.addEventListener('mousemove', function (e) {
        if (mouseThrottle) return;
        mouseThrottle = true;
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        setTimeout(function () { mouseThrottle = false; }, 16);
    });

    canvas.addEventListener('mouseleave', function () {
        mouse.x = -9999;
        mouse.y = -9999;
    });

    // Touch support
    canvas.addEventListener('touchmove', function (e) {
        const rect = canvas.getBoundingClientRect();
        const t = e.touches[0];
        mouse.x = t.clientX - rect.left;
        mouse.y = t.clientY - rect.top;
    }, { passive: true });

    canvas.addEventListener('touchend', function () {
        mouse.x = -9999;
        mouse.y = -9999;
    });

    // === INIT ===
    function init() {
        resize();
        initGlobe();
        initParticles();
        animId = requestAnimationFrame(animate);
    }

    // Debounced resize
    let resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            resize();
            initParticles(); // redistribute particles
        }, 200);
    });

    // Pause when tab not visible
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            cancelAnimationFrame(animId);
        } else {
            animId = requestAnimationFrame(animate);
        }
    });

    init();
})();
