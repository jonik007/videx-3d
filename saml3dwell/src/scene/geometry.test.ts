import { describe, expect, it } from 'vitest';
import { parseEsriAsciiGrid } from '../parsers/esri-ascii';
import { buildLicenseFill, buildSurfaceGeometry } from './geometry';

describe('scene geometry', () => {
  it('triangulates a regular WGS84 grid in scene space', () => {
    const grid = parseEsriAsciiGrid(`
      ncols 2
      nrows 2
      xllcorner 0
      yllcorner 0
      cellsize 1
      10 20
      30 40
    `);
    const geometry = buildSurfaceGeometry(
      grid,
      (lon, lat, elevation) => [lon, elevation, lat],
      false,
    );
    expect(geometry).not.toBeNull();
    expect(geometry?.getAttribute('position').count).toBe(4);
    expect(geometry?.getIndex()?.count).toBe(6);
    const position = geometry!.getAttribute('position');
    const heights = [0, 1, 2, 3].map(index => position.getY(index));
    expect([...heights].sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
  });

  it('drops a cell that touches nodata', () => {
    const grid = parseEsriAsciiGrid(`
      ncols 2
      nrows 2
      xllcorner 0
      yllcorner 0
      cellsize 1
      NODATA_value -9999
      1 -9999
      3 4
    `);
    const geometry = buildSurfaceGeometry(
      grid,
      (lon, lat, elevation) => [lon, elevation, lat],
      false,
    );
    expect(geometry?.getIndex()).toBeNull();
  });

  it('lays a license ring onto the horizontal plane', () => {
    const geometry = buildLicenseFill(
      {
        outer: [
          [0, 0],
          [10, 0],
          [10, 5],
        ],
        holes: [],
      },
      (lon, lat) => [lon, lat],
      -25,
    );
    expect(geometry).not.toBeNull();
    geometry?.computeBoundingBox();
    const box = geometry?.boundingBox;
    expect(box?.min.y).toBeCloseTo(-25);
    expect(box?.max.y).toBeCloseTo(-25);
    expect(box?.min.x).toBeCloseTo(0);
    expect(box?.max.x).toBeCloseTo(10);
    expect(box?.min.z).toBeCloseTo(-5);
    expect(box?.max.z).toBeCloseTo(0);
  });
});
