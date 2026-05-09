import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import pg from "pg";

const SECRET_KEY = "roadtrack-super-secret";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://roaduser:roadpass123@localhost:5432/roadtrack",
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

// Initialize Database
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ruas_jalan (
      id SERIAL PRIMARY KEY,
      no_ruas TEXT UNIQUE NOT NULL,
      nama_jalan TEXT NOT NULL,
      ppk TEXT,
      panjang_km DOUBLE PRECISION
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS segmen_jalan (
      id SERIAL PRIMARY KEY,
      ruas_id INTEGER REFERENCES ruas_jalan(id),
      segment_id TEXT UNIQUE,
      sta_awal DOUBLE PRECISION,
      sta_akhir DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      latitude DOUBLE PRECISION
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annual_data (
      id SERIAL PRIMARY KEY,
      segmen_id INTEGER REFERENCES segmen_jalan(id),
      tahun TEXT NOT NULL,
      iri DOUBLE PRECISION,
      treatment TEXT DEFAULT 'NONE',
      UNIQUE(segmen_id, tahun)
    )
  `);

  // Seed Admin User (admin@roadtrack.id / sibusibu)
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", ["admin@roadtrack.id"]);
  const hash = bcrypt.hashSync("sibusibu", 10);
  if (rows.length === 0) {
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)",
      ["Super Admin", "admin@roadtrack.id", hash, "superadmin"]
    );
  } else {
    await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2", [hash, "admin@roadtrack.id"]);
  }
}

async function startServer() {
  await initDatabase();

  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [username]);
    const user = rows[0];
    
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ detail: "Email atau password salah" });
    }

    const token = jwt.sign({ sub: user.id, role: user.role, name: user.name }, SECRET_KEY, { expiresIn: "8h" });
    res.json({
      access_token: token,
      token_type: "bearer",
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  });

  app.get("/api/dashboard/summary", async (req, res) => {
    const totalRuas = (await pool.query("SELECT COUNT(*) as count FROM ruas_jalan")).rows[0];
    const totalPanjang = (await pool.query("SELECT SUM(panjang_km) as sum FROM ruas_jalan")).rows[0];
    const totalSegmen = (await pool.query("SELECT COUNT(*) as count FROM segmen_jalan")).rows[0];
    
    // Get latest available year
    const lastYearRow = (await pool.query("SELECT MAX(tahun) as year FROM annual_data")).rows[0];
    const lastYear = lastYearRow?.year ? String(lastYearRow.year) : null;
    
    const condition = lastYear 
      ? (await pool.query("SELECT COUNT(*) as count FROM annual_data WHERE tahun = $1 AND iri <= 4", [lastYear])).rows[0]
      : { count: 0 };

    res.json({
      total_ruas: parseInt(totalRuas.count),
      total_panjang_km: parseFloat(totalPanjang.sum) || 0,
      baik: parseInt(condition.count),
      total_segmen: parseInt(totalSegmen.count),
      pct_mantap: parseInt(totalSegmen.count) > 0 ? (parseInt(condition.count) / parseInt(totalSegmen.count) * 100).toFixed(1) : 0,
      reporting_year: lastYear || "-"
    });
  });

  app.post("/api/import/save", async (req, res) => {
    const { data } = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ detail: "Data harus berupa array" });

    // --- 1. FUNGSI HELPER & PEMETAAN KOLOM ---
    const mapping = {
      noRuas: ["NO RUAS", "NO. RUAS", "No Ruas", "no_ruas"],
      namaJalan: ["NAMA RUAS JALAN", "Nama Jalan", "nama_jalan"],
      ppk: ["PPK", "Nama PPK", "ppk"],
      staAwal: ["STA AWAL", "Sta Awal", "sta_awal"],
      staAkhir: ["STA AKHIR", "Sta Akhir", "sta_akhir"],
      lon: ["LONGITUDE", "Longitude", "X", "Bujur", "Bujur (X)"],
      lat: ["LATITUDE", "Latitude", "Y", "Lintang", "Lintang (Y)"],
      iri: ["IRI", "Nilai IRI", "iri"],
      treatment: ["PENANGANAN", "Treatment", "Program", "treatment"]
    };

    const getVal = (item: any, keys: string[]) => {
      for (const key of keys) {
        if (item[key] !== undefined && item[key] !== null && item[key] !== "") {
          return item[key];
        }
      }
      return null;
    };

    const parseNum = (val: any) => {
      if (!val) return 0;
      const num = parseFloat(String(val).replace(/,/g, '.'));
      return isNaN(num) ? 0 : num;
    };

    const client = await pool.connect();
    
    try {
      await client.query("BEGIN");

      // --- 2. KONSOLIDASI DATA (IN-MEMORY) ---
      const ruasData = new Map(); 
      const segmenData = new Map(); 
      const annualData = new Map(); 

      for (const item of data) {
        const noRuas = String(getVal(item, mapping.noRuas) || "").trim();
        const namaJalan = String(getVal(item, mapping.namaJalan) || "").trim();
        const ppk = String(getVal(item, mapping.ppk) || "").trim();
        
        const staAwal = parseNum(getVal(item, mapping.staAwal));
        const staAkhir = parseNum(getVal(item, mapping.staAkhir));
        
        const lon = parseNum(getVal(item, mapping.lon));
        const lat = parseNum(getVal(item, mapping.lat));
        
        const iri = parseNum(getVal(item, mapping.iri));
        const treatment = String(getVal(item, mapping.treatment) || "NONE").trim();

        // Parameter tahun diasumsikan dikirim dari klien atau diset default ke 2025
        const tahun = req.body.tahun || "2025"; 
        const segmentId = `${noRuas}_${staAwal}_${staAkhir}`;

        // Validasi minimum: Nomor ruas harus ada
        if (!noRuas || noRuas === "" || segmentId === "_0_0") continue;

        ruasData.set(noRuas, { namaJalan, ppk });
        segmenData.set(segmentId, { noRuas, staAwal, staAkhir, lon, lat });
        annualData.set(`${segmentId}_${tahun}`, { segmentId, tahun, iri, treatment });
      }

      // --- 3. BULK UPSERT: RUAS JALAN ---
      const ruasNoArr: string[] = [], ruasNamaArr: string[] = [], ruasPpkArr: string[] = [];
      ruasData.forEach((val, key) => {
        ruasNoArr.push(key); ruasNamaArr.push(val.namaJalan); ruasPpkArr.push(val.ppk);
      });

      if (ruasNoArr.length > 0) {
        await client.query(`
          INSERT INTO ruas_jalan (no_ruas, nama_jalan, ppk)
          SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[]) AS t(no_ruas, nama_jalan, ppk)
          ON CONFLICT(no_ruas) DO UPDATE SET
            nama_jalan = COALESCE(EXCLUDED.nama_jalan, ruas_jalan.nama_jalan),
            ppk = COALESCE(EXCLUDED.ppk, ruas_jalan.ppk)
        `, [ruasNoArr, ruasNamaArr, ruasPpkArr]);
      }

      // --- 4. BULK UPSERT: SEGMEN JALAN ---
      const segIdArr: string[] = [], segNoRuasArr: string[] = [], segStaAwalArr: number[] = [];
      const segStaAkhirArr: number[] = [], segLonArr: number[] = [], segLatArr: number[] = [];
      
      segmenData.forEach((val, key) => {
        segIdArr.push(key); segNoRuasArr.push(val.noRuas); 
        segStaAwalArr.push(val.staAwal); segStaAkhirArr.push(val.staAkhir);
        segLonArr.push(val.lon); segLatArr.push(val.lat);
      });

      if (segIdArr.length > 0) {
        await client.query(`
          INSERT INTO segmen_jalan (ruas_id, segment_id, sta_awal, sta_akhir, longitude, latitude)
          SELECT r.id, t.segment_id, t.sta_awal, t.sta_akhir, t.longitude, t.latitude
          FROM UNNEST($1::text[], $2::text[], $3::float8[], $4::float8[], $5::float8[], $6::float8[]) 
            AS t(segment_id, no_ruas, sta_awal, sta_akhir, longitude, latitude)
          JOIN ruas_jalan r ON r.no_ruas = t.no_ruas
          ON CONFLICT(segment_id) DO UPDATE SET
            sta_awal = EXCLUDED.sta_awal,
            sta_akhir = EXCLUDED.sta_akhir,
            longitude = EXCLUDED.longitude,
            latitude = EXCLUDED.latitude
        `, [segIdArr, segNoRuasArr, segStaAwalArr, segStaAkhirArr, segLonArr, segLatArr]);
      }

      // --- 5. BULK UPSERT: DATA TAHUNAN (KONDISI JALAN) ---
      const annSegIdArr: string[] = [], annTahunArr: string[] = [], annIriArr: number[] = [], annTreatmentArr: string[] = [];
      
      annualData.forEach((val) => {
        annSegIdArr.push(val.segmentId); annTahunArr.push(val.tahun);
        annIriArr.push(val.iri); annTreatmentArr.push(val.treatment);
      });

      if (annSegIdArr.length > 0) {
        await client.query(`
          INSERT INTO annual_data (segmen_id, tahun, iri, treatment)
          SELECT s.id, t.tahun, t.iri, t.treatment
          FROM UNNEST($1::text[], $2::text[], $3::float8[], $4::text[]) 
            AS t(segment_id, tahun, iri, treatment)
          JOIN segmen_jalan s ON s.segment_id = t.segment_id
          ON CONFLICT(segmen_id, tahun) DO UPDATE SET
            iri = EXCLUDED.iri,
            treatment = EXCLUDED.treatment
        `, [annSegIdArr, annTahunArr, annIriArr, annTreatmentArr]);
      }

      // --- 6. PENYELESAIAN TRANSAKSI ---
      await client.query("COMMIT");
      res.json({ success: true, count: data.length });

    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Kesalahan Import Batch:", error);
      res.status(500).json({ detail: "Gagal memproses data. Terdapat kesalahan pada eksekusi basis data." });
    } finally {
      client.release();
    }
  });

  app.get("/api/ruas/all", async (req, res) => {
    const { rows: ruas } = await pool.query("SELECT * FROM ruas_jalan");
    const result = await Promise.all(ruas.map(async (r: any) => {
      const { rows: segments } = await pool.query(
        "SELECT * FROM segmen_jalan WHERE ruas_id = $1 ORDER BY sta_awal ASC", [r.id]
      );
      const segmentsWithData = await Promise.all(segments.map(async (s: any) => {
        const { rows: annuals } = await pool.query(
          "SELECT tahun, iri, treatment FROM annual_data WHERE segmen_id = $1", [s.id]
        );
        const yearsData: any = {};
        annuals.forEach((a: any) => {
          yearsData[a.tahun] = { iri: a.iri, treatment: a.treatment };
        });
        return { ...s, ...yearsData };
      }));
      return { ...r, segments: segmentsWithData };
    }));
    res.json(result);
  });

  app.get("/api/segmen/search", async (req, res) => {
    const { query } = req.query;
    if (!query) return res.json([]);
    
    const pattern = `%${query}%`;
    const { rows } = await pool.query(`
      SELECT s.*, r.no_ruas, r.nama_jalan, r.ppk 
      FROM segmen_jalan s 
      JOIN ruas_jalan r ON r.id = s.ruas_id 
      WHERE s.segment_id ILIKE $1 OR r.no_ruas ILIKE $2 OR r.nama_jalan ILIKE $3
      LIMIT 10
    `, [pattern, pattern, pattern]);
    
    res.json(rows);
  });

  app.post("/api/segmen/update-manual", async (req, res) => {
    const { 
      id, no_ruas, nama_jalan, ppk, segment_id, 
      sta_awal, sta_akhir, longitude, latitude, iri_value, treatment, tahun 
    } = req.body;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Update Road Info
      await client.query(
        "UPDATE ruas_jalan SET no_ruas = $1, nama_jalan = $2, ppk = $3 WHERE no_ruas = $4",
        [no_ruas, nama_jalan, ppk, no_ruas]
      );

      // Update Segment Info
      await client.query(`
        UPDATE segmen_jalan SET 
          segment_id = $1, sta_awal = $2, sta_akhir = $3, 
          longitude = $4, latitude = $5
        WHERE id = $6
      `, [segment_id, sta_awal, sta_akhir, longitude, latitude, id]);

      // Update or Insert Annual Data
      if (tahun) {
        const cleanTahun = String(tahun);
        if (iri_value !== undefined && treatment !== undefined) {
          await client.query(`
            INSERT INTO annual_data (segmen_id, tahun, iri, treatment)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT(segmen_id, tahun) DO UPDATE SET iri = EXCLUDED.iri, treatment = EXCLUDED.treatment
          `, [id, cleanTahun, parseFloat(iri_value), treatment]);
        } else if (iri_value !== undefined) {
          await client.query(`
            INSERT INTO annual_data (segmen_id, tahun, iri)
            VALUES ($1, $2, $3)
            ON CONFLICT(segmen_id, tahun) DO UPDATE SET iri = EXCLUDED.iri
          `, [id, cleanTahun, parseFloat(iri_value)]);
        } else if (treatment !== undefined) {
          await client.query(`
            INSERT INTO annual_data (segmen_id, tahun, treatment)
            VALUES ($1, $2, $3)
            ON CONFLICT(segmen_id, tahun) DO UPDATE SET treatment = EXCLUDED.treatment
          `, [id, cleanTahun, treatment]);
        }
      }

      await client.query("COMMIT");
      res.json({ success: true });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(error);
      res.status(500).json({ detail: "Gagal memperbarui database" });
    } finally {
      client.release();
    }
  });

  app.post("/api/segmen/delete-multiple", async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ detail: "ID tidak valid" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      for (const id of ids) {
        await client.query("DELETE FROM annual_data WHERE segmen_id = $1", [id]);
        await client.query("DELETE FROM segmen_jalan WHERE id = $1", [id]);
      }

      await client.query("COMMIT");
      res.json({ success: true, count: ids.length });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(error);
      res.status(500).json({ detail: "Gagal menghapus data" });
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/clear-database", async (req, res) => {
    const { year } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (year) {
        await client.query("DELETE FROM annual_data WHERE tahun = $1", [String(year)]);
      } else {
        await client.query("DELETE FROM annual_data");
        await client.query("DELETE FROM segmen_jalan");
        await client.query("DELETE FROM ruas_jalan");
      }
      await client.query("COMMIT");
      res.json({ success: true, message: year ? `Data tahun ${year} berhasil dihapus` : "Database berhasil dikosongkan" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(error);
      res.status(500).json({ detail: "Gagal membersihkan database" });
    } finally {
      client.release();
    }
  });

  // Vite development middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
