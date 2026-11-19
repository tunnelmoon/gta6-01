const MAP_SIZE = 1024;
const WORLD_MIN_X = -900;
const WORLD_MAX_X = 900;
const WORLD_MIN_Z = -980;
const WORLD_MAX_Z = 900;
export class Minimap {
    constructor(canvas, city) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.city = city;
        this.mapCanvas = this.composeMap();
    }
    composeMap() {
        const c = document.createElement('canvas');
        c.width = MAP_SIZE;
        c.height = MAP_SIZE;
        const ctx = c.getContext('2d');
        // Water base.
        ctx.fillStyle = '#1d6f8e';
        ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
        const drawGround = (gc, minX, maxX, minZ, maxZ) => {
            const x = ((minX - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X)) * MAP_SIZE;
            const y = ((minZ - WORLD_MIN_Z) / (WORLD_MAX_Z - WORLD_MIN_Z)) * MAP_SIZE;
            const w = ((maxX - minX) / (WORLD_MAX_X - WORLD_MIN_X)) * MAP_SIZE;
            const h = ((maxZ - minZ) / (WORLD_MAX_Z - WORLD_MIN_Z)) * MAP_SIZE;
            ctx.drawImage(gc, x, y, w, h);
        };
        drawGround(this.city.groundCanvas, -900, 900, -430, 900);
        // Cayo Verde ground: reuse the mainland canvas region is wrong, so draw
        // a simple land block with roads from the city data instead.
        ctx.fillStyle = '#c9c2a8';
        const cx0 = ((-260 - WORLD_MIN_X) / 1800) * MAP_SIZE;
        const cy0 = ((-960 - WORLD_MIN_Z) / 1880) * MAP_SIZE;
        const cw = ((360 + 260) / 1800) * MAP_SIZE;
        const ch = ((-520 + 960) / 1880) * MAP_SIZE;
        ctx.fillRect(cx0, cy0, cw, ch);
        ctx.fillStyle = '#33363b';
        for (const ax of [-160, 0, 160, 320]) {
            const x = ((ax - WORLD_MIN_X) / 1800) * MAP_SIZE;
            ctx.fillRect(x - 3, cy0, 6, ch);
        }
        for (const sz of [-880, -720, -560]) {
            const y = ((sz - WORLD_MIN_Z) / 1880) * MAP_SIZE;
            ctx.fillRect(cx0, y - 3, cw, 6);
        }
        // Bridge deck.
        ctx.fillStyle = '#3a3d42';
        const bx = ((0 - WORLD_MIN_X) / 1800) * MAP_SIZE;
        const by0 = ((-510 - WORLD_MIN_Z) / 1880) * MAP_SIZE;
        const by1 = ((-430 - WORLD_MIN_Z) / 1880) * MAP_SIZE;
        ctx.fillRect(bx - 4, by0, 8, by1 - by0);
        return c;
    }
    toMap(x, z) {
        return {
            x: ((x - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X)) * MAP_SIZE,
            y: ((z - WORLD_MIN_Z) / (WORLD_MAX_Z - WORLD_MIN_Z)) * MAP_SIZE,
        };
    }
    drawFull(canvas, playerPos, waypoint) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(this.mapCanvas, 0, 0, canvas.width, canvas.height);
        const toXY = (x, z) => ({
            x: ((x - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X)) * canvas.width,
            y: ((z - WORLD_MIN_Z) / (WORLD_MAX_Z - WORLD_MIN_Z)) * canvas.height,
        });
        const p = toXY(playerPos.x, playerPos.z);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#10141b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (waypoint) {
            const w = toXY(waypoint.x, waypoint.z);
            ctx.fillStyle = '#ffd23c';
            ctx.beginPath();
            ctx.moveTo(w.x, w.y - 10);
            ctx.lineTo(w.x + 10, w.y);
            ctx.lineTo(w.x, w.y + 10);
            ctx.lineTo(w.x - 10, w.y);
            ctx.closePath();
            ctx.fill();
        }
    }
    draw(playerPos, heading, route, waypoint, enemies, cones, pois, time) {
        const ctx = this.ctx;
        const size = this.canvas.width;
        const half = size / 2;
        ctx.clearRect(0, 0, size, size);
        // Circular clip.
        ctx.save();
        ctx.beginPath();
        ctx.arc(half, half, half - 2, 0, Math.PI * 2);
        ctx.clip();
        const p = this.toMap(playerPos.x, playerPos.z);
        // Zoom: show about 320m across the minimap.
        const zoom = size / (320 * (MAP_SIZE / 1800));
        ctx.translate(half, half);
        ctx.rotate(-heading);
        ctx.scale(zoom, zoom);
        ctx.translate(-p.x, -p.y);
        ctx.drawImage(this.mapCanvas, 0, 0);
        // GPS route.
        if (route && route.length > 1) {
            ctx.strokeStyle = '#ffd23c';
            ctx.lineWidth = 5 / zoom;
            ctx.beginPath();
            const s = this.toMap(playerPos.x, playerPos.z);
            ctx.moveTo(s.x, s.y);
            for (const w of route) {
                const m = this.toMap(w.x, w.z);
                ctx.lineTo(m.x, m.y);
            }
            ctx.stroke();
        }
        // Mission waypoint: pulsing yellow diamond.
        if (waypoint) {
            const w = this.toMap(waypoint.x, waypoint.z);
            const pulse = 6 + Math.sin(time * 4) * 2;
            ctx.fillStyle = '#ffd23c';
            ctx.beginPath();
            ctx.moveTo(w.x, w.y - pulse);
            ctx.lineTo(w.x + pulse, w.y);
            ctx.lineTo(w.x, w.y + pulse);
            ctx.lineTo(w.x - pulse, w.y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,210,60,0.5)';
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.arc(w.x, w.y, waypoint.radius * (MAP_SIZE / 1800), 0, Math.PI * 2);
            ctx.stroke();
        }
        // Police vision cones.
        for (const cone of cones) {
            const c = this.toMap(cone.x, cone.z);
            ctx.fillStyle = 'rgba(255,60,60,0.22)';
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.arc(c.x, c.y, cone.range * (MAP_SIZE / 1800), -cone.heading - 0.55 + Math.PI / 2, -cone.heading + 0.55 + Math.PI / 2);
            ctx.closePath();
            ctx.fill();
        }
        // Enemies.
        for (const e of enemies) {
            if (!e.alive)
                continue;
            const m = this.toMap(e.pos.x, e.pos.z);
            ctx.fillStyle = '#ff3b30';
            ctx.beginPath();
            ctx.arc(m.x, m.y, 5 / zoom, 0, Math.PI * 2);
            ctx.fill();
        }
        // Police units: flashing blue dots.
        const flash = Math.floor(time * 3) % 2 === 0;
        for (const cone of cones) {
            const c = this.toMap(cone.x, cone.z);
            ctx.fillStyle = flash ? '#3b82ff' : '#ff3b30';
            ctx.beginPath();
            ctx.arc(c.x, c.y, 6 / zoom, 0, Math.PI * 2);
            ctx.fill();
        }
        // Shops and POIs.
        for (const poi of pois) {
            const m = this.toMap(poi.x, poi.z);
            ctx.fillStyle = poi.icon === 'shop' ? '#2fd4c4' : poi.icon === 'police' ? '#7ec8ff' : '#ffb347';
            ctx.beginPath();
            ctx.arc(m.x, m.y, 4.5 / zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#10141b';
            ctx.lineWidth = 1.5 / zoom;
            ctx.stroke();
        }
        ctx.restore();
        // Border ring and player arrow (screen space, unrotated).
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(half, half, half - 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#10141b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(half, half - 9);
        ctx.lineTo(half + 6, half + 7);
        ctx.lineTo(half, half + 3);
        ctx.lineTo(half - 6, half + 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}
