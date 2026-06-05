require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function test() {
  try {
    const result = await pool.query('SELECT * FROM gps_data LIMIT 1;');
    console.log('✅ Conexión OK. Tabla encontrada.');
    console.log('Resultado:', result.rows);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

test();