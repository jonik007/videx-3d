import { Html, Line, Text } from '@react-three/drei';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo, useState } from 'react';
import { BoxGrid } from '../../components/Grids/BoxGrid/BoxGrid';
import { Vec3 } from '../../sdk';
import { Canvas3dDecorator } from '../decorators/canvas-3d-decorator';

type FormationInput = {
  id: string;
  name: string;
  depth: number;
  color: string;
};

type WellInput = {
  id: string;
  name: string;
  x: number;
  y: number;
  depth: number;
  formations: FormationInput[];
};

type WellInterval = {
  id: string;
  name: string;
  from: number;
  to: number;
  color: string;
};

const defaultWells: WellInput[] = [
  {
    id: 'well-a',
    name: 'Well A',
    x: -250,
    y: -150,
    depth: 1800,
    formations: [
      { id: 'a-top-1', name: 'Shale', depth: 350, color: '#4e79a7' },
      { id: 'a-top-2', name: 'Sandstone', depth: 850, color: '#f28e2c' },
      { id: 'a-top-3', name: 'Limestone', depth: 1350, color: '#59a14f' },
    ],
  },
  {
    id: 'well-b',
    name: 'Well B',
    x: 320,
    y: 220,
    depth: 1500,
    formations: [
      { id: 'b-top-1', name: 'Shale', depth: 280, color: '#4e79a7' },
      { id: 'b-top-2', name: 'Sandstone', depth: 720, color: '#f28e2c' },
      { id: 'b-top-3', name: 'Limestone', depth: 1200, color: '#59a14f' },
    ],
  },
];

const sortFormations = (formations: FormationInput[]) =>
  [...formations]
    .filter(formation => Number.isFinite(formation.depth))
    .sort((a, b) => a.depth - b.depth);

const formationIntervals = (well: WellInput): WellInterval[] => {
  const sorted = sortFormations(well.formations).filter(
    formation => formation.depth >= 0 && formation.depth < well.depth,
  );

  return sorted.map((formation, index) => ({
    id: formation.id,
    name: formation.name,
    from: formation.depth,
    to: sorted[index + 1]?.depth ?? well.depth,
    color: formation.color,
  }));
};

const numericValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formPanelStyle = {
  position: 'absolute',
  top: 12,
  left: 12,
  width: 360,
  maxHeight: 'calc(100vh - 24px)',
  overflow: 'auto',
  padding: 12,
  borderRadius: 8,
  background: 'rgba(8, 12, 18, 0.88)',
  color: '#fff',
  fontFamily: 'Verdana, sans-serif',
  fontSize: 12,
  pointerEvents: 'auto',
} satisfies React.CSSProperties;

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 4,
  marginBottom: 8,
  padding: '5px 6px',
  borderRadius: 4,
  border: '1px solid #52606d',
  background: '#111827',
  color: '#fff',
} satisfies React.CSSProperties;

const buttonStyle = {
  border: '1px solid #64748b',
  borderRadius: 4,
  background: '#1f2937',
  color: '#fff',
  cursor: 'pointer',
  padding: '5px 8px',
} satisfies React.CSSProperties;

const FormationForm = ({
  formation,
  onChange,
  onRemove,
}: {
  formation: FormationInput;
  onChange: (formation: FormationInput) => void;
  onRemove: () => void;
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 72px 42px 28px',
      gap: 6,
      alignItems: 'center',
      marginBottom: 6,
    }}
  >
    <input
      aria-label="Formation name"
      value={formation.name}
      onChange={event => onChange({ ...formation, name: event.target.value })}
      style={{ ...inputStyle, margin: 0 }}
    />
    <input
      aria-label="Formation top depth"
      type="number"
      min={0}
      value={formation.depth}
      onChange={event =>
        onChange({ ...formation, depth: numericValue(event.target.value) })
      }
      style={{ ...inputStyle, margin: 0 }}
    />
    <input
      aria-label="Formation color"
      type="color"
      value={formation.color}
      onChange={event => onChange({ ...formation, color: event.target.value })}
      style={{ width: 42, height: 28, padding: 0 }}
    />
    <button type="button" onClick={onRemove} style={buttonStyle}>
      x
    </button>
  </div>
);

