import {
  DeleteOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Collapse,
  ColorPicker,
  Input,
  InputNumber,
  Modal,
  Slider,
  Space,
  Switch,
  Typography,
  Upload,
} from 'antd';
import { useState } from 'react';
import { parseCoordinateList } from '../parsers/coordinates';
import {
  displayStride,
  gridExtent,
  gridValueStats,
  parseEsriAsciiGrid,
} from '../parsers/esri-ascii';
import {
  licensesFromFeatures,
  parseGeoJsonDocument,
  wellsFromFeatures,
} from '../parsers/geojson';
import { useScene } from '../state';
import { paletteColor, type LicenseContour, type SurfaceLayer } from '../types';

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось прочитать файл';
}

export function Sidebar() {
  const { message } = App.useApp();
  const scene = useScene();
  const [loadingSample, setLoadingSample] = useState(false);

  const loadSample = async () => {
    setLoadingSample(true);
    try {
      const warnings = await scene.loadSample();
      warnings.forEach(warning => message.warning(warning));
      message.success('Пример загружен');
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setLoadingSample(false);
    }
  };

  return (
    <div className="sidebar">
      <Alert
        type="info"
        showIcon
        message="Система координат — WGS84"
        description="GeoJSON и ESRI ASCII Grid читаются как долгота и широта в градусах. Сцена строится в метрах UTM на эллипсоиде WGS84."
      />
      <Space style={{ margin: '12px 0' }}>
        <Button type="primary" loading={loadingSample} onClick={() => void loadSample()}>
          Загрузить пример
        </Button>
        <Button onClick={scene.clearAll}>Очистить</Button>
      </Space>
      <Collapse
        defaultActiveKey={['licenses', 'wells', 'surfaces', 'scene']}
        items={[
          {
            key: 'licenses',
            label: `Лицензии (${scene.licenses.length})`,
            children: <LicensePanel />,
          },
          {
            key: 'wells',
            label: `Устья скважин (${scene.wells.length})`,
            children: <WellPanel />,
          },
          {
            key: 'surfaces',
            label: `Поверхности (${scene.surfaces.length})`,
            children: <SurfacePanel />,
          },
          {
            key: 'scene',
            label: 'Сцена',
            children: <SceneSettings />,
          },
        ]}
      />
    </div>
  );
}

