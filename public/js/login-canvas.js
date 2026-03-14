// ==================== NEXUS LOGIN - FULL-SCREEN PLEXUS NETWORK ====================
// Particles fill the screen; mouse proximity creates dense connected network
// Optimized: spatial grid for O(n*k) neighbor lookups, visibility API pause

(function () {
    'use strict';

    const canvas = document.getElementById('nexusCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // === CONFIG ===
    const CFG = {
        particleCount: 350,
        baseConnDist: 90,       // Always-visible connections
        mouseConnDist: 150,     // Dense connections near mouse
        mouseRadius: 300,       // Mouse influence area
        speed: 0.25,
        // Colors
        neonPink: [255, 45, 120],
        hotPink: [233, 30, 99],
        purple: [123, 47, 190],
        deepPurple: [58, 20, 120],
        white: [255, 220, 255]
    };

    // === STATE ===
    let W = 0, H = 0;
    let mouse = { x: -9999, y: -9999, active: false };
    let particles = [];
    let animId = null;

    // Spatial grid for fast neighbor lookup
    let gridCellSize = CFG.mouseConnDist;
    let gridCols = 0, gridRows = 0;
    let grid = [];

    // === HELPERS ===
    function rgba(c, a) {
        return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    }

    // === RESIZE ===
    function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = canvas.clientWidth;
        H = canvas.clientHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // === INIT PARTICLES ===
    function initParticles() {
        particles = [];
        for (var i = 0; i < CFG.particleCount; i++) {
            particles.push({
                x: Math.random() * W,
                y: Math.random() * H,
                vx: (Math.random() - 0.5) * CFG.speed * 2,
                vy: (Math.random() - 0.5) * CFG.speed * 2,
                size: 1 + Math.random() * 2,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    // === SPATIAL GRID ===
    function buildGrid() {
        gridCols = Math.ceil(W / gridCellSize) + 1;
        gridRows = Math.ceil(H / gridCellSize) + 1;
        var total = gridCols * gridRows;

        // Reuse/clear grid arrays
        if (grid.length !== total) {
            grid = new Array(total);
            for (var i = 0; i < total; i++) grid[i] = [];
        } else {
            for (var i = 0; i < total; i++) grid[i].length = 0;
        }

        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            var col = Math.floor(p.x / gridCellSize);
            var row = Math.floor(p.y / gridCellSize);
            if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
                grid[row * gridCols + col].push(i);
            }
        }
    }

    // === MAIN LOOP ===
    function animate(time) {
        ctx.clearRect(0, 0, W, H);

        // Move particles (bounce off edges)
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
            if (p.x > W) { p.x = W; p.vx = -Math.abs(p.vx); }
            if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); }
            if (p.y > H) { p.y = H; p.vy = -Math.abs(p.vy); }
        }

        // Build spatial grid
        buildGrid();

        var baseDist2 = CFG.baseConnDist * CFG.baseConnDist;
        var mouseDist2 = CFG.mouseConnDist * CFG.mouseConnDist;
        var mouseR = CFG.mouseRadius;
        var mouseR2 = mouseR * mouseR;

        // Pre-compute mouse distance for all particles
        var mouseDists = new Float32Array(particles.length);
        var mouseInfluences = new Float32Array(particles.length);
        for (var i = 0; i < particles.length; i++) {
            if (mouse.active) {
                var dx = particles[i].x - mouse.x;
                var dy = particles[i].y - mouse.y;
                var d2 = dx * dx + dy * dy;
                mouseDists[i] = d2;
                mouseInfluences[i] = d2 < mouseR2 ? 1 - Math.sqrt(d2) / mouseR : 0;
            } else {
                mouseDists[i] = 999999;
                mouseInfluences[i] = 0;
            }
        }

        // --- Draw connections using spatial grid ---
        ctx.lineCap = 'round';

        for (var i = 0; i < particles.length; i++) {
            var a = particles[i];
            var col = Math.floor(a.x / gridCellSize);
            var row = Math.floor(a.y / gridCellSize);
            var mInflA = mouseInfluences[i];

            // Check 3x3 grid neighborhood
            for (var dr = -1; dr <= 1; dr++) {
                var nr = row + dr;
                if (nr < 0 || nr >= gridRows) continue;
                for (var dc = -1; dc <= 1; dc++) {
                    var nc = col + dc;
                    if (nc < 0 || nc >= gridCols) continue;

                    var cell = grid[nr * gridCols + nc];
                    for (var k = 0; k < cell.length; k++) {
                        var j = cell[k];
                        if (j <= i) continue; // avoid drawing twice

                        var b = particles[j];
                        var dx = a.x - b.x;
                        var dy = a.y - b.y;
                        var d2 = dx * dx + dy * dy;

                        // Check connection thresholds
                        var isBase = d2 < baseDist2;
                        var isMouse = false;
                        var mouseInfl = 0;

                        if (mInflA > 0 && d2 < mouseDist2) {
                            var mInflB = mouseInfluences[j];
                            if (mInflB > 0) {
                                isMouse = true;
                                mouseInfl = Math.min(mInflA, mInflB);
                            }
                        }

                        if (!isBase && !isMouse) continue;

                        var dist = Math.sqrt(d2);
                        var alpha = 0;

                        if (isMouse) {
                            alpha = (1 - dist / CFG.mouseConnDist) * mouseInfl * 0.75;
                        }
                        if (isBase) {
                            alpha = Math.max(alpha, (1 - dist / CFG.baseConnDist) * 0.15);
                        }
                        if (alpha < 0.01) continue;

                        ctx.lineWidth = isMouse ? 0.6 + mouseInfl * 0.8 : 0.5;
                        ctx.strokeStyle = isMouse && mouseInfl > 0.2
                            ? rgba(CFG.neonPink, alpha)
                            : rgba(CFG.purple, alpha);
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }
        }

        // --- Draw particles ---
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            var pulse = 0.8 + Math.sin(time * 0.002 + p.phase) * 0.2;
            var mBoost = mouseInfluences[i];

            var size = p.size * pulse * (1 + mBoost * 1.8);
            var alpha = (0.35 + mBoost * 0.65) * pulse;

            // Outer glow halo (mouse proximity)
            if (mBoost > 0.15) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, size * 4, 0, Math.PI * 2);
                ctx.fillStyle = rgba(CFG.neonPink, mBoost * 0.1);
                ctx.fill();
            }

            // Core dot
            var dotColor;
            if (mBoost > 0.4) dotColor = CFG.neonPink;
            else if (mBoost > 0.15) dotColor = CFG.hotPink;
            else dotColor = CFG.purple;

            ctx.beginPath();
            ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            ctx.fillStyle = rgba(dotColor, alpha);
            ctx.fill();

            // Bright hot center for close particles
            if (mBoost > 0.5) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, size * 0.35, 0, Math.PI * 2);
                ctx.fillStyle = rgba(CFG.white, mBoost * 0.6);
                ctx.fill();
            }
        }

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
        initParticles();
        animId = requestAnimationFrame(animate);
    }

    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            resize();
            initParticles();
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
