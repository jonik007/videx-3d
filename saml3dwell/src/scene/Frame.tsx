import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { CRS } from '../../../src/sdk/projection/crs';
import type { WorldPoint } from './geometry';

type FrameContextValue = {
  zone: string;
  toWorld: (longitude: number, latitude: number, elevation?: number) => WorldPoint;
  toUtm: (easting: number, northing: number, elevation?: number) => WorldPoint;
};

const FrameContext = createContext<FrameContextValue | null>(null);

/**
 * Places children in the same local frame as `@equinor/videx-3d` `UtmArea`:
 * X east, Y up, Z south. The transform itself is the library `CRS` class.
 */
export function Wgs84Frame({
  crs,
  zone,
  children,
}: {
  crs: CRS;
  zone: string;
  children: ReactNode;
}) {
  const value = useMemo<FrameContextValue>(
    () => ({
      zone,
      toWorld(longitude, latitude, elevation = 0) {
        const point = crs.wgs84ToWorld(longitude, latitude, elevation);
        return [point.x, point.y, point.z];
      },
      toUtm(easting, northing, elevation = 0) {
        const point = crs.utmToWorld(easting, northing, elevation);
        return [point.x, point.y, point.z];
      },
    }),
    [crs, zone],
  );

  return <FrameContext.Provider value={value}>{children}</FrameContext.Provider>;
}

export function useWgs84Frame() {
  const value = useContext(FrameContext);
  if (!value) {
    throw new Error('useWgs84Frame должен вызываться внутри Wgs84Frame');
  }
  return value;
}
