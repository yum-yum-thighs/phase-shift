export const PARTICLE_COUNT = 128;
export const PARTICLE_RADIUS = 2.4;
const PHASES = ['solid', 'liquid', 'gas'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const block = (x, y, w, h, kind) => ({ x, y, w, h, kind });

/** The particles are the body. Fluid uses local pressure and viscosity constraints,
 * vapor uses buoyancy and turbulence, and ice uses rotating rigid shape matching.
 * No sprite or character rectangle participates in collision detection.
 */
export class MatterSimulation {
  constructor(levels, index = 0) { this.levels = levels; this.load(index); }

  load(index) {
    this.index = index;
    this.level = this.levels[index];
    const initialPhase=this.level.initialPhase||'solid';
    this.player = { phase: initialPhase, facing: 1, grounded: false, shape: 'crystal', dash: 0, vx: 0, vy: 0 };
    this.particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: this.level.start.x + (i % 16 - 7.5) * 5.1 + 16,
      y: this.level.start.y + (Math.floor(i / 16) - 3.5) * 5.1,
      vx: 0, vy: 0, oldX: 0, oldY: 0, contact: false, id: i
    }));
    this.center = { x: 0, y: 0 };
    this.captureShape();
    this.transition = { from: initialPhase, to: initialPhase, progress: 1 };
    this.collected = new Set(); this.won = false; this.elapsed = 0;
    this.shifts = 0; this.events = []; this.cooldown = 0; this.inMold = false;
    this.pressure = 0; this.updateBody();
  }

  captureShape() {
    const c = this.centroid();
    this.rest = this.particles.map(p => ({ x: p.x - c.x, y: p.y - c.y }));
    this.bonds = [];
    for (let i = 0; i < this.rest.length; i++) for (let j = i + 1; j < this.rest.length; j++) {
      if (Math.hypot(this.rest[i].x - this.rest[j].x, this.rest[i].y - this.rest[j].y) < 9) this.bonds.push([i, j]);
    }
    // Detached puddles freeze into separate pieces of ice, never an invisible
    // rigid bridge. Each connected crystal has its own translation and rotation.
    const parents=Array.from({length:PARTICLE_COUNT},(_,i)=>i);
    const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
    for(const [i,j] of this.bonds)parents[root(i)]=root(j);
    const groups=new Map();
    for(let i=0;i<PARTICLE_COUNT;i++){const key=root(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
    this.clusters=[...groups.values()].map(indices=>{
      const center={x:0,y:0};for(const i of indices){center.x+=this.rest[i].x;center.y+=this.rest[i].y;}center.x/=indices.length;center.y/=indices.length;
      return {indices,restCenter:center};
    });
    this.angle = 0;
  }

  centroid() {
    let x = 0, y = 0;
    for (const p of this.particles) { x += p.x; y += p.y; }
    return { x: x / this.particles.length, y: y / this.particles.length };
  }

  geometry(phase = this.player.phase) {
    const blocks = this.level.blocks.filter(b => !(b.kind === 'grate' && phase === 'liquid') && !(b.kind === 'sieve' && phase === 'solid'));
    for (const m of this.level.molds) {
      if(phase!=='solid'){
        blocks.push(block(m.x - 4, m.y, 4, m.h, 'tray'));
        blocks.push(block(m.x + m.w, m.y, 4, m.h, 'tray'));
      }
    }
    if (phase === 'liquid') for (const b of this.level.blocks.filter(b => b.kind === 'grate')) {
      // Droplets find actual spaces between bars, rather than ignoring the grate.
      for (let y = b.y; y < b.y + b.h; y += 20) blocks.push(block(b.x, y, b.w, 5, 'pore'));
    }
    return blocks;
  }

  pointBlocked(p, phase) {
    return this.geometry(phase).some(b => {
      const x = clamp(p.x, b.x, b.x + b.w), y = clamp(p.y, b.y, b.y + b.h);
      return (p.x - x) ** 2 + (p.y - y) ** 2 < PARTICLE_RADIUS ** 2 - .05;
    });
  }

  shift(phase) {
    if (!PHASES.includes(phase) || this.won || this.player.phase === phase) return false;
    if (phase !== 'liquid' && this.particles.some(p => this.pointBlocked(p, phase))) {
      this.events.push({ type: 'blocked', text: 'Some of your matter is inside the filter. Flow clear before changing phase.' });
      return false;
    }
    const from = this.player.phase;
    this.player.phase = phase; this.player.dash = 0;
    this.transition = { from, to: phase, progress: 0 };
    if (phase === 'solid') {
      this.captureShape();
      this.player.shape = this.player.w > this.player.h * 2.5 ? 'sled' : 'crystal';
    }
    this.shifts++;
    this.events.push({ type: 'shift', phase, sled: phase === 'solid' && this.player.shape === 'sled' });
    return true;
  }

  cycle() { return this.shift(PHASES[(PHASES.indexOf(this.player.phase) + 1) % 3]); }

  action() {
    const p = this.player;
    if (this.won || this.cooldown > 0) return;
    if (p.phase === 'solid' && p.grounded) {
      const sled = p.shape === 'sled';
      for (const q of this.particles) {
        if (sled) { q.vx = p.facing * 470; q.vy = 0; }
        else q.vy -= 400;
      }
      p.grounded = false; p.dash = sled ? .6 : 0;
      this.events.push({ type: sled ? 'dash' : 'jump' }); this.cooldown = .5;
    } else if (p.phase === 'liquid') {
      for (const q of this.particles) { q.vy -= 200; q.vx += p.facing * (50 + (q.id % 7) * 10); }
      this.cooldown = .8; this.events.push({ type: 'splash' });
    } else if (p.phase === 'gas') {
      for (const q of this.particles) {
        const dx = q.x - this.center.x, dy = q.y - this.center.y, d = Math.hypot(dx, dy) || 1;
        q.vx += dx / d * 55; q.vy += dy / d * 55 - 80;
      }
      this.cooldown = .8; this.events.push({ type: 'puff' });
    }
  }

  step(dt, input = {}) {
    if (this.won) return;
    let remaining = Math.min(dt, .1);
    while (remaining > 1e-8) {
      const h = Math.min(remaining, 1 / 120);
      this.substep(h, input); remaining -= h;
    }
  }

  substep(dt, input) {
    this.elapsed += dt; this.cooldown = Math.max(0, this.cooldown - dt);
    this.transition.progress = Math.min(1, this.transition.progress + dt / .65);
    const phase = this.player.phase, c = this.centroid();
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) this.player.facing = dir;
    const onIce = this.player.grounded && this.level.ice.some(i => c.x > i.x && c.x < i.x + i.w);
    this.player.dash = Math.max(0, this.player.dash - dt);
    const geometry = this.geometry();
    for (const p of this.particles) {
      p.oldX = p.x; p.oldY = p.y; p.contact = false;
      if (phase === 'gas') {
        const dx = c.x - p.x, dy = c.y - p.y, distance = Math.hypot(dx, dy);
        const confinement = Math.max(0, distance - 55) * 9;
        p.vx += (dir * 520 + Math.sin(this.elapsed * 2.3 + p.id * 1.618) * 92 + dx / (distance || 1) * confinement) * dt;
        p.vy += ((input.down ? 390 : input.up ? -420 : -230) + Math.cos(this.elapsed * 1.6 + p.id * 2.4) * 70 + dy / (distance || 1) * confinement) * dt;
        p.vx *= Math.exp(-2.2 * dt); p.vy *= Math.exp(-1.5 * dt);
      } else {
        p.vy += 920 * dt;
        const drag = phase === 'liquid' ? 2.1 : onIce ? .16 : this.player.grounded ? 5 : .7;
        p.vx += dir * (phase === 'liquid' ? 580 : 900) * dt;
        p.vx *= Math.exp(-drag * dt);
      }
      if(input.grab){
        const anchor=this.particles[input.grab.index];
        if(anchor){const distance=Math.hypot(p.x-anchor.x,p.y-anchor.y),weight=Math.max(0,1-distance/28);p.vx+=((input.grab.x-anchor.x)*180-p.vx*6)*weight*dt;p.vy+=((input.grab.y-anchor.y)*180-p.vy*6)*weight*dt;}
      }
      p.vx = clamp(p.vx, -570, 570); p.vy = clamp(p.vy, -440, 620);
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let iteration = 0; iteration < 5; iteration++) {
      if (phase === 'solid') this.matchShape(.97);
      else this.solveNeighbors(phase, iteration);
      for (const p of this.particles) this.resolveContact(p, geometry);
    }
    let grounded = 0;
    for (const p of this.particles) {
      p.vx = clamp((p.x - p.oldX) / dt, -600, 600);
      p.vy = clamp((p.y - p.oldY) / dt, -500, 660);
      if (p.contact) { grounded++; if (p.vy > 0) p.vy *= .05; if (phase === 'liquid') p.vx *= .993; }
    }
    if (phase === 'solid') this.rigidVelocities();
    else if (phase === 'liquid') this.viscosity();
    this.player.grounded = grounded > 0; this.updateBody();
    this.inMold = phase === 'liquid' && this.level.molds.some(m => this.particles.filter(p => p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y - 3).length > PARTICLE_COUNT * .65);
    for (let i = 0; i < this.level.sparks.length; i++) {
      const s = this.level.sparks[i];
      if (!this.collected.has(i) && this.particles.some(p => Math.hypot(p.x - s.x, p.y - s.y) < 16)) {
        this.collected.add(i); this.events.push({ type: 'collect', x: s.x, y: s.y });
      }
    }
    const e = this.level.exit;
    const arrived = this.particles.filter(p => p.x > e.x - 8 && p.x < e.x + e.w + 36 && p.y > e.y && p.y < e.y + e.h).length;
    if (arrived > PARTICLE_COUNT * .3 && this.center.x > e.x - 100) { this.won = true; this.events.push({ type: 'win' }); }
  }

  makePairs() {
    const cells = new Map(), pairs = [], size = 13;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i], x = Math.floor(p.x / size), y = Math.floor(p.y / size);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const neighbors = cells.get(`${x + dx},${y + dy}`);
        if (neighbors) for (const j of neighbors) pairs.push([i, j]);
      }
      const key = `${x},${y}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(i);
    }
    return pairs;
  }

  solveNeighbors(phase, iteration) {
    const minimum = phase === 'gas' ? 5.1 + 3.4 * this.transition.progress : PARTICLE_RADIUS * 2;
    const pairs = this.makePairs();
    const densities = new Float32Array(PARTICLE_COUNT);
    if (phase === 'liquid') for (const [i,j] of pairs) {
      const a=this.particles[i], b=this.particles[j], d=Math.hypot(a.x-b.x,a.y-b.y);
      if(d<12){const q=1-d/12;densities[i]+=q*q;densities[j]+=q*q;}
    }
    let pressure = 0;
    for (const [i, j] of pairs) {
      const a = this.particles[i], b = this.particles[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      if (distance < .001) { dx = .001; dy = 0; }
      const d = Math.max(distance, .001);
      if (d > 12) continue;
      let correction = 0;
      if (d < minimum) { correction = (minimum - d) * (phase === 'gas' ? .16 : .46); pressure += minimum - d; }
      else if (phase === 'liquid') correction = -(d - minimum) * .0035;
      if(phase==='liquid')correction += (Math.max(0,densities[i]-1.6)+Math.max(0,densities[j]-1.6)) * (1-d/12) * .025;
      const ox = dx / d * correction, oy = dy / d * correction;
      a.x -= ox; a.y -= oy; b.x += ox; b.y += oy;
    }
    if (iteration === 0) this.pressure = pressure / this.particles.length;
  }

  viscosity() {
    for (const [i, j] of this.makePairs()) {
      const a = this.particles[i], b = this.particles[j];
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > 100) continue;
      const dx = (b.vx - a.vx) * .018, dy = (b.vy - a.vy) * .018;
      a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
    }
  }

  matchShape(stiffness) {
    for(const cluster of this.clusters){
      const c={x:0,y:0};for(const i of cluster.indices){c.x+=this.particles[i].x;c.y+=this.particles[i].y;}c.x/=cluster.indices.length;c.y/=cluster.indices.length;
      let dot=0,cross=0;
      for(const i of cluster.indices){const p=this.particles[i],r=this.rest[i],rx=r.x-cluster.restCenter.x,ry=r.y-cluster.restCenter.y;dot+=rx*(p.x-c.x)+ry*(p.y-c.y);cross+=rx*(p.y-c.y)-ry*(p.x-c.x);}
      const angle=Math.atan2(cross,dot),co=Math.cos(angle),si=Math.sin(angle);this.angle=angle;
      for(const i of cluster.indices){const p=this.particles[i],r=this.rest[i],rx=r.x-cluster.restCenter.x,ry=r.y-cluster.restCenter.y;p.x+=(c.x+rx*co-ry*si-p.x)*stiffness;p.y+=(c.y+rx*si+ry*co-p.y)*stiffness;}
    }
  }

  rigidVelocities() {
    for(const cluster of this.clusters){
      const c={x:0,y:0};let vx=0,vy=0,angular=0,inertia=0;
      for(const i of cluster.indices){const p=this.particles[i];c.x+=p.x;c.y+=p.y;vx+=p.vx;vy+=p.vy;}
      const n=cluster.indices.length;c.x/=n;c.y/=n;vx/=n;vy/=n;
      for(const i of cluster.indices){const p=this.particles[i],x=p.x-c.x,y=p.y-c.y;angular+=x*(p.vy-vy)-y*(p.vx-vx);inertia+=x*x+y*y;}
      const omega=clamp(angular/Math.max(inertia,1),-4,4)*.997;
      for(const i of cluster.indices){const p=this.particles[i];p.vx=vx-omega*(p.y-c.y);p.vy=vy+omega*(p.x-c.x);}
    }
  }

  resolveContact(p, geometry) {
    const r = PARTICLE_RADIUS;
    for (const b of geometry) {
      if (p.x + r <= b.x || p.x - r >= b.x + b.w || p.y + r <= b.y || p.y - r >= b.y + b.h) continue;
      const nx = clamp(p.x, b.x, b.x + b.w), ny = clamp(p.y, b.y, b.y + b.h);
      const dx = p.x - nx, dy = p.y - ny, d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d > .00001) {
        p.x += dx / d * (r - d); p.y += dy / d * (r - d);
        if (dy / d < -.35) p.contact = true;
      } else {
        const edges = [p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y], min = Math.min(...edges);
        if (edges[2] === min) { p.y = b.y - r; p.contact = true; }
        else if (edges[3] === min) p.y = b.y + b.h + r;
        else if (edges[0] === min) p.x = b.x - r;
        else p.x = b.x + b.w + r;
      }
    }
  }

  updateBody() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, vx = 0, vy = 0;
    for (const p of this.particles) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); vx += p.vx; vy += p.vy;
    }
    Object.assign(this.player, { x: minX - PARTICLE_RADIUS, y: minY - PARTICLE_RADIUS, w: maxX - minX + PARTICLE_RADIUS * 2, h: maxY - minY + PARTICLE_RADIUS * 2, vx: vx / PARTICLE_COUNT, vy: vy / PARTICLE_COUNT });
    this.center = this.centroid();
  }
}
