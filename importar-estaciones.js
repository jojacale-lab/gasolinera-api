require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const GOOGLE_API_KEY = 'AIzaSyAOzuKsAWoBLZTZqF6isY94OGL18JbKMbk';

const CIUDADES = [
  { nombre: 'Bucaramanga',   lat: 7.1193,  lng: -73.1227 },
  { nombre: 'Floridablanca', lat: 7.0626,  lng: -73.0852 },
  { nombre: 'Girón',         lat: 7.0731,  lng: -73.1680 },
  { nombre: 'Piedecuesta',   lat: 6.9858,  lng: -73.0503 },
];

async function buscarEstaciones(lat, lng, pagetoken = null) {
  const params = {
    location: `${lat},${lng}`,
    radius: 5000,
    type: 'gas_station',
    key: GOOGLE_API_KEY,
    language: 'es',
  };
  if (pagetoken) params.pagetoken = pagetoken;
  const url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
  const res = await axios.get(url, { params });
  return res.data;
}

async function guardarEstacion(place, ciudad) {
  const { name, vicinity, geometry } = place;
  const lat = geometry.location.lat;
  const lng = geometry.location.lng;

  const { data: existe } = await supabase
    .from('estaciones')
    .select('id')
    .eq('nombre', name)
    .single();

  if (existe) {
    console.log(`  Ya existe: ${name}`);
    return;
  }

  const { error } = await supabase
    .from('estaciones')
    .insert({
      nombre:       name,
      direccion:    vicinity,
      ciudad:       ciudad,
      departamento: 'Santander',
      activa:       true,
      ubicacion:    `POINT(${lng} ${lat})`,
    });

  if (error) console.log(`  Error: ${name} - ${error.message}`);
  else console.log(`  ✅ Guardada: ${name}`);
}

async function importar() {
  console.log('🚀 Iniciando importación de estaciones...\n');

  for (const ciudad of CIUDADES) {
    console.log(`📍 Buscando en ${ciudad.nombre}...`);
    
    let data = await buscarEstaciones(ciudad.lat, ciudad.lng);
console.log(`  Encontradas: ${data.results.length} estaciones`);
console.log(`  Status: ${data.status}`);
    
    for (const place of data.results) {
      await guardarEstacion(place, ciudad.nombre);
    }

    while (data.next_page_token) {
      await new Promise(r => setTimeout(r, 2000));
      data = await buscarEstaciones(ciudad.lat, ciudad.lng, data.next_page_token);
      for (const place of data.results) {
        await guardarEstacion(place, ciudad.nombre);
      }
    }

    console.log(`  ✓ ${ciudad.nombre} completado\n`);
  }

  console.log('✅ Importación terminada');
}

importar().catch(console.error);