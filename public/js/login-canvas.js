// ==================== NEXUS LOGIN - DATA-DRIVEN GLOBE ====================
// Particle sphere with plexus connections, data pulses, mouse glow
// Optimized: pre-computed neighbors, spatial culling, visibility API

(function () {
    'use strict';

    const canvas = document.getElementById('nexusCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // === CONFIG ===
    const CFG = {
        // Globe
        globeParticles: 380,
        globeRadius: 0,
        globeRotSpeed: 0.0012,
        globeTilt: 0.4,
        connectionDist3D: 0.38,
        // Data pulses
        pulseCount: 15,
        pulseSpeed: 0.012,
        pulseSpawnRate: 0.02,
        // Ambient particles
        ambientCount: 35,
        // Mouse
        mouseGlowRadius: 150,
        // Colors
        neonPink: [255, 45, 120],
        hotPink: [233, 30, 99],
        purple: [123, 47, 190],
        deepPurple: [58, 20, 120],
        white: [255, 220, 255]
    };

    // === STATE ===
    let W = 0, H = 0, cx = 0, cy = 0;
    let mouse = { x: -9999, y: -9999, active: false };
    let globeAngle = 0;
    let nodes = [];
    let edges = [];
    let pulses = [];
    let ambient = [];
    let animId = null;

    // === HELPERS ===
    function rgba(c, a) {
        return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function lerpColor(c1, c2, t) {
        return [
            Math.round(lerp(c1[0], c2[0], t)),
            Math.round(lerp(c1[1], c2[1], t)),
            Math.round(lerp(c1[2], c2[2], t))
        ];
    }

    // === RESIZE ===
    function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = canvas.clientWidth;
        H = canvas.clientHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cx = W * 0.5;
        cy = H * 0.5;
        CFG.globeRadius = Math.min(W, H) * 0.34;
    }

    // === GENERATE SPHERE PARTICLES (Fibonacci) ===
    function initGlobe() {
        nodes = [];
        var n = CFG.globeParticles;
        var golden = Math.PI * (3 - Math.sqrt(5));

        for (var i = 0; i < n; i++) {
            var y = 1 - (i / (n - 1)) * 2;
            var rad = Math.sqrt(1 - y * y);
            var theta = golden * i;

            // Slight radius variation for organic feel
            var rVar = 0.97 + Math.random() * 0.06;

            nodes.push({
                // Unit sphere coords (with variation)
                ox: Math.cos(theta) * rad * rVar,
                oy: y * rVar,
                oz: Math.sin(theta) * rad * rVar,
                // Screen coords (updated each frame)
                sx: 0, sy: 0, sz: 0, scale: 1,
                // Visual
                size: 0.8 + Math.random() * 1.0,
                phase: Math.random() * Math.PI * 2,
                // Individual orbit speed variation
                speedMul: 0.9 + Math.random() * 0.2
            });
        }

        // Pre-compute edges (pairs of nearby nodes)
        edges = [];
        var maxDist = CFG.connectionDist3D;
        for (var i = 0; i < n; i++) {
            for (var j = i + 1; j < n; j++) {
                var a = nodes[i], b = nodes[j];
                var dx = a.ox - b.ox, dy = a.oy - b.oy, dz = a.oz - b.oz;
                var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < maxDist) {
                    edges.push({
                        i: i, j: j,
                        dist: dist,
                        // Normalized distance for alpha
                        normDist: dist / maxDist
                    });
                }
            }
        }
    }

    // === DATA PULSES ===
    function initPulses() {
        pulses = [];
        for (var i = 0; i < CFG.pulseCount; i++) {
            pulses.push(createPulse(Math.random()));
        }
    }

    function createPulse(progress) {
        var edgeIdx = Math.floor(Math.random() * edges.length);
        return {
            edge: edgeIdx,
            t: progress || 0,
            speed: CFG.pulseSpeed * (0.6 + Math.random() * 0.8),
            size: 1.5 + Math.random() * 1.5,
            reverse: Math.random() > 0.5
        };
    }

    // === AMBIENT PARTICLES ===
    function initAmbient() {
        ambient = [];
        for (var i = 0; i < CFG.ambientCount; i++) {
            ambient.push({
                x: Math.random() * W,
                y: Math.random() * H,
                vx: (Math.random() - 0.5) * 0.15,
                vy: (Math.random() - 0.5) * 0.15,
                size: Math.random() * 1.5 + 0.5,
                alpha: Math.random() * 0.3 + 0.1,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    // === 3D TRANSFORM ===
    function transformNodes(time) {
        var cosY = Math.cos(globeAngle);
        var sinY = Math.sin(globeAngle);
        var cosX = Math.cos(CFG.globeTilt);
        var sinX = Math.sin(CFG.globeTilt);
        var perspective = 700;
        var R = CFG.globeRadius;

        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];

            // Rotate Y (main orbit)
            var x1 = n.ox * cosY - n.oz * sinY;
            var z1 = n.ox * sinY + n.oz * cosY;
            var y1 = n.oy;

            // Rotate X (tilt)
            var y2 = y1 * cosX - z1 * sinX;
            var z2 = y1 * sinX + z1 * cosX;

            // Perspective projection
            var scale = perspective / (perspective + z2 * R);
            n.sx = cx + x1 * R * scale;
            n.sy = cy + y2 * R * scale;
            n.sz = z2;
            n.scale = scale;
        }
    }

    // === DRAW GLOBE ===
    function drawGlobe(time) {
        globeAngle += CFG.globeRotSpeed;
        transformNodes(time);

        // --- Draw edges (plexus connections) ---
        for (var e = 0; e < edges.length; e++) {
            var edge = edges[e];
            var a = nodes[edge.i];
            var b = nodes[edge.j];

            // Cull back-facing edges
            if (a.sz < -0.15 && b.sz < -0.15) continue;

            // Depth-based alpha
            var depthA = Math.max(0, (a.sz + 0.5) * 1.2);
            var depthB = Math.max(0, (b.sz + 0.5) * 1.2);
            var depthAlpha = Math.min(depthA, depthB);
            if (depthAlpha < 0.02) continue;

            var baseAlpha = (1 - edge.normDist) * 0.2 * depthAlpha;

            // Mouse glow boost
            var mouseBoost = 0;
            if (mouse.active) {
                var midX = (a.sx + b.sx) * 0.5;
                var midY = (a.sy + b.sy) * 0.5;
                var mdx = mouse.x - midX;
                var mdy = mouse.y - midY;
                var mDist = Math.sqrt(mdx * mdx + mdy * mdy);
                if (mDist < CFG.mouseGlowRadius) {
                    mouseBoost = (1 - mDist / CFG.mouseGlowRadius) * 0.6;
                }
            }

            var alpha = Math.min(baseAlpha + mouseBoost, 0.8);
            var color = mouseBoost > 0.1
                ? lerpColor(CFG.purple, CFG.neonPink, mouseBoost)
                : CFG.deepPurple;

            ctx.lineWidth = mouseBoost > 0.1 ? 0.8 + mouseBoost : 0.5;
            ctx.strokeStyle = rgba(color, alpha);
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
        }

        // --- Draw nodes (particles) ---
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (n.sz < -0.25) continue;

            var depth = Math.max(0, Math.min(1, (n.sz + 0.4) * 1.5));
            var pulse = 1 + Math.sin(time * 0.002 + n.phase) * 0.25;
            var size = n.size * n.scale * pulse;

            // Mouse proximity boost
            var mBoost = 0;
            if (mouse.active) {
                var dx = mouse.x - n.sx;
                var dy = mouse.y - n.sy;
                var d = Math.sqrt(dx * dx + dy * dy);
                if (d < CFG.mouseGlowRadius) {
                    mBoost = (1 - d / CFG.mouseGlowRadius);
                }
            }

            // Color: pink near mouse, purple-ish far
            var nodeColor = mBoost > 0.1
                ? lerpColor(CFG.hotPink, CFG.neonPink, mBoost)
                : lerpColor(CFG.deepPurple, CFG.hotPink, depth * 0.6);

            // Glow halo
            var glowSize = size * (2.5 + mBoost * 2);
            var glowAlpha = depth * (0.08 + mBoost * 0.15);
            ctx.beginPath();
            ctx.arc(n.sx, n.sy, glowSize, 0, Math.PI * 2);
            ctx.fillStyle = rgba(CFG.neonPink, glowAlpha);
            ctx.fill();

            // Core dot
            ctx.beginPath();
            ctx.arc(n.sx, n.sy, size, 0, Math.PI * 2);
            ctx.fillStyle = rgba(nodeColor, depth * (0.6 + mBoost * 0.4));
            ctx.fill();

            // Bright center (hot spot)
            if (size > 1 && depth > 0.3) {
                ctx.beginPath();
                ctx.arc(n.sx, n.sy, size * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = rgba(CFG.white, depth * 0.3 * pulse);
                ctx.fill();
            }
        }

        // --- Draw data pulses ---
        drawPulses(time);
    }

    // === DATA PULSES (light traveling along connections) ===
    function drawPulses(time) {
        for (var i = 0; i < pulses.length; i++) {
            var p = pulses[i];
            var edge = edges[p.edge];
            if (!edge) { pulses[i] = createPulse(0); continue; }

            var a = nodes[edge.i];
            var b = nodes[edge.j];

            // Skip back-facing
            if (a.sz < -0.1 && b.sz < -0.1) {
                p.t += p.speed;
                if (p.t > 1) pulses[i] = createPulse(0);
                continue;
            }

            var t = p.reverse ? 1 - p.t : p.t;
            var px = lerp(a.sx, b.sx, t);
            var py = lerp(a.sy, b.sy, t);
            var depth = Math.max(0, lerp(a.sz, b.sz, t) + 0.5);

            if (depth > 0.1) {
                // Bright glow trail
                var trailAlpha = depth * 0.25;
                ctx.beginPath();
                ctx.arc(px, py, p.size * 4, 0, Math.PI * 2);
                ctx.fillStyle = rgba(CFG.neonPink, trailAlpha);
                ctx.fill();

                // Core pulse
                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fillStyle = rgba(CFG.white, depth * 0.9);
                ctx.fill();

                // Inner bright
                ctx.beginPath();
                ctx.arc(px, py, p.size * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = rgba([255, 255, 255], depth * 0.7);
                ctx.fill();
            }

            // Advance
            p.t += p.speed;
            if (p.t > 1) {
                pulses[i] = createPulse(0);
            }
        }
    }

    // === AMBIENT PARTICLES ===
    function drawAmbient(time) {
        for (var i = 0; i < ambient.length; i++) {
            var p = ambient[i];

            // Gentle float
            p.x += p.vx;
            p.y += p.vy;

            // Wrap
            if (p.x < -5) p.x = W + 5;
            if (p.x > W + 5) p.x = -5;
            if (p.y < -5) p.y = H + 5;
            if (p.y > H + 5) p.y = -5;

            var twinkle = 0.7 + Math.sin(time * 0.001 + p.phase) * 0.3;

            // Glow
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            ctx.fillStyle = rgba(CFG.purple, p.alpha * 0.1 * twinkle);
            ctx.fill();

            // Dot
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = rgba(CFG.purple, p.alpha * twinkle);
            ctx.fill();
        }
    }

    // === MAIN LOOP ===
    function animate(time) {
        ctx.clearRect(0, 0, W, H);

        // Draw order: ambient bg -> globe -> (pulses drawn inside globe)
        drawAmbient(time);
        drawGlobe(time);

        animId = requestAnimationFrame(animate);
    }

    // === MOUSE TRACKING ===
    var mouseThrottle = false;
    canvas.addEventListener('mousemove', function (e) {
        if (mouseThrottle) return;
        mouseThrottle = true;
        var rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        mouse.active = true;
        setTimeout(function () { mouseThrottle = false; }, 16);
    });

    canvas.addEventListener('mouseleave', function () {
        mouse.active = false;
        mouse.x = -9999;
        mouse.y = -9999;
    });

    canvas.addEventListener('touchmove', function (e) {
        var rect = canvas.getBoundingClientRect();
        var t = e.touches[0];
        mouse.x = t.clientX - rect.left;
        mouse.y = t.clientY - rect.top;
        mouse.active = true;
    }, { passive: true });

    canvas.addEventListener('touchend', function () {
        mouse.active = false;
        mouse.x = -9999;
        mouse.y = -9999;
    });

    // === INIT ===
    function init() {
        resize();
        initGlobe();
        initPulses();
        initAmbient();
        animId = requestAnimationFrame(animate);
    }

    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            resize();
            initAmbient();
        }, 200);
    });

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            cancelAnimationFrame(animId);
        } else {
            animId = requestAnimationFrame(animate);
        }
    });

    init();
})();
