import { DISTRICTS } from '../core/city';
import { clamp01, mulberry32 } from '../core/prng';
import type { ActiveIncident, DistrictRuntime, DistrictStatus, IncidentType } from '../core/types';

interface LiveState {
  runState: string;
  simTime: number;
  detected: boolean;
  score: number;
  threshold: number;
  modelPhase: string;
  districts: DistrictRuntime[];
  activeIncidents: ActiveIncident[];
}

interface Building {
  cx: number;
  cy: number;
  hw: number;
  hd: number;
  h: number;
}

interface Pt {
  x: number;
  y: number;
}

interface Link {
  a: number;
  b: number;
}

interface StatusStyle {
  top: string;
  right: string;
  left: string;
  window: string;
  outline: string;
  glow: string;
}

const STATUS_STYLES: Record<DistrictStatus, StatusStyle> = {
  normal: {
    top: '#0d2636',
    right: '#0a1e2c',
    left: '#081722',
    window: '#8fecff',
    outline: '#35e0ff',
    glow: 'rgba(53,224,255,0.35)',
  },
  warning: {
    top: '#33240d',
    right: '#2b1d0a',
    left: '#221708',
    window: '#ffd27f',
    outline: '#ffb020',
    glow: 'rgba(255,176,32,0.42)',
  },
  anomaly: {
    top: '#33101d',
    right: '#2b0d18',
    left: '#220a13',
    window: '#ff8fb0',
    outline: '#ff4d6d',
    glow: 'rgba(255,77,109,0.5)',
  },
};

const INCIDENT_COLORS: Record<IncidentType, string> = {
  power: '#ffb020',
  traffic: '#ff7a45',
  network: '#ff5ea8',
};

const LINK_Z = 2.15;
const LINK_SPEED = 0.12;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function makeBuildings(districtId: number): Building[] {
  const rand = mulberry32(districtId * 131 + 17);
  const count = 6 + Math.floor(rand() * 3);
  const buildings: Building[] = [];
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rand() * 0.55;
    const r = 0.18 + rand() * 0.34;
    const cx = Math.cos(ang) * r;
    const cy = Math.sin(ang) * r * 0.78;
    const hw = 0.15 + rand() * 0.16;
    const hd = 0.12 + rand() * 0.13;
    const h = 0.7 + rand() * 1.5;
    buildings.push({ cx, cy, hw, hd, h });
  }
  return buildings;
}

const LINKS: Link[] = (() => {
  const links: Link[] = [];
  for (const d of DISTRICTS) {
    const right = DISTRICTS.find((x) => x.gridX === d.gridX + 1 && x.gridY === d.gridY);
    if (right) links.push({ a: d.id, b: right.id });
    const bottom = DISTRICTS.find((x) => x.gridX === d.gridX && x.gridY === d.gridY + 1);
    if (bottom) links.push({ a: d.id, b: bottom.id });
  }
  return links;
})();

export class CityRenderer {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private lastDraw = 0;
  private reducedMotion: boolean;
  private buildings: Map<number, Building[]> = new Map();
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private ox = 0;
  private oy = 0;
  private tw = 1;
  private th = 1;
  private vh = 1;
  private particles: { seed: number; x: number; y: number }[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private getState: () => LiveState,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible');
    this.ctx = ctx;
    this.reducedMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    for (const d of DISTRICTS) this.buildings.set(d.id, makeBuildings(d.id));

    const prand = mulberry32(90210);
    for (let i = 0; i < 46; i++) {
      this.particles.push({ seed: prand() * 1000, x: prand() * 2 - 1, y: prand() });
    }

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    if (canvas.parentElement) this.resizeObserver.observe(canvas.parentElement);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
  }

  private resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth || 1;
    const h = parent.clientHeight || 1;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(w * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(h * this.dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.width = w;
    this.height = h;

    const size = Math.min(w, h);
    this.tw = size / 2.6;
    this.th = this.tw * 0.6;
    this.vh = this.tw * 0.5;
    this.ox = w / 2;
    this.oy = h / 2 + this.tw * 0.28;
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.last = now;
    // Respecte "préférence réduire les animations" : redessin ralenti, sans mouvement.
    if (this.reducedMotion && now - this.lastDraw < 120) return;
    this.lastDraw = now;
    this.draw();
  };

  private project(wx: number, wy: number, wz: number): Pt {
    return {
      x: this.ox + (wx - wy) * (this.tw / 2),
      y: this.oy + (wx + wy) * (this.th / 2) - wz * this.vh,
    };
  }

  private poly(pts: Pt[], fill: string) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  }

  private bilinear(a: Pt, b: Pt, c: Pt, d: Pt, u: number, v: number): Pt {
    const x = (1 - u) * ((1 - v) * a.x + v * b.x) + u * ((1 - v) * d.x + v * c.x);
    const y = (1 - u) * ((1 - v) * a.y + v * b.y) + u * ((1 - v) * d.y + v * c.y);
    return { x, y };
  }

