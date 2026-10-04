import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Path,
  Shape,
  ShapeGeometry,
} from 'three';
import {
  cellCenter,
  displayStride,
  gridValueStats,
  isNodata,
  valueAt,
  type EsriAsciiGrid,
} from '../parsers/esri-ascii';
import type { LicensePolygon, LonLat, SurfaceLayer } from '../types';

export type WorldPoint = [number, number, number];
export type PlanPoint = [number, number];

const RAMP: [number, number, number][] = [
  [0.13, 0.28, 0.72],
  [0.18, 0.62, 0.72],
  [0.45, 0.72, 0.38],
  [0.93, 0.78, 0.27],
  [0.78, 0.28, 0.22],
];

export function rampColor(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (RAMP.length - 1);
  const index = Math.min(RAMP.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  const start = RAMP[index];
  const end = RAMP[index + 1];
  return [
    start[0] + (end[0] - start[0]) * fraction,
    start[1] + (end[1] - start[1]) * fraction,
    start[2] + (end[2] - start[2]) * fraction,
  ];
}

export function buildSurfaceGeometry(
  grid: EsriAsciiGrid,
  toWorld: (lon: number, lat: number, elevation: number) => WorldPoint,
  depthPositiveDown: boolean,
) {
  const stride = displayStride(grid.ncols, grid.nrows);
  const cols: number[] = [];
  const rows: number[] = [];
  for (let col = 0; col < grid.ncols; col += stride) cols.push(col);
  if (cols[cols.length - 1] !== grid.ncols - 1) cols.push(grid.ncols - 1);
  for (let row = 0; row < grid.nrows; row += stride) rows.push(row);
  if (rows[rows.length - 1] !== grid.nrows - 1) rows.push(grid.nrows - 1);

  const stats = gridValueStats(grid, depthPositiveDown);
  const span = stats.max - stats.min || 1;
  const lookup = new Int32Array(cols.length * rows.length).fill(-1);
  const positions: number[] = [];
  const colors: number[] = [];

  const elevationAt = (col: number, rowFromSouth: number) => {
    const raw = valueAt(grid, col, rowFromSouth);
    if (isNodata(raw, grid.nodata)) return null;
    return depthPositiveDown ? -raw : raw;
  };

  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < cols.length; col++) {
      const elevation = elevationAt(cols[col], rows[row]);
      if (elevation === null) continue;
      const [lon, lat] = cellCenter(grid, cols[col], rows[row]);
      const [x, y, z] = toWorld(lon, lat, elevation);
      lookup[row * cols.length + col] = positions.length / 3;
      positions.push(x, y, z);
      const [red, green, blue] = rampColor((elevation - stats.min) / span);
      colors.push(red, green, blue);
    }
  }

  if (!positions.length) return null;

  const indices: number[] = [];
  for (let row = 0; row < rows.length - 1; row++) {
    for (let col = 0; col < cols.length - 1; col++) {
      const v00 = lookup[row * cols.length + col];
      const v10 = lookup[row * cols.length + col + 1];
      const v01 = lookup[(row + 1) * cols.length + col];
      const v11 = lookup[(row + 1) * cols.length + col + 1];
      if (v00 < 0 || v10 < 0 || v01 < 0 || v11 < 0) continue;
      indices.push(v00, v10, v11, v00, v11, v01);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  if (indices.length) {
    geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  }
  geometry.computeVertexNormals();
  geometry.userData = { stride };
  return geometry;
}

function signedArea(points: PlanPoint[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function withWinding(points: PlanPoint[], counterclockwise: boolean) {
  const isCounterclockwise = signedArea(points) > 0;
  if (isCounterclockwise === counterclockwise) return points;
  return [...points].reverse();
}

/**
 * Plan coordinates are easting and northing. `ShapeGeometry` lives in XY,
 * and a -90° rotation around X maps northing onto scene -Z, which is north
 * in the videx-3d CRS (`z = originNorthing - northing`).
 */
export function buildLicenseFill(
  polygon: LicensePolygon,
  toPlan: (lon: number, lat: number) => PlanPoint,
  y: number,
) {
  const outer = withWinding(
    polygon.outer.map(([lon, lat]) => toPlan(lon, lat)),
    true,
  );
  if (outer.length < 3 || Math.abs(signedArea(outer)) < 1e-2) return null;

  const shape = new Shape();
  outer.forEach(([x, north], index) => {
    if (index === 0) shape.moveTo(x, north);
    else shape.lineTo(x, north);
  });
  shape.closePath();

  for (const hole of polygon.holes) {
    const points = withWinding(
      hole.map(([lon, lat]) => toPlan(lon, lat)),
      false,
    );
    if (points.length < 3) continue;
    const path = new Path();
    points.forEach(([x, north], index) => {
      if (index === 0) path.moveTo(x, north);
      else path.lineTo(x, north);
    });
    path.closePath();
    shape.holes.push(path);
  }

  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

export function buildLicenseWalls(
  rings: LonLat[][],
  toWorld: (lon: number, lat: number, elevation: number) => WorldPoint,
  top: number,
  bottom: number,
) {
  if (!(bottom < top)) return null;
  const positions: number[] = [];
  const indices: number[] = [];

  for (const ring of rings) {
    if (ring.length < 2) continue;
    for (let i = 0; i < ring.length; i++) {
      const start = ring[i];
      const end = ring[(i + 1) % ring.length];
      const startTop = toWorld(start[0], start[1], top);
      const endTop = toWorld(end[0], end[1], top);
      const endBottom = toWorld(end[0], end[1], bottom);
      const startBottom = toWorld(start[0], start[1], bottom);
      const index = positions.length / 3;
      positions.push(
        startTop[0],
        startTop[1],
        startTop[2],
        endTop[0],
        endTop[1],
        endTop[2],
        endBottom[0],
        endBottom[1],
        endBottom[2],
        startBottom[0],
        startBottom[1],
        startBottom[2],
      );
      indices.push(index, index + 1, index + 2, index, index + 2, index + 3);
    }
  }

  if (!positions.length) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function outlinePoints(
  ring: LonLat[],
  toWorld: (lon: number, lat: number, elevation: number) => WorldPoint,
  elevation: number,
) {
  const points = ring.map(([lon, lat]) => toWorld(lon, lat, elevation));
  if (points.length > 1) points.push(points[0]);
  return points;
}

export function lowestSurfaceElevation(surfaces: SurfaceLayer[]) {
  let foot = Infinity;
  for (const surface of surfaces) {
    if (!surface.visible) continue;
    const stats = gridValueStats(surface.grid, surface.depthPositiveDown);
    if (stats.count > 0 && stats.min < foot) foot = stats.min;
  }
  return Number.isFinite(foot) ? foot : null;
}
