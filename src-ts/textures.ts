// Procedural textures: every surface in Solmar is painted at runtime on
// offscreen canvases, so the game ships zero image files and loads offline.
// The ground texture doubles as the minimap base image.
import * as THREE from 'three';
import { AVENUES, CAYO_AVENUES, CAYO_STREETS, DISTRICTS, STREETS, WORLD } from './config.js';
import { Rng } from './rng.js';

export interface GroundExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const MAINLAND: GroundExtent = { minX: -900, maxX: 900, minZ: -430, maxZ: 900 };
export const CAYO: GroundExtent = { minX: -260, maxX: 360, minZ: -960, maxZ: -520 };

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function css(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

function speckle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rng: Rng, colors: string[], n: number): void {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rng.next() * colors.length)];
    ctx.globalAlpha = 0.05 + rng.next() * 0.08;
    const s = 1 + rng.next() * 3;
    ctx.fillRect(x + rng.next() * w, y + rng.next() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

// Paints roads, sidewalks and block fills for one ground extent.
export function paintGround(ext: GroundExtent, seed: number): HTMLCanvasElement {
  const W = 2048;
  const H = Math.round(2048 * ((ext.maxZ - ext.minZ) / (ext.maxX - ext.minX)));
  const [c, ctx] = canvas(W, H);
  const rng = new Rng(seed);
  const sx = W / (ext.maxX - ext.minX);
  const sz = H / (ext.maxZ - ext.minZ);
  const X = (x: number) => (x - ext.minX) * sx;
  const Z = (z: number) => (z - ext.minZ) * sz;

  // Base: warm urban ground.
  ctx.fillStyle = '#b7a98f';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, 0, 0, W, H, rng, ['#a89a7e', '#c4b694', '#9d8f74'], 9000);

  // District tints.
  for (const d of DISTRICTS) {
    const x0 = Math.max(d.minX, ext.minX);
    const x1 = Math.min(d.maxX, ext.maxX);
    const z0 = Math.max(d.minZ, ext.minZ);
    const z1 = Math.min(d.maxZ, ext.maxZ);
    if (x1 <= x0 || z1 <= z0) continue;
    ctx.fillStyle = d.id === 'playa' ? '#dcc7a0' : d.id === 'puerto' ? '#a8a49a' : d.id === 'cayo' ? '#c9c2a8' : '#bfae8e';
    ctx.globalAlpha = 0.55;
    ctx.fillRect(X(x0), Z(z0), (x1 - x0) * sx, (z1 - z0) * sz);
    ctx.globalAlpha = 1;
  }

  // Beach sand along the east edge and south edge of the mainland.
  if (ext === MAINLAND) {
    ctx.fillStyle = '#e8d5a8';
    ctx.fillRect(X(848), 0, W - X(848), H);
    ctx.fillRect(0, Z(848), W, H - Z(848));
    speckle(ctx, X(848), 0, W - X(848), H, rng, ['#dcc793', '#f2e2b8'], 1500);
  }

  const avenues = ext === MAINLAND ? AVENUES : CAYO_AVENUES;
  const streets = ext === MAINLAND ? STREETS : CAYO_STREETS;

  // Sidewalks (light border) then asphalt.
  for (const ax of avenues) {
    ctx.fillStyle = '#cfc8b8';
    ctx.fillRect(X(ax - 10.5), 0, 21 * sx, H);
    ctx.fillStyle = '#33363b';
    ctx.fillRect(X(ax - 7), 0, 14 * sx, H);
  }
  for (const sz0 of streets) {
    ctx.fillStyle = '#cfc8b8';
    ctx.fillRect(0, Z(sz0 - 10.5), W, 21 * sz);
    ctx.fillStyle = '#33363b';
    ctx.fillRect(0, Z(sz0 - 7), W, 14 * sz);
  }
  // Asphalt speckle and lane dashes.
  speckle(ctx, 0, 0, W, H, rng, ['#2a2d31', '#3d4046', '#26282c'], 6000);
  ctx.fillStyle = '#e8c33c';
  for (const ax of avenues) {
    for (let z = ext.minZ + 8; z < ext.maxZ - 8; z += 14) {
      ctx.fillRect(X(ax - 0.35), Z(z), 0.7 * sx, 5 * sz);
    }
  }
  for (const sz0 of streets) {
    for (let x = ext.minX + 8; x < ext.maxX - 8; x += 14) {
      ctx.fillRect(X(x), Z(sz0 - 0.35), 5 * sx, 0.7 * sz);
    }
  }
  // Crosswalk stripes at every intersection.
  ctx.fillStyle = 'rgba(235,235,225,0.85)';
  for (const ax of avenues) {
    for (const sz0 of streets) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(X(ax - 6 + i * 1.7), Z(sz0 - 10.5), 0.9 * sx, 3 * sz);
        ctx.fillRect(X(ax - 6 + i * 1.7), Z(sz0 + 7.5), 0.9 * sx, 3 * sz);
      }
    }
  }
  // Central Plaza circle.
  if (ext === MAINLAND) {
    ctx.fillStyle = '#c9b896';
    ctx.beginPath();
    ctx.arc(X(0), Z(0), 42 * sx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a7a5c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(0), Z(0), 30 * sx, 0, Math.PI * 2);
    ctx.stroke();
  }
  return c;
}

export function facadeTexture(base: number, floors: number, litRatio: number, rng: Rng): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = css(base);
  ctx.fillRect(0, 0, 256, 512);
  speckle(ctx, 0, 0, 256, 512, rng, ['#00000022', '#ffffff22'], 400);
  // Art-deco vertical trim.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let x = 16; x < 256; x += 32) ctx.fillRect(x, 0, 3, 512);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, 0, 256, 14);
  ctx.fillRect(0, 498, 256, 14);
  const rows = Math.max(3, floors);
  const cols = 6;
  const cw = 256 / cols;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng.next() < litRatio;
      ctx.fillStyle = lit ? '#ffd98a' : '#2c3542';
      ctx.fillRect(col * cw + 6, r * rh + 10, cw - 12, rh - 20);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(col * cw + 6, r * rh + 10, cw - 12, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function glassTexture(rng: Rng): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 512);
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#7fb2d9');
  grad.addColorStop(0.5, '#4a7ea6');
  grad.addColorStop(1, '#2e5a7d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 16) {
    ctx.fillStyle = rng.next() < 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(10,30,50,0.25)';
    ctx.fillRect(0, y, 256, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function waterTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#1d6f8e';
  ctx.fillRect(0, 0, 256, 256);
  const rng = new Rng(7);
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = rng.next() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(8,40,60,0.16)';
    ctx.lineWidth = 1 + rng.next() * 2;
    ctx.beginPath();
    const y = rng.next() * 256;
    ctx.moveTo(rng.next() * 256, y);
    ctx.bezierCurveTo(60 + rng.next() * 60, y + rng.range(-8, 8), 140 + rng.next() * 60, y + rng.range(-8, 8), 256, y + rng.range(-6, 6));
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function neonTexture(text: string, color: string, sub?: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 160);
  ctx.fillStyle = '#14100c';
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 148);
  ctx.fillStyle = color;
  ctx.font = 'bold 64px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillText(text, 256, sub ? 62 : 80);
  if (sub) {
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.shadowBlur = 10;
    ctx.fillText(sub, 256, 122);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function roofTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#5c564c';
  ctx.fillRect(0, 0, 128, 128);
  const rng = new Rng(3);
  speckle(ctx, 0, 0, 128, 128, rng, ['#4a443c', '#6b6458'], 300);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 120, 120);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
