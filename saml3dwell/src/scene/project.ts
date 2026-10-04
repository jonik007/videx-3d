import {
  CRS,
  getUtmZoneFromLatLng,
} from '../../../src/sdk/projection/crs';
import type { LicenseContour, SurfaceLayer, Wellhead } from '../types';
import { gridExtent } from '../parsers/esri-ascii';

/**
 * UTM zone label accepted by the library helper: two digits and a hemisphere.
 * `getUtmZoneFromLatLng` omits the leading zero for zones 1–9.
 */
export function formatUtmZone(zone: string) {
  const match = /^(\d{1,2})([NS])$/i.exec(zone.trim());
  if (!match) {
    throw new Error(`Некорректная зона UTM: ${zone}`);
  }
  return `${match[1].padStart(2, '0')}${match[2].toUpperCase()}`;
}

export function utmZoneFor(longitude: number, latitude: number) {
  return formatUtmZone(getUtmZoneFromLatLng([longitude, latitude]));
}

/**
 * WGS84 / UTM. The library helper `getProjectionDefFromUtmZone` targets ED50,
 * so the scene builds its own WGS84 definition and passes it to `CRS`.
 */
export function wgs84UtmDef(zone: string) {
  const formatted = formatUtmZone(zone);
  const number = Number(formatted.slice(0, 2));
  const south = formatted.endsWith('S') ? ' +south' : '';
  return `+proj=utm +zone=${number}${south} +datum=WGS84 +units=m +no_defs`;
}

export function createSceneCrs(origin: [number, number]) {
  const zone = utmZoneFor(origin[0], origin[1]);
  return {
    zone,
    crs: new CRS(wgs84UtmDef(zone), origin, 'lnglat'),
  };
}

export function datasetOrigin(
  licenses: LicenseContour[],
  wells: Wellhead[],
  surfaces: SurfaceLayer[],
): [number, number] | null {
  let lon = 0;
  let lat = 0;
  let count = 0;
  const add = (longitude: number, latitude: number) => {
    lon += longitude;
    lat += latitude;
    count += 1;
  };

  for (const license of licenses) {
    for (const polygon of license.polygons) {
      for (const [longitude, latitude] of polygon.outer) add(longitude, latitude);
    }
  }
  for (const well of wells) add(well.longitude, well.latitude);
  for (const surface of surfaces) {
    const extent = gridExtent(surface.grid);
    add(extent.west, extent.south);
    add(extent.east, extent.north);
  }

  if (!count) return null;
  return [lon / count, lat / count];
}
