// The minimap and the full city map, drawn from the same generated road and block data as
// the 3D city. Water, sand, roads, pavements, mission gold and police red; the player is an
// arrow at the centre, north up.
import { CITY } from './config.js';
import { clamp } from './math.js';

const WATER_TOP = '#102c3f';
const WATER_BOTTOM = '#1b5a6c';
const LAND = '#8e8377';
const BLOCK = '#5f5666';
const ROAD = '#262636';
const SAND = '#cbb587';

export function createMinimap(canvas, city) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const center = size / 2;
  const radius = center - 3;

  function roundedRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function paint(target, w, h, state, full = false) {
    const c = target;
    c.save();
    c.clearRect(0, 0, w, h);
    const scale = full ? Math.min(w, h) / 580 : w / 158;
    const cx = full ? w / 2 : w / 2;
    const cy = full ? h / 2 : h / 2;
    const ox = full ? 0 : state.x;
    const oz = full ? 0 : state.z;
    if (!full) {
      c.beginPath();
      c.arc(center, center, radius, 0, Math.PI * 2);
      c.clip();
    }
    const gradient = c.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, WATER_TOP);
    gradient.addColorStop(1, WATER_BOTTOM);
    c.fillStyle = gradient;
    c.fillRect(0, 0, w, h);

    const mapX = (x) => cx + (x - ox) * scale;
    const mapY = (z) => cy + (z - oz) * scale;

    // Land.
    c.fillStyle = LAND;
    const landX = mapX(CITY.landMinX);
    const landY = mapY(CITY.landMinZ);
    const landW = (CITY.landMaxX - CITY.landMinX) * scale;
    const landH = (CITY.landMaxZ - CITY.landMinZ) * scale;
    c.fillRect(landX, landY, landW, landH);

    // Beach.
    c.fillStyle = SAND;
    c.fillRect(mapX(CITY.landMaxX), mapY(CITY.landMinZ), (CITY.beachMaxX - CITY.landMaxX) * scale, (CITY.landMaxZ - CITY.landMinZ) * scale);

    // City blocks under the roads.
    c.fillStyle = BLOCK;
    for (const block of city.minimap.blocks) {
      const x = mapX(block.x - block.size / 2);
      const y = mapY(block.z - block.size / 2);
      const s = block.size * scale;
      if (x + s < 0 || y + s < 0 || x > w || y > h) continue;
      roundedRect(c, x, y, s, s, 1.5 * scale);
      c.fill();
    }

    // Roads.
    c.strokeStyle = ROAD;
    c.lineCap = 'butt';
    for (const line of city.minimap.roadLines) {
      c.lineWidth = CITY.roadWidth * scale;
      c.beginPath();
      c.moveTo(mapX(line), mapY(CITY.landMinZ));
      c.lineTo(mapX(line), mapY(CITY.landMaxZ));
      c.stroke();
      c.beginPath();
      c.moveTo(mapX(CITY.landMinX), mapY(line));
      c.lineTo(mapX(CITY.landMaxX), mapY(line));
      c.stroke();
    }
    // Centre lines, faint.
    c.strokeStyle = 'rgba(230, 205, 150, 0.28)';
    c.lineWidth = Math.max(0.6, 0.8 * scale);
    for (const line of city.minimap.roadLines) {
      c.beginPath();
      c.moveTo(mapX(line), mapY(CITY.landMinZ));
      c.lineTo(mapX(line), mapY(CITY.landMaxZ));
      c.stroke();
      c.beginPath();
      c.moveTo(mapX(CITY.landMinX), mapY(line));
      c.lineTo(mapX(CITY.landMaxX), mapY(line));
      c.stroke();
    }

    // Causeway over the water.
    c.strokeStyle = ROAD;
    c.lineWidth = CITY.causewayWidth * scale;
    c.beginPath();
    c.moveTo(mapX(CITY.causewayFromX), mapY(0));
    c.lineTo(mapX(CITY.causewayToX), mapY(0));
    c.stroke();
    c.strokeStyle = 'rgba(246, 233, 212, 0.35)';
    c.lineWidth = Math.max(0.7, 0.6 * scale);
    c.beginPath();
    c.moveTo(mapX(CITY.causewayFromX), mapY(0));
    c.lineTo(mapX(CITY.causewayToX), mapY(0));
    c.stroke();

    // Marina docks.
    c.fillStyle = 'rgba(190, 158, 110, 0.9)';
    for (let i = 0; i < 4; i++) {
      const x = mapX(-64 + i * 38);
      c.fillRect(x - 2.75 * scale, mapY(252), 5.5 * scale, 34 * scale);
    }

    // Icon markers.
    const drawDot = (x, z, color, r, ring = false) => {
      const px = mapX(x);
      const py = mapY(z);
      if (px < -10 || py < -10 || px > w + 10 || py > h + 10) return;
      c.beginPath();
      c.arc(px, py, r, 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
      if (ring) {
        c.strokeStyle = 'rgba(255,255,255,0.45)';
        c.lineWidth = 1;
        c.stroke();
      }
    };

    const traffic = state.traffic ?? [];
    for (const car of traffic) drawDot(car.x, car.z, 'rgba(240,236,225,0.7)', Math.max(1.3, 1.4 * scale), false);
    const peds = state.peds ?? [];
    for (const ped of peds) drawDot(ped.x, ped.z, 'rgba(220,214,200,0.32)', Math.max(0.8, 0.8 * scale), false);
    for (const cop of state.cops ?? []) {
      drawDot(cop.x, cop.z, Math.sin(performance.now() * 0.008) > 0 ? '#ff3d55' : '#4f8cff', Math.max(2.4, 2.6 * scale), true);
    }
    if (state.mission) {
      const mx = mapX(state.mission.x);
      const my = mapY(state.mission.z);
      const pulse = 4.2 + Math.sin(performance.now() * 0.005) * 1.2;
      c.save();
      c.translate(mx, my);
      c.rotate(Math.PI / 4);
      c.fillStyle = '#ffd35a';
      c.shadowColor = 'rgba(255,211,90,0.9)';
      c.shadowBlur = 8;
      c.fillRect(-pulse / 1.4, -pulse / 1.4, pulse * 1.4, pulse * 1.4);
      c.restore();
    }

    // Player arrow.
    const px = mapX(state.x);
    const py = mapY(state.z);
    const fx = Math.sin(state.heading);
    const fz = Math.cos(state.heading);
    const rx = Math.cos(state.heading);
    const rz = -Math.sin(state.heading);
    const a = 9;
    const b = 5.5;
    c.beginPath();
    c.moveTo(px + fx * a, py + fz * a);
    c.lineTo(px - fx * b + rx * b, py - fz * b + rz * b);
    c.lineTo(px - fx * b - rx * b, py - fz * b - rz * b);
    c.closePath();
    c.fillStyle = state.inCar ? '#7de8c8' : '#fff3dd';
    c.shadowColor = '#7de8c8';
    c.shadowBlur = 8;
    c.fill();
    c.shadowBlur = 0;

    if (full) {
      c.strokeStyle = 'rgba(246,233,212,0.25)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(w / 2, h / 2, Math.min(w, h) / 2 - 10, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = 'rgba(246,233,212,0.55)';
      c.font = '600 12px Arial, sans-serif';
      c.textAlign = 'center';
      const labels = [
        ['DOWNTOWN', 0, 0], ['NEON STRIP', -20, -108], ['MARINA', 30, 230],
        ['COSTA DORADA', 230, -60], ['CAUSEWAY', 360, -18], ['VISTA HILLS', -150, -150],
      ];
      for (const [text, x, z] of labels) {
        c.fillText(text, mapX(x), mapY(z) - 8);
      }
    }

    c.restore();
  }

  function draw(state) {
    paint(ctx, size, size, state, false);
  }

  function drawFull(canvas2, state) {
    const fullCtx = canvas2.getContext('2d');
    paint(fullCtx, canvas2.width, canvas2.height, state, true);
  }

  return { draw, drawFull, size, paint };
}
// recorded-session note: minimap projection and colours are unchanged
// strict3 recorded-session note: minimap projection and colours are untouched

