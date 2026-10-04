import type { LonLat } from '../types';

const PAIR =
  /([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

/**
 * Parses "долгота широта" pairs separated by spaces, commas, semicolons or new lines.
 * Axis order is longitude, latitude.
 */
export function parseCoordinateList(text: string): LonLat[] {
  const points: LonLat[] = [];
  for (const match of text.matchAll(PAIR)) {
    const lon = Number(match[1]);
    const lat = Number(match[2]);
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
      throw new Error(
        `Координата вне диапазона WGS84: ${match[1]}, ${match[2]}. Ожидается долгота, широта`,
      );
    }
    points.push([lon, lat]);
  }
  return points;
}