const WellForm = ({
  well,
  onChange,
  onRemove,
}: {
  well: WellInput;
  onChange: (well: WellInput) => void;
  onRemove: () => void;
}) => (
  <section
    style={{
      borderTop: '1px solid #334155',
      marginTop: 10,
      paddingTop: 10,
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <strong>{well.name}</strong>
      <button type="button" onClick={onRemove} style={buttonStyle}>
        Remove
      </button>
    </div>

    <label>
      Name
      <input
        value={well.name}
        onChange={event => onChange({ ...well, name: event.target.value })}
        style={inputStyle}
      />
    </label>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      <label>
        X mouth
        <input
          type="number"
          value={well.x}
          onChange={event =>
            onChange({ ...well, x: numericValue(event.target.value) })
          }
          style={inputStyle}
        />
      </label>
      <label>
        Y mouth
        <input
          type="number"
          value={well.y}
          onChange={event =>
            onChange({ ...well, y: numericValue(event.target.value) })
          }
          style={inputStyle}
        />
      </label>
      <label>
        Z depth
        <input
          type="number"
          min={1}
          value={well.depth}
          onChange={event =>
            onChange({ ...well, depth: Math.max(1, numericValue(event.target.value)) })
          }
          style={inputStyle}
        />
      </label>
    </div>

    <div style={{ marginTop: 4, marginBottom: 6 }}>
      <strong>Formation tops, m</strong>
    </div>
    {sortFormations(well.formations).map(formation => (
      <FormationForm
        key={formation.id}
        formation={formation}
        onChange={next =>
          onChange({
            ...well,
            formations: well.formations.map(item =>
              item.id === next.id ? next : item,
            ),
          })
        }
        onRemove={() =>
          onChange({
            ...well,
            formations: well.formations.filter(item => item.id !== formation.id),
          })
        }
      />
    ))}

    <button
      type="button"
      style={buttonStyle}
      onClick={() =>
        onChange({
          ...well,
          formations: [
            ...well.formations,
            {
              id: `${well.id}-formation-${Date.now()}`,
              name: 'New formation',
              depth: Math.round(well.depth * 0.5),
              color: '#edc949',
            },
          ],
        })
      }
    >
      Add formation
    </button>
  </section>
);

const WellScene = ({ wells }: { wells: WellInput[] }) => {
  const bounds = useMemo(() => {
    const xs = wells.map(well => well.x);
    const ys = wells.map(well => well.y);
    const maxDepth = Math.max(...wells.map(well => well.depth), 1000);
    const minX = Math.min(...xs, -500);
    const maxX = Math.max(...xs, 500);
    const minY = Math.min(...ys, -500);
    const maxY = Math.max(...ys, 500);
    const padding = 300;

    return {
      size: [maxX - minX + padding * 2, maxDepth + 200, maxY - minY + padding * 2] as Vec3,
      position: [
        (minX + maxX) * 0.5,
        -maxDepth * 0.5,
        (minY + maxY) * 0.5,
      ] as Vec3,
    };
  }, [wells]);

  return (
    <group>
      <BoxGrid
        size={bounds.size}
        position={bounds.position}
        cellSize={250}
        gridScale={[1, -1, 1]}
        gridLineWidth={0.01}
        background="#08111f"
        backgroundOpacity={0.18}
        opacity={0.85}
        axesColor="#dbeafe"
        gridColorMajor="#7dd3fc"
        gridColorMinor="#1d4ed8"
      />

      {wells.map(well => (
        <group key={well.id}>
          <Line
            points={[
              [well.x, 0, well.y],
              [well.x, -well.depth, well.y],
            ]}
            color="#f8fafc"
            lineWidth={2}
          />
          <mesh position={[well.x, 0, well.y]}>
            <sphereGeometry args={[20, 24, 16]} />
            <meshStandardMaterial color="#38bdf8" />
          </mesh>
          <Text
            position={[well.x + 35, 50, well.y]}
            fontSize={48}
            color="#e0f2fe"
            anchorX="left"
            anchorY="middle"
          >
            {well.name}
          </Text>

          {formationIntervals(well).map(interval => {
            const height = Math.max(interval.to - interval.from, 1);
            const centerDepth = interval.from + height * 0.5;

            return (
              <group key={interval.id}>
                <mesh position={[well.x, -centerDepth, well.y]}>
                  <cylinderGeometry args={[26, 26, height, 24, 1, true]} />
                  <meshStandardMaterial
                    color={interval.color}
                    transparent
                    opacity={0.42}
                  />
                </mesh>
                <mesh position={[well.x, -interval.from, well.y]}>
                  <torusGeometry args={[34, 3, 8, 36]} />
                  <meshStandardMaterial color={interval.color} />
                </mesh>
                <Text
                  position={[well.x + 60, -interval.from, well.y]}
                  fontSize={34}
                  color={interval.color}
                  anchorX="left"
                  anchorY="middle"
                >
                  {`${interval.name} ${interval.from} m`}
                </Text>
              </group>
            );
          })}
        </group>
      ))}
    </group>
  );
};

const InteractiveWellInputExample = () => {
  const [wells, setWells] = useState<WellInput[]>(defaultWells);

  return (
    <>
      <WellScene wells={wells} />
      <Html fullscreen>
        <form
          style={formPanelStyle}
          onPointerDown={event => event.stopPropagation()}
          onSubmit={event => event.preventDefault()}
        >
          <h2 style={{ margin: '0 0 6px', fontSize: 16 }}>
            Well formation input
          </h2>
          <p style={{ color: '#cbd5e1', lineHeight: 1.4, marginTop: 0 }}>
            X/Y define the wellhead position. Z is vertical depth in meters.
            Formation tops are rendered as rings and colored intervals.
          </p>
          <button
            type="button"
            style={buttonStyle}
            onClick={() =>
              setWells(current => [
                ...current,
                {
                  id: `well-${Date.now()}`,
                  name: `Well ${current.length + 1}`,
                  x: current.length * 220,
                  y: current.length * -180,
                  depth: 1200,
                  formations: [
                    {
                      id: `formation-${Date.now()}`,
                      name: 'Top reservoir',
                      depth: 500,
                      color: '#76b7b2',
                    },
                  ],
                },
              ])
            }
          >
            Add well
          </button>

          {wells.map(well => (
            <WellForm
              key={well.id}
              well={well}
              onChange={next =>
                setWells(current =>
                  current.map(item => (item.id === next.id ? next : item)),
                )
              }
              onRemove={() =>
                setWells(current => current.filter(item => item.id !== well.id))
              }
            />
          ))}
        </form>
      </Html>
    </>
  );
};

const meta = {
  title: 'examples/Interactive well input',
  component: InteractiveWellInputExample,
  decorators: [Canvas3dDecorator],
  parameters: {
    scale: 20,
    cameraPosition: [1200, 900, 1700],
    cameraTarget: [0, -700, 0],
    background: '#020617',
  },
} satisfies Meta<typeof InteractiveWellInputExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