  private drawBox(cx: number, cy: number, hw: number, hd: number, h: number, style: StatusStyle, lit: number) {
    const N = this.project(cx, cy - hd, h);
    const E = this.project(cx + hw, cy, h);
    const S = this.project(cx, cy + hd, h);
    const W = this.project(cx - hw, cy, h);
    const E0 = this.project(cx + hw, cy, 0);
    const S0 = this.project(cx, cy + hd, 0);
    const W0 = this.project(cx - hw, cy, 0);

    const c = this.ctx;

    // Halo au sol (lueur) — seulement pour les bâtiments actifs.
    if (lit > 0.05) {
      c.save();
      c.globalAlpha = lit * 0.5;
      c.fillStyle = style.glow;
      c.beginPath();
      c.ellipse(this.project(cx, cy, 0).x, this.project(cx, cy, 0).y, hw * this.tw * 1.6, hd * this.th * 1.6, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    this.poly([S, W, W0, S0], style.left);
    this.poly([S, E, E0, S0], style.right);
    this.poly([N, E, S, W], style.top);

    // Fenêtres éclairées sur la face droite.
    const winAlpha = 0.25 + lit * 0.75;
    c.fillStyle = rgba(style.window, winAlpha);
    for (let u = 0; u < 3; u++) {
      for (let v = 0; v < 2; v++) {
        const p = this.bilinear(S, E, E0, S0, 0.2 + u * 0.3, 0.25 + v * 0.5);
        const s = Math.max(1.2, this.tw * 0.028);
        c.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }

    // Contour lumineux.
    c.save();
    c.strokeStyle = rgba(style.outline, 0.5 + lit * 0.5);
    c.lineWidth = 1;
    c.shadowColor = style.outline;
    c.shadowBlur = lit > 0.1 ? 8 : 0;
    c.beginPath();
    c.moveTo(N.x, N.y);
    c.lineTo(E.x, E.y);
    c.lineTo(S.x, S.y);
    c.lineTo(W.x, W.y);
    c.closePath();
    c.stroke();
    c.restore();
  }

  private draw() {
    const c = this.ctx;
    const state = this.getState();
    // Temps "ambiant" (horloge) pour les animations de fond, et temps simulé
    // pour la pulsation liée aux incidents (statique quand la simulation est à l'arrêt).
    const ambientT = this.reducedMotion ? 0 : performance.now() / 1000;
    const pulseT = this.reducedMotion ? 0 : state.simTime;

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Fond.
    const grad = c.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#05070d');
    grad.addColorStop(0.55, '#081018');
    grad.addColorStop(1, '#0a0e18');
    c.fillStyle = grad;
    c.fillRect(0, 0, this.width, this.height);

    // Lueur centrale.
    const rad = c.createRadialGradient(this.ox, this.oy, 10, this.ox, this.oy, this.tw * 2.4);
    rad.addColorStop(0, 'rgba(53,224,255,0.06)');
    rad.addColorStop(1, 'rgba(53,224,255,0)');
    c.fillStyle = rad;
    c.fillRect(0, 0, this.width, this.height);

    this.drawGrid();
    this.drawLinks(state, pulseT);
    this.drawCity(state, pulseT);
    this.drawPackets(state, ambientT);
    if (!this.reducedMotion) this.drawParticles(state, ambientT);
    this.drawLabels(state, pulseT);
    this.drawVignette();
  }

  private drawGrid() {
    const c = this.ctx;
    c.save();
    c.strokeStyle = 'rgba(53,224,255,0.07)';
    c.lineWidth = 1;
    for (let i = -6; i <= 6; i++) {
      c.beginPath();
      c.moveTo(this.project(i, -6, 0).x, this.project(i, -6, 0).y);
      c.lineTo(this.project(i, 6, 0).x, this.project(i, 6, 0).y);
      c.stroke();
      c.beginPath();
      c.moveTo(this.project(-6, i, 0).x, this.project(-6, i, 0).y);
      c.lineTo(this.project(6, i, 0).x, this.project(6, i, 0).y);
      c.stroke();
    }
    c.restore();
  }

  private districtStyle(d: DistrictRuntime): StatusStyle {
    if (d.incidentType) {
      const col = INCIDENT_COLORS[d.incidentType];
      return {
        top: '#33101d',
        right: '#2b0d18',
        left: '#220a13',
        window: col,
        outline: col,
        glow: rgba(col, 0.5),
      };
    }
    return STATUS_STYLES[d.status];
  }

  private districtCenter(d: DistrictRuntime): Pt {
    return { x: d.gridX - 1, y: d.gridY - 0.5 };
  }

  private drawCity(state: LiveState, t: number) {
    const c = this.ctx;
    // Rassemble et trie tous les bâtiments pour un bon ordre de peinture.
    const all: { d: DistrictRuntime; b: Building; depth: number; lit: number }[] = [];
    for (const d of state.districts) {
      const ctr = this.districtCenter(d);
      const style = this.districtStyle(d);
      const lit = clamp01(0.15 + d.activity * 0.6);
      for (const b of this.buildings.get(d.id) ?? []) {
        all.push({ d, b, depth: ctr.x + ctr.y + b.cx + b.cy, lit: d.incidentType ? pulse(t, d.id) * 0.9 + 0.1 : lit });
      }
      // Halo de quartier (statut).
      if (d.status !== 'normal' || d.incidentType) {
        const glow = d.incidentType ? pulse(t, d.id) : 0.4;
        const p = this.project(ctr.x, ctr.y, 0.05);
        c.save();
        const rg = c.createRadialGradient(p.x, p.y, 4, p.x, p.y, this.tw * 0.85);
        rg.addColorStop(0, style.glow);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = 0.35 + glow * 0.45;
        c.fillStyle = rg;
        c.fillRect(p.x - this.tw, p.y - this.tw, this.tw * 2, this.tw * 2);
        c.restore();
      }
    }
    all.sort((a, b) => a.depth - b.depth);
    for (const { d, b, lit } of all) {
      const ctr = this.districtCenter(d);
      this.drawBox(ctr.x + b.cx, ctr.y + b.cy, b.hw, b.hd, b.h, this.districtStyle(d), lit);
    }
  }

  private drawLinks(state: LiveState, t: number) {
    const c = this.ctx;
    c.save();
    for (const link of LINKS) {
      const a = state.districts[link.a];
      const b = state.districts[link.b];
      const ca = this.districtCenter(a);
      const cb = this.districtCenter(b);
      const pa = this.project(ca.x, ca.y, LINK_Z);
      const pb = this.project(cb.x, cb.y, LINK_Z);

      const worst =
        a.status === 'anomaly' || b.status === 'anomaly'
          ? 'anomaly'
          : a.status === 'warning' || b.status === 'warning'
            ? 'warning'
            : 'normal';
      const color = worst === 'anomaly' ? '#ff4d6d' : worst === 'warning' ? '#ffb020' : '#35e0ff';
      const glow = 0.18 + 0.3 * pulse(t, link.a + link.b);

      c.strokeStyle = rgba(color, 0.28);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(pa.x, pa.y);
      c.lineTo(pb.x, pb.y);
      c.stroke();

      c.save();
      c.strokeStyle = rgba(color, 0.5);
      c.shadowColor = color;
      c.shadowBlur = 8 * glow;
      c.globalAlpha = glow;
      c.beginPath();
      c.moveTo(pa.x, pa.y);
      c.lineTo(pb.x, pb.y);
      c.stroke();
      c.restore();
    }
    c.restore();
  }

  private drawPackets(state: LiveState, t: number) {
    const c = this.ctx;
    c.save();
    for (let k = 0; k < LINKS.length; k++) {
      const link = LINKS[k];
      const a = state.districts[link.a];
      const b = state.districts[link.b];
      const ca = this.districtCenter(a);
      const cb = this.districtCenter(b);
      const pa = this.project(ca.x, ca.y, LINK_Z);
      const pb = this.project(cb.x, cb.y, LINK_Z);
      const worst = a.status === 'anomaly' || b.status === 'anomaly' ? 'anomaly' : 'normal';
      const color = worst === 'anomaly' ? '#ff4d6d' : '#a5f3ff';
      for (let j = 0; j < 2; j++) {
        const p = (t * LINK_SPEED + (k * 0.31 + j * 0.5)) % 1;
        const x = pa.x + (pb.x - pa.x) * p;
        const y = pa.y + (pb.y - pa.y) * p;
        c.fillStyle = color;
        c.shadowColor = color;
        c.shadowBlur = 6;
        c.beginPath();
        c.arc(x, y, 1.6, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  private drawParticles(state: LiveState, t: number) {
    const c = this.ctx;
    c.save();
    const active = state.detected;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const py = (p.seed + t * 0.03) % 1;
      const px = p.x + Math.sin(t * 0.4 + p.seed) * 0.15;
      const world = this.project(px * 2.2, p.y * 1.4, py * 3.2);
      const a = (1 - py) * (active ? 0.5 : 0.22);
      c.fillStyle = active ? 'rgba(255,77,109,1)' : 'rgba(53,224,255,1)';
      c.globalAlpha = a;
      c.fillRect(world.x, world.y, 1.4, 1.4);
    }
    c.restore();
  }

  private drawLabels(state: LiveState, t: number) {
    const c = this.ctx;
    c.save();
    c.textAlign = 'center';
    for (const d of state.districts) {
      const ctr = this.districtCenter(d);
      const p = this.project(ctr.x, ctr.y, 0);
      const style = this.districtStyle(d);
      const glow = d.status !== 'normal' ? 0.6 + pulse(t, d.id) * 0.4 : 0.5;
      c.font = `600 ${Math.max(10, this.tw * 0.085)}px "Segoe UI", system-ui, sans-serif`;
      c.fillStyle = rgba(style.outline, glow);
      c.shadowColor = style.outline;
      c.shadowBlur = d.status !== 'normal' ? 6 : 0;
      c.fillText(d.name.toUpperCase(), p.x, p.y + this.tw * 0.42);
    }
    c.restore();
  }

  private drawVignette() {
    const c = this.ctx;
    const rg = c.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.35,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.75,
    );
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = rg;
    c.fillRect(0, 0, this.width, this.height);
  }
}

function pulse(t: number, seed: number): number {
  return 0.5 + 0.5 * Math.sin(t * 2.2 + seed * 1.7);
}
