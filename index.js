require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app      = express();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(cors());
app.use(express.json());

// ── GET /api/stations ─────────────────────────────────────────
// Parámetros: lat, lng, radio (m, default 5000), combustible
// Ejemplo: /api/stations?lat=7.06&lng=-73.08&combustible=corriente
app.get('/api/stations', async (req, res) => {
  const { lat, lng, radio = 5000, combustible = 'corriente' } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat y lng son obligatorios' });
  }

  const { data, error } = await supabase.rpc('estaciones_cercanas', {
    lat:          parseFloat(lat),
    lng:          parseFloat(lng),
    radio_metros: parseInt(radio),
    combustible
  });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ stations: data, total: data.length });
});

// ── GET /api/stations/:id ─────────────────────────────────────
// Detalle completo de una estación con todos sus precios vigentes
app.get('/api/stations/:id', async (req, res) => {
  const { id } = req.params;

  const [estacion, precios] = await Promise.all([
    supabase.from('estaciones').select('*').eq('id', id).single(),
    supabase.from('precios_vigentes').select('*').eq('estacion_id', id)
  ]);

  if (estacion.error) return res.status(404).json({ error: 'Estación no encontrada' });

  res.json({ ...estacion.data, precios: precios.data });
});

// ── POST /api/reports ─────────────────────────────────────────
// El usuario reporta un precio que vio en la estación
// Body: { estacion_id, tipo_combustible, precio_reportado, nota? }
app.post('/api/reports', async (req, res) => {
  const { estacion_id, tipo_combustible, precio_reportado, nota } = req.body;

  if (!estacion_id || !tipo_combustible || !precio_reportado) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const { data, error } = await supabase
    .from('reportes')
    .insert({ estacion_id, tipo_combustible, precio_reportado, nota })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  res.status(201).json(data);
});

// ── GET /api/prices/history/:stationId ───────────────────────
// Historial de precios de los últimos 30 días (para gráfica)
app.get('/api/prices/history/:stationId', async (req, res) => {
  const { stationId } = req.params;
  const { combustible = 'corriente' } = req.query;

  const hace30dias = new Date();
  hace30dias.setDate(hace30dias.getDate() - 30);

  const { data, error } = await supabase
    .from('precios')
    .select('precio_galon, registrado_en, fuente')
    .eq('estacion_id', stationId)
    .eq('tipo_combustible', combustible)
    .gte('registrado_en', hace30dias.toISOString())
    .order('registrado_en', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ history: data });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API de Gasolinera corriendo en http://localhost:${PORT}`);
});
