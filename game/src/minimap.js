import { ISLAND_ROADS_X, ISLAND_ROADS_Z, MAIN_ROADS_X, MAIN_ROADS_Z, SHOPS } from './config.js';
export class Minimap {
    city;
    ctx;
    size = 220;
    scale = 0.55; // px per meter
    constructor(canvas, city) {
        this.city = city;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('no minimap context');
        this.ctx = ctx;
        this.size = canvas.width;
    }
    draw(d, time) {
        const ctx = this.ctx;
        const S = this.size;
        const half = S / 2;
        ctx.clearRect(0, 0, S, S);
        // circular clip
        ctx.save();
        ctx.beginPath();
        ctx.arc(half, half, half - 2, 0, Math.PI * 2);
        ctx.clip();
        // background: water
        ctx.fillStyle = '#164e5e';
        ctx.fillRect(0, 0, S, S);
        // rotate so the player heading is up
        ctx.translate(half, half);
        ctx.rotate(-d.heading);
        ctx.translate(-d.playerX * this.scale, -d.playerZ * this.scale);
        // land masses
        ctx.fillStyle = '#2e2a24';
        ctx.fillRect(-860 * this.scale, -430 * this.scale, 1720 * this.scale, 1290 * this.scale);
        ctx.fillRect(-260 * this.scale, -960 * this.scale, 620 * this.scale, 450 * this.scale);
        // roads
        ctx.strokeStyle = '#8a8578';
        ctx.lineWidth = 14 * this.scale;
        ctx.lineCap = 'round';
        const road = (x1, z1, x2, z2) => {
            ctx.beginPath();
            ctx.moveTo(x1 * this.scale, z1 * this.scale);
            ctx.lineTo(x2 * this.scale, z2 * this.scale);
            ctx.stroke();
        };
        for (const x of MAIN_ROADS_X)
            road(x, -420, x, 845);
        for (const z of MAIN_ROADS_Z)
            road(-845, z, 845, z);
        for (const x of ISLAND_ROADS_X)
            road(x, -940, x, -530);
        for (const z of ISLAND_ROADS_Z)
            road(-240, z, 340, z);
        road(0, -430, 0, -510);
        // GPS line to the waypoint
        if (d.waypoint) {
            ctx.strokeStyle = '#ffd23a';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.moveTo(d.playerX * this.scale, d.playerZ * this.scale);
            ctx.lineTo(d.waypoint.x * this.scale, d.waypoint.z * this.scale);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // police vision cones
        for (const c of d.cones) {
            ctx.fillStyle = 'rgba(255,60,60,0.18)';
            ctx.beginPath();
            ctx.moveTo(c.x * this.scale, c.z * this.scale);
            ctx.arc(c.x * this.scale, c.z * this.scale, c.range * this.scale, c.heading - c.angle - Math.PI / 2, c.heading + c.angle - Math.PI / 2);
            ctx.closePath();
            ctx.fill();
        }
        // shops
        for (const s of SHOPS) {
            ctx.fillStyle = s.kind === 'armory' ? '#4da6ff' : s.kind === 'customs' ? '#ffb347' : '#7ae8c8';
            ctx.fillRect(s.x * this.scale - 4, s.z * this.scale - 4, 8, 8);
        }
        // enemies
        ctx.fillStyle = '#ff4d4d';
        for (const e of d.enemies) {
            ctx.beginPath();
            ctx.arc(e.x * this.scale, e.z * this.scale, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        // police (flashing)
        const flash = Math.floor(time * 3) % 2 === 0;
        ctx.fillStyle = flash ? '#4da6ff' : '#ff4d4d';
        for (const p of d.police) {
            ctx.beginPath();
            ctx.arc(p.x * this.scale, p.z * this.scale, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        // waypoint marker
        if (d.waypoint) {
            const wx = d.waypoint.x * this.scale;
            const wz = d.waypoint.z * this.scale;
            ctx.fillStyle = '#ffd23a';
            ctx.save();
            ctx.translate(wx, wz);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-6, -6, 12, 12);
            ctx.restore();
        }
        ctx.restore();
        // border ring + player arrow (unrotated, center)
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(half, half, half - 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(half, half - 9);
        ctx.lineTo(half - 6, half + 7);
        ctx.lineTo(half + 6, half + 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#111111';
        ctx.beginPath();
        ctx.moveTo(half, half - 4);
        ctx.lineTo(half - 3, half + 4);
        ctx.lineTo(half + 3, half + 4);
        ctx.closePath();
        ctx.fill();
    }
}
