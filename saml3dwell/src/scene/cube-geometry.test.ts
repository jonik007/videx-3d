import { describe, expect, it } from 'vitest';
import poroCube from '../../public/samples/poro.grdecl?raw';
import { parseGrdecl } from '../parsers/grdecl';
import { buildCubeGeometry } from './cube-geometry';

const grid = parseGrdecl(poroCube);

function geometryFor(kCut: number) {
  return buildCubeGeometry(grid, 'PORO', {
    depthPositiveDown: true,
    iCut: grid.nx,
    jCut: grid.ny,
    kCut,
    project: (x, y, elevation) => [x, elevation, -y],
  });
}

describe('buildCubeGeometry', () => {
  it('colors exposed faces and treats Z as depth', () => {
    const geometry = geometryFor(grid.nz);
    expect(geometry).not.toBeNull();
    expect(geometry?.userData.stride).toBe(1);
    expect(geometry!.getAttribute('position').count).toBeGreaterThan(20);
    expect(geometry!.getAttribute('position').getY(0)).toBeLessThan(-1800);
  });

  it('omits cells at and beyond the K cut', () => {
    const full = geometryFor(grid.nz);
    const cut = geometryFor(1);
    expect(cut!.getAttribute('position').count).toBeLessThan(
      full!.getAttribute('position').count,
    );
  });
});
