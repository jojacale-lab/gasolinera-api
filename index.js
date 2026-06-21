require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app      = express();
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://lpwcekubcdwjbtxksxxa.supabase.co',
  process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxwd2Nla3ViY2R3amJ0eGtzeHhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDYxODAsImV4cCI6MjA5NzUyMjE4MH0.8Kyhyp4gjA_wTlmDpRrMv3qp6UxjTDqtaQ95lkcR1wc'
);

app.use(cors());
app.use(express.json());

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

app.get('/api/stations/:id', async (req, res) => {
  const { id } = req.params;
  const [estacion, precios] = await Promise.all([
    supabase.from('estaciones').select('*').eq('id', id).single(),
    supabase.from('precios_vigentes').select('*').eq('estacion_id', id)
  ]);
  if (estacion.error) return res.status(404).json({ error: 'No encontrada' });
  res.json({ ...estacion.data, precios: precios.data });
});

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
// GET /api/admin/stats
app.get('/api/admin/stats', async (req, res) => {
  const [estaciones, reportes] = await Promise.all([
    supabase.from('estaciones').select('id', { count: 'exact' }),
    supabase.from('reportes').select('id', { count: 'exact' }).eq('aprobado', false)
  ]);
  res.json({
    totalEstaciones:    estaciones.count,
    reportesPendientes: reportes.count,
    ultimaActualizacion: new Date().toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }),
  });
});

// POST /api/admin/update-prices
app.post('/api/admin/update-prices', async (req, res) => {
  const { precios } = req.body;
  let updated = 0;

  for (const [tipo, precio] of Object.entries(precios)) {
    const { data: estaciones } = await supabase
      .from('estaciones')
      .select('id')
      .eq('activa', true);

    if (estaciones) {
      for (const est of estaciones) {
        await supabase.from('precios').insert({
          estacion_id:      est.id,
          tipo_combustible: tipo,
          precio_galon:     parseFloat(precio),
          fuente:           'sicom',
          verificado:       true,
        });
        updated++;
      }
    }
  }

  res.json({ updated, mensaje: 'Precios actualizados correctamente' });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API de Gasolinera corriendo en http://localhost:${PORT}`);
});