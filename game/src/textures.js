// Procedural canvas textures. Every surface in Solmar is painted at
// runtime from an offscreen canvas, so the game ships zero image files
// and loads nothing from the network.
import * as THREE from 'three';
function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx)
        throw new Error('no 2d context');
    return [c, ctx];
}
function speckle(ctx, w, h, rng, n, alpha) {
    for (let i = 0; i < n; i++) {
        const g = Math.floor(rng.range(0, 70));
        ctx.fillStyle = `rgba(${g},${g},${g},${alpha})`;
        ctx.fillRect(rng.range(0, w), rng.range(0, h), rng.range(1, 3), rng.range(1, 3));
    }
}
function toTexture(c, repeatX = 1, repeatY = 1) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
// Asphalt with a dashed center line and edge lines, tiles along the road.
export function asphaltTexture(rng) {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#33363c';
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, rng, 900, 0.12);
    ctx.fillStyle = '#c8b45a';
    ctx.fillRect(124, 0, 8, 90);
    ctx.fillRect(124, 150, 8, 90);
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(6, 0, 4, 256);
    ctx.fillRect(246, 0, 4, 256);
    return toTexture(c, 1, 6);
}
// Sidewalk paving slabs.
export function sidewalkTexture(rng) {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#8a8578';
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, rng, 500, 0.1);
    ctx.strokeStyle = 'rgba(60,58,50,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 64, 0);
        ctx.lineTo(i * 64, 256);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * 64);
        ctx.lineTo(256, i * 64);
        ctx.stroke();
    }
    return toTexture(c, 4, 4);
}
// Pastel art-deco facade: warm plaster, window grid, deco band.
export function facadeTexture(base, trim, rng) {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, rng, 260, 0.06);
    ctx.fillStyle = trim;
    ctx.fillRect(0, 0, 256, 14);
    ctx.fillRect(0, 122, 256, 6);
    ctx.fillRect(0, 242, 256, 14);
    // window grid, 4 cols x 5 rows, lit and dark mixed
    for (let r = 0; r < 5; r++) {
        for (let col = 0; col < 4; col++) {
            const x = 22 + col * 58;
            const y = 28 + r * 42;
            const lit = rng.chance(0.28);
            ctx.fillStyle = lit ? '#ffd98a' : '#1d2733';
            ctx.fillRect(x, y, 34, 26);
            ctx.strokeStyle = trim;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, 34, 26);
            ctx.beginPath();
            ctx.moveTo(x + 17, y);
            ctx.lineTo(x + 17, y + 26);
            ctx.stroke();
        }
    }
    return toTexture(c, 1, 1);
}
// Glass tower: dark glass with lit window stripes.
export function glassTexture(rng) {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#16222e';
    ctx.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 16; r++) {
        for (let col = 0; col < 8; col++) {
            const lit = rng.chance(0.35);
            ctx.fillStyle = lit ? '#ffcf7a' : '#2c4a5e';
            ctx.fillRect(8 + col * 30, 8 + r * 15, 22, 9);
        }
    }
    return toTexture(c, 1, 1);
}
// Neon sign face: dark plate, glowing letters.
export function neonTexture(text, color) {
    const [c, ctx] = canvas(512, 128);
    ctx.fillStyle = '#0c0c12';
    ctx.fillRect(0, 0, 512, 128);
    ctx.font = 'bold 64px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 66);
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 256, 66);
    return toTexture(c, 1, 1);
}
// Ocean water: deep teal with soft wave streaks.
export function waterTexture(rng) {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#1d6f7a';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${rng.range(0.04, 0.12)})`;
        ctx.lineWidth = rng.range(1, 3);
        const y = rng.range(0, 256);
        ctx.beginPath();
        ctx.moveTo(rng.range(0, 120), y);
        ctx.bezierCurveTo(80, y + rng.range(-8, 8), 170, y + rng.range(-8, 8), 256, y);
        ctx.stroke();
    }
    return toTexture(c, 8, 8);
}
// Warm sand with speckle.
export function sandTexture(rng) {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#d9b380';
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, 256, rng, 700, 0.12);
    return toTexture(c, 6, 6);
}
// Sunset sky gradient dome.
export function skyTexture() {
    const [c, ctx] = canvas(64, 512);
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#1c2a55');
    g.addColorStop(0.42, '#5a4a7a');
    g.addColorStop(0.62, '#e8825a');
    g.addColorStop(0.78, '#ffc98a');
    g.addColorStop(1, '#ffe0a8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 512);
    return toTexture(c, 1, 1);
}
// Simple radial glow sprite (sun, muzzle flash, lights).
export function glowTexture() {
    const [c, ctx] = canvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,220,150,0.7)');
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return toTexture(c, 1, 1);
}
