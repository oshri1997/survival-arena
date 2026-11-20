import type { Fighter, Team } from './contracts';
import { FIELD, clamp, confine, territoryRange } from './territory';

interface Route {
  x: number;
  y: number;
  time: number;
  speed: number;
  team: Team;
}

/** Steering stays server-owned. Routes are private; only position and velocity are broadcast. */
export class Patrol {
  private routes = new Map<string, Route>();
  constructor(private random: () => number) {}

  reset(id?: string) {
    if (id) this.routes.delete(id);
    else this.routes.clear();
  }

  private destination(f: Fighter, territory: number, round: number, speed: number): Route {
    let y = clamp(f.y + (this.random() - 0.5) * 300, FIELD.top, FIELD.bottom);
    const range = territoryRange(f.team, y, territory, round);
    const x = range.min + this.random() * (range.max - range.min);
    if (Math.hypot(x - f.x, y - f.y) < 25)
      y = clamp(f.y + (f.y > 390 ? -110 : 110), FIELD.top, FIELD.bottom);
    return {
      ...confine({ x, y }, f.team, territory, round),
      time: 4 + this.random() * 4,
      speed,
      team: f.team,
    };
  }

  constrain(fighters: Fighter[], territory: number, round: number) {
    for (const f of fighters) {
      const point = confine(f, f.team, territory, round);
      if (point.x !== f.x) f.vx = 0;
      if (point.y !== f.y) f.vy = 0;
      Object.assign(f, point);
    }
  }

  update(fighters: Fighter[], dt: number, territory: number, round: number) {
    this.constrain(fighters, territory, round);
    const living = fighters.filter((f) => f.hp > 0);
    const ids = new Set(living.map((f) => f.id));
    for (const id of this.routes.keys()) if (!ids.has(id)) this.routes.delete(id);
    // Read a single position snapshot so avoidance is independent of roster iteration order.
    const positions = living.map((f) => ({ id: f.id, x: f.x, y: f.y }));
    for (const f of living) {
      let route = this.routes.get(f.id);
      if (!route || route.team !== f.team) {
        route = this.destination(f, territory, round, 28 + this.random() * 14);
        f.vx = f.vy = 0;
      }
      route.time -= dt;
      if (route.time <= 0 || Math.hypot(route.x - f.x, route.y - f.y) < 16)
        route = this.destination(f, territory, round, route.speed);
      Object.assign(route, confine(route, f.team, territory, round));
      this.routes.set(f.id, route);
      const dx = route.x - f.x,
        dy = route.y - f.y,
        distance = Math.hypot(dx, dy);
      const speed = route.speed * Math.min(1, distance / 30);
      let desiredX = (dx / Math.max(1, distance)) * speed;
      let desiredY = (dy / Math.max(1, distance)) * speed;
      for (const other of positions) {
        if (other.id === f.id) continue;
        let sx = f.x - other.x,
          sy = f.y - other.y,
          separation = Math.hypot(sx, sy);
        if (separation >= 58) continue;
        if (separation < 0.01) {
          const pair = [f.id, other.id].sort().join(':');
          let hash = 0;
          for (const char of pair) hash = (hash * 31 + char.charCodeAt(0)) | 0;
          const angle = hash * 2.39996,
            sign = f.id < other.id ? 1 : -1;
          sx = Math.cos(angle) * sign;
          sy = Math.sin(angle) * sign;
          separation = 1;
        }
        const pressure = Math.pow(1 - separation / 58, 2) * 90;
        desiredX += (sx / separation) * pressure;
        desiredY += (sy / separation) * pressure;
      }
      const magnitude = Math.hypot(desiredX, desiredY),
        limit = route.speed * 1.2;
      if (magnitude > limit) {
        desiredX *= limit / magnitude;
        desiredY *= limit / magnitude;
      }
      // Limit acceleration rather than snapping to a new direction at each waypoint.
      const changeX = desiredX - (f.vx ?? 0),
        changeY = desiredY - (f.vy ?? 0);
      const blend = Math.min(
        1 - Math.exp(-dt * 4),
        (100 * dt) / Math.max(0.001, Math.hypot(changeX, changeY)),
      );
      f.vx = (f.vx ?? 0) + changeX * blend;
      f.vy = (f.vy ?? 0) + changeY * blend;
      const point = confine({ x: f.x + f.vx * dt, y: f.y + f.vy * dt }, f.team, territory, round);
      if (Math.abs(point.x - (f.x + f.vx * dt)) > 0.001) f.vx = 0;
      if (Math.abs(point.y - (f.y + f.vy * dt)) > 0.001) f.vy = 0;
      Object.assign(f, point);
    }
  }
}
