import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three';
import {
  cellCorner,
  cubeStride,
  propertyStats,
  type EclipseGrid,
} from '../parsers/grdecl';
import { rampColor, type WorldPoint } from './geometry';

const FACE_CORNERS = [
  [0, 1, 3, 2],
  [4, 6, 7, 5],
  [0, 2, 6, 4],
  [1, 5, 7, 3],
  [0, 4, 5, 1],
  [2, 3, 7, 6],
];

const FACE_NEIGHBOR: [number, number, number][] = [
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
];

export function buildCubeGeometry(
  grid: EclipseGrid,
  propertyName: string,
  options: {
    depthPositiveDown: boolean;
    iCut: number;
    jCut: number;
    kCut: number;
    project: (x: number, y: number, elevation: number) => WorldPoint;
  },
) {
  const values = grid.properties[propertyName];
  if (!values) return null;
  const stats = propertyStats(grid, propertyName);
  const span = stats.max - stats.min || 1;
  const stride = cubeStride(grid.nx, grid.ny, grid.nz);
  const { nx, ny } = grid;

  const drawn = (i: number, j: number, k: number) => {
    if (i < 0 || j < 0 || k < 0 || i >= grid.nx || j >= grid.ny || k >= grid.nz) {
      return false;
    }
    if (i >= options.iCut || j >= options.jCut || k >= options.kCut) return false;
    if (i % stride !== 0 || j % stride !== 0 || k % stride !== 0) return false;
    const index = i + nx * (j + ny * k);
    if (grid.actnum[index] === 0) return false;
    const value = values[index];
    return Number.isFinite(value) && Math.abs(value) < 1e20;
  };

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let k = 0; k < grid.nz; k += stride) {
    for (let j = 0; j < grid.ny; j += stride) {
      for (let i = 0; i < grid.nx; i += stride) {
        if (!drawn(i, j, k)) continue;
        const index = i + nx * (j + ny * k);
        const [red, green, blue] = rampColor((values[index] - stats.min) / span);
        const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(corner => {
          const point = cellCorner(grid, i, j, k, corner);
          const elevation = options.depthPositiveDown ? -point.z : point.z;
          return options.project(point.x, point.y, elevation);
        });

        FACE_NEIGHBOR.forEach(([di, dj, dk], face) => {
          if (drawn(i + di * stride, j + dj * stride, k + dk * stride)) return;
          const base = positions.length / 3;
          for (const corner of FACE_CORNERS[face]) {
            const [x, y, z] = corners[corner];
            positions.push(x, y, z);
            colors.push(red, green, blue);
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        });
      }
    }
  }

  if (!indices.length) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();
  geometry.userData = { stride };
  return geometry;
}