function LicensePanel() {
  const { message } = App.useApp();
  const { licenses, addLicenses, updateLicense, removeLicense } = useScene();
  const [defaultElevation, setDefaultElevation] = useState(0);
  const [name, setName] = useState('Новая лицензия');
  const [color, setColor] = useState(paletteColor(0));
  const [elevation, setElevation] = useState(0);
  const [paste, setPaste] = useState('');
  const [geojsonOpen, setGeojsonOpen] = useState(false);
  const [geojsonText, setGeojsonText] = useState('');
  const [vertices, setVertices] = useState(() => emptyVertices());

  const accept = (text: string) => {
    const document = parseGeoJsonDocument(text);
    const parsed = licensesFromFeatures(document.features, {
      defaultElevation,
      startIndex: licenses.length,
    });
    if (document.axisOrder === 'latlon') {
      parsed.warnings.unshift(
        'Координаты выглядели как широта, долгота и переставлены в порядок WGS84',
      );
    }
    if (!parsed.licenses.length) {
      throw new Error('В GeoJSON нет полигона или линии из трёх и более вершин');
    }
    addLicenses(parsed.licenses);
    parsed.warnings.forEach(warning => message.warning(warning));
    message.success(`Контуров: ${parsed.licenses.length}`);
  };

  const addManual = () => {
    const outer = vertices.flatMap(vertex =>
      vertex.lon === null || vertex.lat === null
        ? []
        : ([[vertex.lon, vertex.lat]] as [number, number][]),
    );
    if (outer.length < 3) {
      message.warning('Для контура нужны минимум три вершины');
      return;
    }
    const license: LicenseContour = {
      id: crypto.randomUUID(),
      name: name.trim() || `Лицензия ${licenses.length + 1}`,
      color,
      elevation,
      visible: true,
      polygons: [{ outer, holes: [] }],
    };
    addLicenses([license]);
    setName(`Лицензия ${licenses.length + 2}`);
    setColor(paletteColor(licenses.length + 1));
    setVertices(emptyVertices());
    setPaste('');
    message.success('Контур добавлен');
  };

  const applyPaste = () => {
    try {
      const points = parseCoordinateList(paste);
      if (points.length < 3) {
        message.warning('Нужно минимум три пары долгота, широта');
        return;
      }
      setVertices(
        points.map(([lon, lat]) => ({
          id: crypto.randomUUID(),
          lon,
          lat,
        })),
      );
    } catch (error) {
      message.error(errorText(error));
    }
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space wrap>
        <Upload
          accept=".json,.geojson,application/geo+json"
          showUploadList={false}
          beforeUpload={file => {
            void file.text().then(
              text => {
                try {
                  accept(text);
                } catch (error) {
                  message.error(errorText(error));
                }
              },
              () => message.error('Не удалось прочитать файл'),
            );
            return false;
          }}
        >
          <Button icon={<UploadOutlined />}>GeoJSON</Button>
        </Upload>
        <Button onClick={() => setGeojsonOpen(true)}>Вставить GeoJSON</Button>
      </Space>
      <Space>
        <Typography.Text>Отметка новых контуров, м</Typography.Text>
        <InputNumber
          value={defaultElevation}
          onChange={value => {
            if (typeof value === 'number') setDefaultElevation(value);
          }}
        />
      </Space>
      {licenses.map(license => (
        <div key={license.id} className="item-card">
          <div className="item-head">
            <Input
              value={license.name}
              variant="borderless"
              onChange={event =>
                updateLicense(license.id, { name: event.target.value })
              }
            />
            <Switch
              checked={license.visible}
              onChange={visible => updateLicense(license.id, { visible })}
            />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeLicense(license.id)}
            />
          </div>
          <Space>
            <ColorPicker
              size="small"
              value={license.color}
              onChange={next =>
                updateLicense(license.id, { color: next.toHexString() })
              }
            />
            <Typography.Text type="secondary">Отметка, м</Typography.Text>
            <InputNumber
              size="small"
              value={license.elevation}
              onChange={value => {
                if (typeof value === 'number') {
                  updateLicense(license.id, { elevation: value });
                }
              }}
            />
          </Space>
          <Typography.Text type="secondary">
            {license.polygons.length} пол. ·{' '}
            {license.polygons.reduce((sum, polygon) => sum + polygon.outer.length, 0)}{' '}
            вершин
          </Typography.Text>
        </div>
      ))}
      <Typography.Text strong>Задать контур вершинами</Typography.Text>
      {vertices.map((vertex, index) => (
        <Space key={vertex.id}>
          <Typography.Text type="secondary">{index + 1}</Typography.Text>
          <InputNumber
            placeholder="Долгота"
            value={vertex.lon}
            step={0.0001}
            onChange={value =>
              setVertices(current =>
                current.map(item =>
                  item.id === vertex.id
                    ? { ...item, lon: typeof value === 'number' ? value : null }
                    : item,
                ),
              )
            }
          />
          <InputNumber
            placeholder="Широта"
            value={vertex.lat}
            step={0.0001}
            onChange={value =>
              setVertices(current =>
                current.map(item =>
                  item.id === vertex.id
                    ? { ...item, lat: typeof value === 'number' ? value : null }
                    : item,
                ),
              )
            }
          />
          <Button
            type="text"
            icon={<DeleteOutlined />}
            disabled={vertices.length <= 3}
            onClick={() =>
              setVertices(current => current.filter(item => item.id !== vertex.id))
            }
          />
        </Space>
      ))}
      <Space wrap>
        <Button
          onClick={() =>
            setVertices(current => [
              ...current,
              { id: crypto.randomUUID(), lon: null, lat: null },
            ])
          }
        >
          Вершина
        </Button>
        <Input
          style={{ width: 160 }}
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Название"
        />
        <ColorPicker
          value={color}
          onChange={next => setColor(next.toHexString())}
        />
        <InputNumber
          value={elevation}
          onChange={value => {
            if (typeof value === 'number') setElevation(value);
          }}
        />
        <Button type="primary" onClick={addManual}>
          Добавить
        </Button>
      </Space>
      <Input.TextArea
        rows={3}
        value={paste}
        placeholder={'73.30 61.20\n73.48 61.20\n73.42 61.30'}
        onChange={event => setPaste(event.target.value)}
      />
      <Button onClick={applyPaste}>Разобрать координаты в таблицу</Button>
      <Modal
        title="GeoJSON контура"
        open={geojsonOpen}
        onCancel={() => setGeojsonOpen(false)}
        onOk={() => {
          try {
            accept(geojsonText);
            setGeojsonOpen(false);
            setGeojsonText('');
          } catch (error) {
            message.error(errorText(error));
          }
        }}
        okText="Загрузить"
      >
        <Input.TextArea
          rows={10}
          value={geojsonText}
          onChange={event => setGeojsonText(event.target.value)}
        />
      </Modal>
    </Space>
  );
}

