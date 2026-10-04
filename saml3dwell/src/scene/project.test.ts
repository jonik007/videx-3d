import { describe, expect, it } from 'vitest';
import { CRS } from '../../../src/sdk/projection/crs';
import { createSceneCrs, formatUtmZone, wgs84UtmDef } from './project';

describe('WGS84 scene projection', () => {
  it('pads UTM zones and keeps the WGS84 datum', () => {
    expect(formatUtmZone('7s')).toBe('07S');
    expect(wgs84UtmDef('43N')).toContain('+datum=WGS84');
    expect(wgs84UtmDef('43N')).not.toContain('towgs84');
  });

  it('places the origin at the scene center and keeps elevation on Y', () => {
    const { zone, crs } = createSceneCrs([73.4, 61.25]);
    expect(zone).toBe('43N');
    expect(crs).toBeInstanceOf(CRS);

    const origin = crs.wgs84ToWorld(73.4, 61.25, -1700);
    const north = crs.wgs84ToWorld(73.4, 61.258, -1700);
    expect(origin.x).toBeCloseTo(0, 4);
    expect(origin.z).toBeCloseTo(0, 4);
    expect(origin.y).toBeCloseTo(-1700, 4);

    const distance = Math.hypot(north.x - origin.x, north.z - origin.z);
    expect(distance).toBeGreaterThan(800);
    expect(distance).toBeLessThan(950);
    expect(north.z).toBeLessThan(0);
  });
});
