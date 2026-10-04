import { describe, expect, it } from 'vitest';
import poroCube from '../../public/samples/poro.grdecl?raw';
import { parseEsriAsciiGrid } from '../parsers/esri-ascii';
import { parseGrdecl } from '../parsers/grdecl';
import type { PropertyCube } from '../types';
import { createSceneCrs } from './project';
import {
  buildStations,
  cubeBands,
  sectionStep,
  surfaceTraces,
  type SectionAnchor,
} from './section';

function anchor(patch: Partial<SectionAnchor> & Pick<SectionAnchor, 'x' | 'z'>): SectionAnchor {
  return {
    id: 'a',
    name: 'A',
    longitude: patch.x,
    latitude: -patch.z,
    rotaryElevation: 50,
    ...patch,
  };
}

describe('section', () => {
  it('spaces stations by true distance between wells', () => {
    const { stations, wells } = buildStations(
      [
        anchor({ id: '1', name: '101', x: 0, z: 0, longitude: 1, latitude: 2 }),
        anchor({ id: '2', name: '102', x: 1000, z: 0, longitude: 3, latitude: 4 }),
      ],
      sectionStep(1000),
      (x, z) => ({ longitude: x, latitude: z }),
    );
    expect(wells.map(well => well.s)).toEqual([0, 1000]);
    expect(stations[0]).toMatchObject({ s: 0, longitude: 1, latitude: 2 });
    expect(stations[stations.length - 1]).toMatchObject({
      s: 1000,
      longitude: 3,
      latitude: 4,
    });
    expect(stations.length).toBeGreaterThan(10);
  });

  it('draws GRDECL bands and the horizon along wells inside the sample', () => {
    const grid = parseGrdecl(poroCube);
    const cube: PropertyCube = {
      id: 'cube',
      name: 'PORO',
      visible: true,
      opacity: 1,
      depthPositiveDown: true,
      coordMode: 'wgs84',
      utmZone: '43N',
      property: 'PORO',
      iCut: grid.nx,
      jCut: grid.ny,
      kCut: grid.nz,
      grid,
    };
    const stations = [
      { s: 0, longitude: 73.36, latitude: 61.27 },
      { s: 2000, longitude: 73.385, latitude: 61.285 },
      { s: 4000, longitude: 73.41, latitude: 61.3 },
    ];
    const bands = cubeBands(stations, cube, (longitude, latitude) => [
      longitude,
      latitude,
    ]);
    expect(bands.length).toBeGreaterThan(4);
    expect(bands.every(band => band.top > band.bottom)).toBe(true);
    expect(bands.every(band => band.top < -1800 && band.bottom > -2500)).toBe(true);
    expect(cubeBands([{ s: 0, longitude: 0, latitude: 0 }, { s: 10, longitude: 0, latitude: 0 }], cube, (longitude, latitude) => [longitude, latitude])).toEqual([]);

    const surface = parseEsriAsciiGrid(`
      ncols 2
      nrows 2
      xllcorner 73
      yllcorner 61
      cellsize 1
      -1700 -1800
      -1750 -1850
    `);
    const traces = surfaceTraces(stations, surface, false);
    expect(traces).toHaveLength(1);
    expect(traces[0].every(point => point.elevation < -1700)).toBe(true);
  });

  it('covers the sample wells from the first stick to the last', () => {
    const grid = parseGrdecl(poroCube);
    const cube: PropertyCube = {
      id: 'cube',
      name: 'PORO',
      visible: true,
      opacity: 1,
      depthPositiveDown: true,
      coordMode: 'wgs84',
      utmZone: '43N',
      property: 'PORO',
      iCut: grid.nx,
      jCut: grid.ny,
      kCut: grid.nz,
      grid,
    };
    const { crs } = createSceneCrs([73.4, 61.28]);
    const wells = [
      { id: '101', name: '101', longitude: 73.36, latitude: 61.27, rotaryElevation: 52.4 },
      { id: '102', name: '102', longitude: 73.41, latitude: 61.3, rotaryElevation: 48.1 },
    ];
    const anchors = wells.map(well => {
      const world = crs.wgs84ToWorld(well.longitude, well.latitude, 0);
      return { ...well, x: world.x, z: world.z };
    });
    let length = Math.hypot(anchors[1].x - anchors[0].x, anchors[1].z - anchors[0].z);
    const path = buildStations(anchors, sectionStep(length), (x, z) => {
      const geographic = crs.worldToWgs84(x, 0, z);
      return { longitude: geographic.lng, latitude: geographic.lat };
    });
    const bands = cubeBands(path.stations, cube, (longitude, latitude) => [
      longitude,
      latitude,
    ]);
    const s0 = Math.min(...bands.map(band => band.s0));
    const s1 = Math.max(...bands.map(band => band.s1));
    expect(s0).toBe(0);
    expect(s1).toBeCloseTo(length, 0);
    expect(path.wells.map(well => well.name)).toEqual(['101', '102']);
  });
});