function emptyVertices() {
  return [0, 1, 2].map(() => ({
    id: crypto.randomUUID(),
    lon: null as number | null,
    lat: null as number | null,
  }));
}

function WellPanel() {
  const { message } = App.useApp();
  const { wells, addWells, updateWell, removeWell, focusWell } = useScene();
  const [name, setName] = useState('');
  const [longitude, setLongitude] = useState<number | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [rotaryElevation, setRotaryElevation] = useState(0);

  const accept = (text: string) => {
    const document = parseGeoJsonDocument(text);
    const parsed = wellsFromFeatures(document.features, {
      startIndex: wells.length,
    });
    if (document.axisOrder === 'latlon') {
      parsed.warnings.unshift(
        'Координаты выглядели как широта, долгота и переставлены в порядок WGS84',
      );
    }
    if (!parsed.wells.length) {
      throw new Error('В GeoJSON нет точек устьев');
    }
    addWells(parsed.wells);
    parsed.warnings.forEach(warning => message.warning(warning));
    message.success(`Устьев: ${parsed.wells.length}`);
  };

  const addManual = () => {
    if (
      longitude === null ||
      latitude === null ||
      Math.abs(longitude) > 180 ||
      Math.abs(latitude) > 90
    ) {
      message.warning('Укажите долготу и широту в диапазоне WGS84');
      return;
    }
    addWells([
      {
        id: crypto.randomUUID(),
        name: name.trim() || `Скважина ${wells.length + 1}`,
        longitude,
        latitude,
        rotaryElevation,
        visible: true,
      },
    ]);
    setName('');
    message.success('Устье добавлено');
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Upload
        accept=".json,.geojson,application/geo+json"
        showUploadList={false}
        beforeUpload={file => {
          void file.text().then(
            text => {
              try {
                accept(text);
              } catch (error) {
                message.error(errorText(error));
              }
            },
            () => message.error('Не удалось прочитать файл'),
          );
          return false;
        }}
      >
        <Button icon={<UploadOutlined />}>GeoJSON устьев</Button>
      </Upload>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Амплитуда ротора — альтитуда стола ротора, м. В свойствах точки ищутся
        поля амплитуда_ротора, альтитуда_ротора, kb, rotaryElevation или z.
      </Typography.Paragraph>
      {wells.map(well => (
        <div key={well.id} className="item-card">
          <div className="item-head">
            <Input
              value={well.name}
              variant="borderless"
              onChange={event => updateWell(well.id, { name: event.target.value })}
            />
            <Switch
              checked={well.visible}
              onChange={visible => updateWell(well.id, { visible })}
            />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeWell(well.id)}
            />
          </div>
          <Typography.Text type="secondary">
            {well.longitude.toFixed(5)}°, {well.latitude.toFixed(5)}°
          </Typography.Text>
          <Space>
            <Typography.Text>Амплитуда ротора, м</Typography.Text>
            <InputNumber
              size="small"
              value={well.rotaryElevation}
              step={0.1}
              onChange={value => {
                if (typeof value === 'number') {
                  updateWell(well.id, { rotaryElevation: value });
                }
              }}
            />
          </Space>
          <Button type="link" size="small" onClick={() => focusWell(well.id)}>
            Показать в сцене
          </Button>
        </div>
      ))}
      <Typography.Text strong>Задать устье</Typography.Text>
      <Input
        placeholder="Название"
        value={name}
        onChange={event => setName(event.target.value)}
      />
      <Space wrap>
        <InputNumber
          placeholder="Долгота"
          value={longitude}
          step={0.0001}
          onChange={value => setLongitude(typeof value === 'number' ? value : null)}
        />
        <InputNumber
          placeholder="Широта"
          value={latitude}
          step={0.0001}
          onChange={value => setLatitude(typeof value === 'number' ? value : null)}
        />
        <InputNumber
          placeholder="Амплитуда ротора"
          value={rotaryElevation}
          step={0.1}
          onChange={value => {
            if (typeof value === 'number') setRotaryElevation(value);
          }}
        />
        <Button type="primary" onClick={addManual}>
          Добавить
        </Button>
      </Space>
    </Space>
  );
}

