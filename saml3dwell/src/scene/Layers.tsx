import { Html, Line } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { CRS } from '../../../src/sdk/projection/crs';
import { DoubleSide, type BufferGeometry } from 'three';
import { useScene } from '../state';
import type {
  LicenseContour,
  PropertyCube,
  SurfaceLayer,
  Wellhead,
} from '../types';
import { buildCubeGeometry } from './cube-geometry';
import { useWgs84Frame } from './Frame';
import { formatUtmZone, wgs84UtmDef } from './project';
import {
  buildLicenseFill,
  buildLicenseWalls,
  buildSurfaceGeometry,
  lowestSurfaceElevation,
  outlinePoints,
  type PlanPoint,
  type WorldPoint,
} from './geometry';

function useProjector() {
  const { toWorld: project } = useWgs84Frame();
  const { exaggeration } = useScene();

  const toWorld = useMemo(
    () =>
      (lon: number, lat: number, elevation: number): WorldPoint =>
        project(lon, lat, elevation * exaggeration),
    [project, exaggeration],
  );

  const toPlan = useMemo(
    () =>
      (lon: number, lat: number): PlanPoint => {
        const point = project(lon, lat, 0);
        return [point[0], -point[2]];
      },
    [project],
  );

  return { toWorld, toPlan, exaggeration };
}

function LicenseMesh({
  license,
  bottom,
}: {
  license: LicenseContour;
  bottom: number | null;
}) {
  const { toWorld, toPlan, exaggeration } = useProjector();
  const top = license.elevation;

  const fills = useMemo(() => {
    const geometries: BufferGeometry[] = [];
    const add = (elevation: number) => {
      for (const polygon of license.polygons) {
        const geometry = buildLicenseFill(polygon, toPlan, elevation);
        if (geometry) geometries.push(geometry);
      }
    };
    add(top * exaggeration);
    if (bottom !== null && bottom < top) add(bottom * exaggeration);
    return geometries;
  }, [license.polygons, toPlan, top, bottom, exaggeration]);

  const walls = useMemo(() => {
    if (bottom === null || !(bottom < top)) return null;
    const rings = license.polygons.flatMap(polygon => [
      polygon.outer,
      ...polygon.holes,
    ]);
    return buildLicenseWalls(rings, toWorld, top, bottom);
  }, [bottom, license.polygons, toWorld, top]);

  const outlines = useMemo(
    () =>
      license.polygons.map(polygon => outlinePoints(polygon.outer, toWorld, top)),
    [license.polygons, toWorld, top],
  );

  const owned = useMemo(
    () => (walls ? [...fills, walls] : fills),
    [fills, walls],
  );

  useEffect(() => {
    return () => {
      owned.forEach(geometry => geometry.dispose());
    };
  }, [owned]);

  return (
    <group>
      {fills.map((geometry, index) => (
        <mesh key={index} geometry={geometry}>
          <meshStandardMaterial
            color={license.color}
            transparent
            opacity={0.34}
            side={DoubleSide}
            roughness={0.7}
            metalness={0}
            depthWrite={false}
          />
        </mesh>
      ))}
      {walls && (
        <mesh geometry={walls}>
          <meshStandardMaterial
            color={license.color}
            transparent
            opacity={0.18}
            side={DoubleSide}
            roughness={0.8}
            metalness={0}
            depthWrite={false}
          />
        </mesh>
      )}
      {outlines.map((points, index) => (
        <Line key={index} points={points} color={license.color} lineWidth={2.5} />
      ))}
    </group>
  );
}

export function LicenseLayer() {
  const { licenses, surfaces, showVolume } = useScene();
  const foot = lowestSurfaceElevation(surfaces);

  return (
    <group>
      {licenses
        .filter(license => license.visible)
        .map(license => {
          const bottom = !showVolume
            ? null
            : foot === null
              ? license.elevation - 400
              : Math.min(foot, license.elevation - 20);
          return (
            <LicenseMesh
              key={license.id}
              license={license}
              bottom={
                bottom !== null && bottom < license.elevation ? bottom : null
              }
            />
          );
        })}
    </group>
  );
}

