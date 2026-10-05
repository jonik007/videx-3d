import { sampleGrid, type EsriAsciiGrid } from '../parsers/esri-ascii';
import { cellCorner, propertyStats, type EclipseGrid } from '../parsers/grdecl';
import type { PropertyCube } from '../types';
import { rampColor } from './geometry';

export type Station = {
  s: number;
  longitude: number;
  latitude: number;
};

export type SectionAnchor = {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  rotaryElevation: number;
  x: number;
  z: number;
};

export type WellMark = {
  id: string;
  name: string;
  s: number;
  rotaryElevation: number;
};

export type CubeBand = {
  s0: number;
  s1: number;
  top: number;
  bottom: number;
  color: [number, number, number];
};

const SINGLE_WELL_WIDTH = 600;

export function sectionStep(length: number) {
  if (!(length > 0)) return 40;
  return Math.min(100, Math.max(25, length / 80));
}

export function buildStations(
  anchors: SectionAnchor[],
  step: number,
  unproject: (x: number, z: number) => { longitude: number; latitude: number },
) {
  const wells: WellMark[] = [];
  if (!anchors.length) return { stations: [] as Station[], wells };
  if (anchors.length === 1) {
    const only = anchors[0];
    return {
      stations: [
        { s: 0, longitude: only.longitude, latitude: only.latitude },
        {
          s: SINGLE_WELL_WIDTH,
          longitude: only.longitude,
          latitude: only.latitude,
        },
      ],
      wells: [
        {
          id: only.id,
          name: only.name,
          s: SINGLE_WELL_WIDTH / 2,
          rotaryElevation: only.rotaryElevation,
        },
      ],
    };
  }

  const stations: Station[] = [];
  let distance = 0;
  for (let index = 0; index < anchors.length - 1; index++) {
    const start = anchors[index];
    const end = anchors[index + 1];
    if (index === 0) {
      stations.push({
        s: 0,
        longitude: start.longitude,
        latitude: start.latitude,
      });
      wells.push({
        id: start.id,
        name: start.name,
        s: 0,
        rotaryElevation: start.rotaryElevation,
      });
    }
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    const pieces = Math.max(1, Math.round(length / Math.max(step, 1)));
    for (let piece = 1; piece <= pieces; piece++) {
      const t = piece / pieces;
      const projected =
        piece === pieces
          ? { longitude: end.longitude, latitude: end.latitude }
          : unproject(start.x + dx * t, start.z + dz * t);
      stations.push({
        s: distance + length * t,
        longitude: projected.longitude,
        latitude: projected.latitude,
      });
    }
    distance += length;
    wells.push({
      id: end.id,
      name: end.name,
      s: distance,
      rotaryElevation: end.rotaryElevation,
    });
  }
  return { stations, wells };
}

function pointInPolygon(x: number, y: number, polygon: [number, number][]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    const crosses = (yi > y) !== (yj > y);
    if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function findCell(grid: EclipseGrid, x: number, y: number, k: number) {
  for (let j = 0; j < grid.ny; j++) {
    for (let i = 0; i < grid.nx; i++) {
      const polygon = [0, 1, 3, 2].map(corner => {
        const point = cellCorner(grid, i, j, k, corner);
        return [point.x, point.y] as [number, number];
      });
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [px, py] of polygon) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (pointInPolygon(x, y, polygon)) return { i, j };
    }
  }
  return null;
}

function layerElevations(
  grid: EclipseGrid,
  i: number,
  j: number,
  k: number,
  depthPositiveDown: boolean,
) {
  let topZ = 0;
  let bottomZ = 0;
  for (let corner = 0; corner < 4; corner++) {
    topZ += cellCorner(grid, i, j, k, corner).z;
    bottomZ += cellCorner(grid, i, j, k, corner + 4).z;
  }
  const toElevation = (z: number) => (depthPositiveDown ? -z : z);
  const top = toElevation(topZ / 4);
  const bottom = toElevation(bottomZ / 4);
  return { top: Math.max(top, bottom), bottom: Math.min(top, bottom) };
}

export function cubeBands(
  stations: Station[],
  cube: PropertyCube,
  plan: (longitude: number, latitude: number) => [number, number],
) {
  const values = cube.grid.properties[cube.property];
  if (!values || stations.length < 2) return [] as CubeBand[];
  const stats = propertyStats(cube.grid, cube.property);
  const span = stats.max - stats.min || 1;
  const bands: CubeBand[] = [];
  const { nx, ny } = cube.grid;

  for (let index = 0; index < stations.length; index++) {
    const station = stations[index];
    const [x, y] = plan(station.longitude, station.latitude);
    const s0 =
      index === 0 ? station.s : (stations[index - 1].s + station.s) / 2;
    const s1 =
      index === stations.length - 1
        ? station.s
        : (station.s + stations[index + 1].s) / 2;
    if (!(s1 - s0 > 0.05)) continue;

    for (let k = 0; k < cube.grid.nz; k++) {
      if (k >= cube.kCut) continue;
      const hit = findCell(cube.grid, x, y, k);
      if (!hit || hit.i >= cube.iCut || hit.j >= cube.jCut) continue;
      const cell = hit.i + nx * (hit.j + ny * k);
      if (cube.grid.actnum[cell] === 0) continue;
      const value = values[cell];
      if (!Number.isFinite(value) || Math.abs(value) >= 1e20) continue;
      const { top, bottom } = layerElevations(
        cube.grid,
        hit.i,
        hit.j,
        k,
        cube.depthPositiveDown,
      );
      bands.push({
        s0,
        s1,
        top,
        bottom,
        color: rampColor((value - stats.min) / span),
      });
    }
  }
  return bands;
}

export function surfaceTraces(
  stations: Station[],
  grid: EsriAsciiGrid,
  depthPositiveDown: boolean,
) {
  const lines: { s: number; elevation: number }[][] = [];
  let current: { s: number; elevation: number }[] = [];
  const flush = () => {
    if (current.length > 1) lines.push(current);
    current = [];
  };
  for (const station of stations) {
    const raw = sampleGrid(grid, station.longitude, station.latitude);
    if (raw === null) {
      flush();
      continue;
    }
    current.push({
      s: station.s,
      elevation: depthPositiveDown ? -raw : raw,
    });
  }
  flush();
  return lines;
}
