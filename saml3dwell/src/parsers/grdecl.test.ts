import { describe, expect, it } from 'vitest';
import poroCube from '../../public/samples/poro.grdecl?raw';
import {
  cellCorner,
  defaultPropertyName,
  inferCoordMode,
  parseGrdecl,
  propertyStats,
  zcornAt,
} from './grdecl';

describe('parseGrdecl', () => {
  it('reads repeat counts, comments and corner-point cells', () => {
    const grid = parseGrdecl(`
      -- tiny box
      SPECGRID
      1 1 1 1 F
      /
      COORD
      0 0 0  10 0 100
      2 0 0  12 0 100
      0 3 0  10 3 100
      2 3 0  12 3 100
      /
      ZCORN
      1 2 3 4 5 6 7 8
      /
      ACTNUM
      1
      /
      PORO
      1*0.25
      /
      PERMX
      1.5D1
      /
    `);

    expect(grid.nx).toBe(1);
    expect(zcornAt(grid, 0, 0, 0, 0)).toBe(1);
    expect(zcornAt(grid, 0, 0, 0, 3)).toBe(4);
    expect(zcornAt(grid, 0, 0, 0, 7)).toBe(8);
    expect(cellCorner(grid, 0, 0, 0, 0)).toMatchObject({ z: 1 });
    expect(cellCorner(grid, 0, 0, 0, 0).x).toBeCloseTo(0.1);
    expect(grid.properties.PORO[0]).toBeCloseTo(0.25);
    expect(grid.properties.PERMX[0]).toBeCloseTo(15);
    expect(defaultPropertyName(grid)).toBe('PORO');
  });

  it('builds a Cartesian cube from DX DY DZ TOPS', () => {
    const grid = parseGrdecl(`
      DIMENS
      1 1 1 /
      DX
      100 /
      DY
      40 /
      DZ
      10 /
      TOPS
      1000 /
      PORO
      0.2 /
    `);
    const top = cellCorner(grid, 0, 0, 0, 0);
    const east = cellCorner(grid, 0, 0, 0, 1);
    const north = cellCorner(grid, 0, 0, 0, 2);
    const bottom = cellCorner(grid, 0, 0, 0, 4);
    expect(top).toMatchObject({ x: 0, y: 0, z: 1000 });
    expect(east.x).toBeCloseTo(100);
    expect(north.y).toBeCloseTo(40);
    expect(bottom.z).toBeCloseTo(1010);
    expect(inferCoordMode(grid)).toBe('wgs84');
    expect(propertyStats(grid, 'PORO')).toMatchObject({ min: 0.2, max: 0.2, count: 1 });
  });

  it('treats metre pillars outside the degree range as UTM', () => {
    const grid = parseGrdecl(`
      DIMENS
      1 1 1 /
      DX
      100 /
      DY
      100 /
      DZ
      10 /
      TOPS
      0 /
      MAPAXES
      500000 6800100 500000 6800000 500100 6800000 /
      PORO
      0.1 /
    `);
    expect(inferCoordMode(grid)).toBe('utm');
    expect(cellCorner(grid, 0, 0, 0, 0)).toMatchObject({ x: 500000, y: 6800000 });
  });

  it('rejects a file without a property cube', () => {
    expect(() =>
      parseGrdecl(`
        DIMENS
        1 1 1 /
        DX
        1 /
        DY
        1 /
        DZ
        1 /
        TOPS
        0 /
      `),
    ).toThrow(/куба свойств/);
  });

  it('loads the bundled porosity cube in WGS84', () => {
    const grid = parseGrdecl(poroCube);
    expect(grid.nx).toBe(6);
    expect(grid.ny).toBe(5);
    expect(grid.nz).toBe(4);
    expect(inferCoordMode(grid)).toBe('wgs84');
    expect(grid.properties.PORO.length).toBe(120);
    expect(grid.actnum.some(flag => flag === 0)).toBe(true);
    expect(propertyStats(grid, 'PORO').count).toBe(119);
    const corner = cellCorner(grid, 0, 0, 0, 0);
    expect(corner.x).toBeGreaterThan(73);
    expect(corner.x).toBeLessThan(74);
    expect(corner.y).toBeGreaterThan(61);
    expect(corner.z).toBeGreaterThan(1800);
  });
});