function WellMarker({
  well,
  radius,
  foot,
}: {
  well: Wellhead;
  radius: number;
  foot: number;
}) {
  const { toWorld } = useProjector();
  const { exaggeration, showLabels, focusWell } = useScene();
  const localFoot = (foot - well.rotaryElevation) * exaggeration;
  const stem = localFoot < -radius ? Math.abs(localFoot) : 0;

  return (
    <group
      position={toWorld(
        well.longitude,
        well.latitude,
        well.rotaryElevation,
      )}
    >
      <mesh
        onClick={event => {
          event.stopPropagation();
          focusWell(well.id);
        }}
      >
        <sphereGeometry args={[radius, 20, 16]} />
        <meshStandardMaterial color="#ff4d4f" roughness={0.35} metalness={0.05} />
      </mesh>
      {stem > 0 && (
        <mesh position={[0, -stem / 2, 0]}>
          <cylinderGeometry args={[radius * 0.14, radius * 0.22, stem, 10]} />
          <meshStandardMaterial color="#ff7875" roughness={0.45} />
        </mesh>
      )}
      {showLabels && (
        <Html position={[0, radius * 1.8, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="well-label">
            <b>{well.name}</b>
            <span>{well.rotaryElevation.toFixed(1)} м</span>
          </div>
        </Html>
      )}
    </group>
  );
}

export function WellLayer({ radius }: { radius: number }) {
  const { wells, surfaces } = useScene();
  const surfaceFoot = lowestSurfaceElevation(surfaces);

  return (
    <group>
      {wells
        .filter(well => well.visible)
        .map(well => (
          <WellMarker
            key={well.id}
            well={well}
            radius={radius}
            foot={
              surfaceFoot === null
                ? well.rotaryElevation - 400
                : Math.min(surfaceFoot, well.rotaryElevation - 40)
            }
          />
        ))}
    </group>
  );
}

function SurfaceMesh({ surface }: { surface: SurfaceLayer }) {
  const { toWorld } = useProjector();
  const geometry = useMemo(
    () => buildSurfaceGeometry(surface.grid, toWorld, surface.depthPositiveDown),
    [surface.grid, surface.depthPositiveDown, toWorld],
  );

  useEffect(() => {
    return () => geometry?.dispose();
  }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshStandardMaterial
        color={surface.useColorRamp ? '#ffffff' : surface.color}
        vertexColors={surface.useColorRamp}
        side={DoubleSide}
        roughness={0.9}
        metalness={0}
        wireframe={surface.wireframe}
        transparent={surface.opacity < 0.999}
        opacity={surface.opacity}
        depthWrite={surface.opacity > 0.9 && !surface.wireframe}
      />
    </mesh>
  );
}

function CubeMesh({ cube }: { cube: PropertyCube }) {
  const { toWorld, toUtm, zone } = useWgs84Frame();
  const { exaggeration } = useScene();
  const geometry = useMemo(() => {
    const lift = (elevation: number) => elevation * exaggeration;
    let project: (x: number, y: number, elevation: number) => WorldPoint;
    if (cube.coordMode === 'wgs84') {
      project = (x, y, elevation) => toWorld(x, y, lift(elevation));
    } else {
      let sameZone = false;
      try {
        sameZone = formatUtmZone(cube.utmZone) === zone;
      } catch {
        sameZone = false;
      }
      if (sameZone) {
        project = (x, y, elevation) => toUtm(x, y, lift(elevation));
      } else {
        let local: CRS | null = null;
        try {
          local = new CRS(wgs84UtmDef(cube.utmZone), [0, 0], 'utm');
        } catch {
          local = null;
        }
        project = (x, y, elevation) => {
          if (!local) return toWorld(0, 0, lift(elevation));
          const [longitude, latitude] = local.utmToWgs84([x, y]);
          return toWorld(longitude, latitude, lift(elevation));
        };
      }
    }
    return buildCubeGeometry(cube.grid, cube.property, {
      depthPositiveDown: cube.depthPositiveDown,
      iCut: cube.iCut,
      jCut: cube.jCut,
      kCut: cube.kCut,
      project,
    });
  }, [cube, exaggeration, toUtm, toWorld, zone]);

  useEffect(() => {
    return () => geometry?.dispose();
  }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshStandardMaterial
        color="#ffffff"
        vertexColors
        side={DoubleSide}
        roughness={0.82}
        metalness={0}
        transparent={cube.opacity < 0.999}
        opacity={cube.opacity}
        depthWrite={cube.opacity > 0.9}
      />
    </mesh>
  );
}

export function CubeLayer() {
  const { cubes } = useScene();
  return (
    <group>
      {cubes
        .filter(cube => cube.visible)
        .map(cube => (
          <CubeMesh key={cube.id} cube={cube} />
        ))}
    </group>
  );
}

export function SurfaceLayerMeshes() {
  const { surfaces } = useScene();
  return (
    <group>
      {surfaces
        .filter(surface => surface.visible)
        .map(surface => (
          <SurfaceMesh key={surface.id} surface={surface} />
        ))}
    </group>
  );
}
