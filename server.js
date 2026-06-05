require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Conexión a base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// ===== RUTAS =====

// Ruta para recibir datos del ESP32
app.post('/api/gps', async (req, res) => {
  try {
    const { lat, lng, satelites, dispositivo } = req.body;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Faltan lat o lng' });
    }

    // Guardar en la base de datos
    const query = `
      INSERT INTO gps_data (latitude, longitude, satellites, device_name, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *;
    `;
    
    const result = await pool.query(query, [lat, lng, satelites || 0, dispositivo || 'desconocido']);
    
    res.json({ 
      success: true, 
      data: result.rows[0],
      message: 'Datos guardados correctamente'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ruta para obtener el último dato GPS
// Coordenadas fijas públicas (Estación Naval Paraíso) - por seguridad
const UBICACION_PUBLICA = {
  latitude: 21.425419,
  longitude: -89.566827
};

// Clave secreta para acceso a datos reales (cámbiala por la que quieras)
const CLAVE_SECRETA = 'rovgps2026secreto';

// Ruta PÚBLICA: siempre devuelve la ubicación fija (Estación Naval)
app.get('/api/gps/latest', async (req, res) => {
  try {
    const query = `SELECT * FROM gps_data ORDER BY created_at DESC LIMIT 1;`;
    const result = await pool.query(query);
    const real = result.rows[0] || {};

    // Devolvemos los datos pero con la ubicación FIJA por seguridad
    res.json({
      ...real,
      latitude: UBICACION_PUBLICA.latitude,
      longitude: UBICACION_PUBLICA.longitude
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ruta PRIVADA: devuelve la ubicación REAL (solo con clave secreta)
app.get('/api/gps/real', async (req, res) => {
  try {
    if (req.query.clave !== CLAVE_SECRETA) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const query = `SELECT * FROM gps_data ORDER BY created_at DESC LIMIT 1;`;
    const result = await pool.query(query);
    res.json(result.rows[0] || {});
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ruta para obtener historial de los últimos 100 puntos
app.get('/api/gps/history', async (req, res) => {
  try {
    const query = `
      SELECT * FROM gps_data 
      ORDER BY created_at DESC 
      LIMIT 100;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en puerto ${PORT}`);
  console.log(`📍 POST http://localhost:${PORT}/api/gps`);
  console.log(`📍 GET http://localhost:${PORT}/api/gps/latest`);
});

