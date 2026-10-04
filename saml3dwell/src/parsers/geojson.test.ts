import { describe, expect, it } from 'vitest';
import horizonText from '../../public/samples/horizon.asc?raw';
import licenseText from '../../public/samples/licenses.geojson?raw';
import wellText from '../../public/samples/wellheads.geojson?raw';
import { parseCoordinateList } from './coordinates';
import { parseEsriAsciiGrid } from './esri-ascii';
import {
  licensesFromFeatures,
  parseGeoJsonDocument,
  wellsFromFeatures,
} from './geojson';

describe('GeoJSON licenses and wellheads', () => {
  it('reads license polygons and rotary elevation aliases', () => {
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'ЛУ-1', elevation: 12 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [73.3, 61.2],
                [73.4, 61.2],
                [73.4, 61.3],
                [73.3, 61.2],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { name: '101', амплитуда_ротора: 52.4 },
          geometry: { type: 'Point', coordinates: [73.36, 61.26] },
        },
        {
          type: 'Feature',
          properties: { название: '205', 'альтитуда ротора': '61,7' },
          geometry: { type: 'Point', coordinates: [73.46, 61.24, 9] },
        },
      ],
    });

    const { features } = parseGeoJsonDocument(text);
    const { licenses } = licensesFromFeatures(features);
    const { wells, warnings } = wellsFromFeatures(features);

    expect(licenses).toHaveLength(1);
    expect(licenses[0].name).toBe('ЛУ-1');
    expect(licenses[0].elevation).toBe(12);
    expect(licenses[0].polygons[0].outer).toEqual([
      [73.3, 61.2],
      [73.4, 61.2],
      [73.4, 61.3],
    ]);
    expect(wells.map(well => [well.name, well.rotaryElevation])).toEqual([
      ['101', 52.4],
      ['205', 61.7],
    ]);
    expect(warnings).toEqual([]);
  });

  it('swaps a document that was stored as latitude, longitude', () => {
    const { features, axisOrder } = parseGeoJsonDocument(
      JSON.stringify({
        type: 'Feature',
        properties: { kb: 40 },
        geometry: { type: 'Point', coordinates: [61.25, 120.5] },
      }),
    );
    const { wells } = wellsFromFeatures(features);
    expect(axisOrder).toBe('latlon');
    expect(wells[0].longitude).toBeCloseTo(120.5);
    expect(wells[0].latitude).toBeCloseTo(61.25);
    expect(wells[0].rotaryElevation).toBe(40);
  });

  it('uses a point Z when the rotary elevation property is absent', () => {
    const { features } = parseGeoJsonDocument(
      JSON.stringify({
        type: 'Point',
        coordinates: [10, 20, 33],
      }),
    );
    const { wells, warnings } = wellsFromFeatures(features);
    expect(wells[0].rotaryElevation).toBe(33);
    expect(warnings).toEqual([]);
  });
});

describe('bundled samples', () => {
  it('loads the example license, wellhead and horizon files', () => {
    const licenses = licensesFromFeatures(parseGeoJsonDocument(licenseText).features);
    const wells = wellsFromFeatures(parseGeoJsonDocument(wellText).features);
    const grid = parseEsriAsciiGrid(horizonText);
    expect(licenses.licenses.map(item => item.name)).toEqual(['ЛУ Северный', 'ЛУ Южный']);
    expect(wells.wells.map(item => item.rotaryElevation)).toEqual([52.4, 48.1, 61.7, 44]);
    expect(wells.warnings).toEqual([]);
    expect(grid.ncols).toBe(36);
    expect(grid.nrows).toBe(30);
    expect(grid.values.some(value => value === -9999)).toBe(true);
  });
});

describe('parseCoordinateList', () => {
  it('reads longitude and latitude pairs', () => {
    expect(parseCoordinateList('73.30 61.20\n73.48, 61.21; 73.40 61.30')).toEqual([
      [73.3, 61.2],
      [73.48, 61.21],
      [73.4, 61.3],
    ]);
  });
});
