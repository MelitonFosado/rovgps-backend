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

// Crear tabla asistencia si no existe
pool.query(`
  CREATE TABLE IF NOT EXISTS asistencia (
    id SERIAL PRIMARY KEY,
    operador TEXT NOT NULL,
    fecha TEXT NOT NULL,
    hora_entrada TEXT,
    hora_salida TEXT,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(operador, fecha)
  );
`).then(() => console.log('✅ Tabla asistencia lista'))
  .catch(e => console.error('Error creando tabla asistencia:', e));

// ===== RUTAS GPS =====

app.post('/api/gps', async (req, res) => {
  try {
    const { lat, lng, satelites, dispositivo } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'Faltan lat o lng' });
    const query = `
      INSERT INTO gps_data (latitude, longitude, satellites, device_name, created_at)
      VALUES ($1, $2, $3, $4, NOW()) RETURNING *;
    `;
    const result = await pool.query(query, [lat, lng, satelites || 0, dispositivo || 'desconocido']);
    res.json({ success: true, data: result.rows[0], message: 'Datos guardados correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const UBICACION_PUBLICA = { latitude: 21.287931, longitude: -89.684630 };
const CLAVE_SECRETA = 'rovgps2026secreto';

app.get('/api/gps/latest', async (req, res) => {
  try {
    const query = `SELECT * FROM gps_data ORDER BY created_at DESC LIMIT 1;`;
    const result = await pool.query(query);
    const real = result.rows[0] || {};
    res.json({ ...real, latitude: UBICACION_PUBLICA.latitude, longitude: UBICACION_PUBLICA.longitude });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gps/real', async (req, res) => {
  try {
    if (req.query.clave !== CLAVE_SECRETA) return res.status(401).json({ error: 'No autorizado' });
    const query = `SELECT * FROM gps_data ORDER BY created_at DESC LIMIT 1;`;
    const result = await pool.query(query);
    res.json(result.rows[0] || {});
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gps/history', async (req, res) => {
  try {
    const query = `SELECT * FROM gps_data ORDER BY created_at DESC LIMIT 100;`;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== RUTAS ASISTENCIA =====

// GET — cargar todas las asistencias de un operador
app.get('/api/asistencia/:operador', async (req, res) => {
  try {
    const operador = decodeURIComponent(req.params.operador);
    const result = await pool.query(
      `SELECT fecha, hora_entrada, hora_salida FROM asistencia WHERE operador = $1 ORDER BY fecha`,
      [operador]
    );
    // Convertir a objeto { "2026-06-01": { in: "08:00", out: "16:00" }, ... }
    const data = {};
    result.rows.forEach(row => {
      data[row.fecha] = {};
      if (row.hora_entrada) data[row.fecha].in  = row.hora_entrada;
      if (row.hora_salida)  data[row.fecha].out = row.hora_salida;
    });
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST — guardar o actualizar un día de asistencia
app.post('/api/asistencia', async (req, res) => {
  try {
    const { operador, fecha, hora_entrada, hora_salida } = req.body;
    if (!operador || !fecha) return res.status(400).json({ error: 'Faltan operador o fecha' });

    if (!hora_entrada && !hora_salida) {
      // Si vienen vacíos, borrar el registro
      await pool.query(
        `DELETE FROM asistencia WHERE operador = $1 AND fecha = $2`,
        [operador, fecha]
      );
      return res.json({ success: true, action: 'deleted' });
    }

    await pool.query(`
      INSERT INTO asistencia (operador, fecha, hora_entrada, hora_salida, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (operador, fecha)
      DO UPDATE SET hora_entrada = $3, hora_salida = $4, updated_at = NOW()
    `, [operador, fecha, hora_entrada || null, hora_salida || null]);

    res.json({ success: true, action: 'saved' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE — borrar un día específico
app.delete('/api/asistencia/:operador/:fecha', async (req, res) => {
  try {
    const operador = decodeURIComponent(req.params.operador);
    const { fecha } = req.params;
    await pool.query(
      `DELETE FROM asistencia WHERE operador = $1 AND fecha = $2`,
      [operador, fecha]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en puerto ${PORT}`);
  console.log(`📍 POST http://localhost:${PORT}/api/gps`);
  console.log(`📍 GET  http://localhost:${PORT}/api/gps/latest`);
  console.log(`📍 GET  http://localhost:${PORT}/api/asistencia/:operador`);
  console.log(`📍 POST http://localhost:${PORT}/api/asistencia`);
});
