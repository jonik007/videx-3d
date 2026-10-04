import { describe, expect, it } from 'vitest';
import {
  cellCenter,
  gridExtent,
  isNodata,
  parseEsriAsciiGrid,
  valueAt,
} from './esri-ascii';

const SAMPLE = `
ncols 2
nrows 2
xllcorner 10
yllcorner 20
cellsize 1
NODATA_value -9999
1 2
3 4
`;

describe('parseEsriAsciiGrid', () => {
  it('reads a corner-referenced grid with north at the first row', () => {
    const grid = parseEsriAsciiGrid(SAMPLE);
    expect(grid.ncols).toBe(2);
    expect(grid.nrows).toBe(2);
    expect(grid.nodata).toBe(-9999);
    expect(cellCenter(grid, 0, 1)).toEqual([10.5, 21.5]);
    expect(valueAt(grid, 0, 1)).toBe(1);
    expect(valueAt(grid, 1, 1)).toBe(2);
    expect(cellCenter(grid, 0, 0)).toEqual([10.5, 20.5]);
    expect(valueAt(grid, 0, 0)).toBe(3);
    expect(valueAt(grid, 1, 0)).toBe(4);
    expect(gridExtent(grid)).toEqual({
      west: 10,
      south: 20,
      east: 12,
      north: 22,
    });
  });

  it('accepts cell centers and a separate dy', () => {
    const grid = parseEsriAsciiGrid(`
      ncols 1
      nrows 1
      xllcenter 30.5
      yllcenter 50.25
      dx 0.1
      dy 0.05
      -12.5
    `);
    expect(grid.xllIsCenter).toBe(true);
    expect(grid.yllIsCenter).toBe(true);
    expect(cellCenter(grid, 0, 0)).toEqual([30.5, 50.25]);
    expect(gridExtent(grid).south).toBeCloseTo(50.225);
  });

  it('rejects a grid whose value count does not match the header', () => {
    expect(() =>
      parseEsriAsciiGrid(`
        ncols 2
        nrows 2
        xllcorner 0
        yllcorner 0
        cellsize 1
        1 2 3
      `),
    ).toThrow(/получено 3/);
  });

  it('treats the declared nodata and huge sentinels as empty', () => {
    expect(isNodata(-9999, -9999)).toBe(true);
    expect(isNodata(1e30, -9999)).toBe(true);
    expect(isNodata(-12.5, -9999)).toBe(false);
  });
});
