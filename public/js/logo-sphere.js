// ==================== 3D GEODESIC SPHERE ANIMATION ====================
// Renders a rotating wireframe sphere around the "N" logo on the login page

(function() {
    var canvas = document.getElementById('logoCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H / 2;
    var R = 155;

    // Generate sphere points using fibonacci sphere
    var points3D = [];
    var total = 120;
    var golden = (1 + Math.sqrt(5)) / 2;
    for (var i = 0; i < total; i++) {
        var theta = Math.acos(1 - 2 * (i + 0.5) / total);
        var phi = 2 * Math.PI * i / golden;
        points3D.push({ x: R * Math.sin(theta) * Math.cos(phi), y: R * Math.sin(theta) * Math.sin(phi), z: R * Math.cos(theta) });
    }

    // Build edges: connect nearby points
    var edges = [];
    var maxDist = R * 0.72;
    for (var i = 0; i < total; i++) {
        for (var j = i + 1; j < total; j++) {
            var dx = points3D[i].x - points3D[j].x;
            var dy = points3D[i].y - points3D[j].y;
            var dz = points3D[i].z - points3D[j].z;
            if (Math.sqrt(dx*dx + dy*dy + dz*dz) < maxDist) edges.push([i, j]);
        }
    }

    // Rotation helpers
    function rotateY(p, a) { var c=Math.cos(a),s=Math.sin(a); return {x:p.x*c+p.z*s, y:p.y, z:-p.x*s+p.z*c}; }
    function rotateX(p, a) { var c=Math.cos(a),s=Math.sin(a); return {x:p.x, y:p.y*c-p.z*s, z:p.y*s+p.z*c}; }

    // Floating particles on sphere surface
    var particles = [];
    for (var i = 0; i < 8; i++) {
        particles.push({ lat: Math.random()*Math.PI, lon: Math.random()*Math.PI*2, spdLat: 0.003+Math.random()*0.005, spdLon: 0.01+Math.random()*0.015 });
    }

    function draw(t) {
        ctx.clearRect(0, 0, W, H);
        var aY = t * 0.0004;
        var aX = 0.3 + Math.sin(t * 0.0002) * 0.15;

        // Project points
        var projected = [];
        for (var i = 0; i < points3D.length; i++) {
            var p = points3D[i];
            var r1 = rotateY(p, aY);
            var r2 = rotateX(r1, aX);
            var depth = (r2.z + R) / (2 * R);
            projected.push({ x: cx + r2.x, y: cy + r2.y, z: r2.z, depth: depth });
        }

        // Draw back edges (very faint)
        for (var e = 0; e < edges.length; e++) {
            var idx = edges[e];
            var a = projected[idx[0]], b = projected[idx[1]];
            var avgDepth = (a.depth + b.depth) / 2;
            if (avgDepth < 0.45) {
                ctx.beginPath();
                ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = 'rgba(123, 47, 190, ' + (avgDepth * 0.15) + ')';
                ctx.lineWidth = 0.4;
                ctx.stroke();
            }
        }

        // Draw front edges
        for (var e = 0; e < edges.length; e++) {
            var idx = edges[e];
            var a = projected[idx[0]], b = projected[idx[1]];
            var avgDepth = (a.depth + b.depth) / 2;
            if (avgDepth >= 0.45) {
                var alpha = 0.1 + avgDepth * 0.45;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = 'rgba(255, 45, 120, ' + alpha + ')';
                ctx.lineWidth = 0.5 + avgDepth * 0.6;
                ctx.stroke();
            }
        }

        // Draw nodes
        for (var i = 0; i < projected.length; i++) {
            var p = projected[i];
            var alpha = 0.15 + p.depth * 0.85;
            var sz = 1 + p.depth * 2;
            // Glow for front-facing nodes
            if (p.depth > 0.5) {
                var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 4);
                g.addColorStop(0, 'rgba(255, 45, 120, ' + (alpha * 0.5) + ')');
                g.addColorStop(1, 'rgba(255, 45, 120, 0)');
                ctx.beginPath(); ctx.arc(p.x, p.y, sz * 4, 0, Math.PI * 2);
                ctx.fillStyle = g; ctx.fill();
            }
            ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 80, 160, ' + alpha + ')';
            ctx.fill();
        }

        // Floating bright particles
        for (var i = 0; i < particles.length; i++) {
            var fp = particles[i];
            fp.lat += fp.spdLat; fp.lon += fp.spdLon;
            var pr = R * 1.02;
            var raw = { x: pr*Math.sin(fp.lat)*Math.cos(fp.lon), y: pr*Math.sin(fp.lat)*Math.sin(fp.lon), z: pr*Math.cos(fp.lat) };
            var r1 = rotateY(raw, aY);
            var r2 = rotateX(r1, aX);
            var depth = (r2.z + R) / (2*R);
            if (depth > 0.4) {
                var sx = cx + r2.x, sy = cy + r2.y;
                var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 6);
                g.addColorStop(0, 'rgba(255, 180, 230, ' + (depth * 0.9) + ')');
                g.addColorStop(0.5, 'rgba(255, 45, 120, ' + (depth * 0.4) + ')');
                g.addColorStop(1, 'rgba(255, 45, 120, 0)');
                ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2);
                ctx.fillStyle = g; ctx.fill();
            }
        }

        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
})();