function SurfacePanel() {
  const { message } = App.useApp();
  const { surfaces, addSurface, updateSurface, removeSurface } = useScene();

  const accept = (text: string, filename: string) => {
    const grid = parseEsriAsciiGrid(text);
    const layer: SurfaceLayer = {
      id: crypto.randomUUID(),
      name: filename.replace(/\.[^.]+$/, '') || `Поверхность ${surfaces.length + 1}`,
      color: paletteColor(surfaces.length + 2),
      opacity: 0.92,
      visible: true,
      depthPositiveDown: false,
      wireframe: false,
      useColorRamp: true,
      grid,
    };
    addSurface(layer);
    const extent = gridExtent(grid);
    message.success(
      `${layer.name}: ${grid.ncols}×${grid.nrows}, ${extent.west.toFixed(3)}…${extent.east.toFixed(3)}° в.д.`,
    );
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Upload
        accept=".asc,.grd,.txt,.ascii"
        showUploadList={false}
        beforeUpload={file => {
          void file.text().then(
            text => {
              try {
                accept(text, file.name);
              } catch (error) {
                message.error(errorText(error));
              }
            },
            () => message.error('Не удалось прочитать файл'),
          );
          return false;
        }}
      >
        <Button icon={<UploadOutlined />}>ESRI ASCII Grid</Button>
      </Upload>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        Заголовок ncols, nrows, xllcorner или xllcenter, yllcorner или
        yllcenter, cellsize. Координаты углов — градусы WGS84, значения —
        отметки в метрах.
      </Typography.Paragraph>
      {surfaces.map(surface => {
        const stats = gridValueStats(surface.grid, surface.depthPositiveDown);
        const stride = displayStride(surface.grid.ncols, surface.grid.nrows);
        return (
          <div key={surface.id} className="item-card">
            <div className="item-head">
              <Input
                value={surface.name}
                variant="borderless"
                onChange={event =>
                  updateSurface(surface.id, { name: event.target.value })
                }
              />
              <Switch
                checked={surface.visible}
                onChange={visible => updateSurface(surface.id, { visible })}
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeSurface(surface.id)}
              />
            </div>
            <Typography.Text type="secondary">
              {surface.grid.ncols}×{surface.grid.nrows} · {stats.min.toFixed(1)}…
              {stats.max.toFixed(1)} м
              {stride > 1 ? ` · шаг отображения ×${stride}` : ''}
            </Typography.Text>
            <Space>
              <ColorPicker
                size="small"
                value={surface.color}
                onChange={next =>
                  updateSurface(surface.id, { color: next.toHexString() })
                }
              />
              <Typography.Text>Непрозрачность</Typography.Text>
            </Space>
            <Slider
              min={0.05}
              max={1}
              step={0.05}
              value={surface.opacity}
              onChange={opacity => updateSurface(surface.id, { opacity })}
            />
            <Space direction="vertical" size={4}>
              <Space>
                <Switch
                  checked={surface.depthPositiveDown}
                  onChange={depthPositiveDown =>
                    updateSurface(surface.id, { depthPositiveDown })
                  }
                />
                <span>Значения — глубина (вниз)</span>
              </Space>
              <Space>
                <Switch
                  checked={surface.useColorRamp}
                  onChange={useColorRamp =>
                    updateSurface(surface.id, { useColorRamp })
                  }
                />
                <span>Шкала по отметке</span>
              </Space>
              <Space>
                <Switch
                  checked={surface.wireframe}
                  onChange={wireframe => updateSurface(surface.id, { wireframe })}
                />
                <span>Каркас</span>
              </Space>
            </Space>
          </div>
        );
      })}
    </Space>
  );
}

function SceneSettings() {
  const {
    exaggeration,
    showVolume,
    showGrid,
    showLabels,
    setExaggeration,
    setShowVolume,
    setShowGrid,
    setShowLabels,
  } = useScene();

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div>
        <Typography.Text>Вертикальное преувеличение ×{exaggeration}</Typography.Text>
        <Slider min={1} max={30} value={exaggeration} onChange={setExaggeration} />
      </div>
      <Space>
        <Switch checked={showVolume} onChange={setShowVolume} />
        <span>Объём лицензии до подошвы</span>
      </Space>
      <Space>
        <Switch checked={showGrid} onChange={setShowGrid} />
        <span>Сетка на уровне моря</span>
      </Space>
      <Space>
        <Switch checked={showLabels} onChange={setShowLabels} />
        <span>Подписи устьев</span>
      </Space>
    </Space>
  );
}
