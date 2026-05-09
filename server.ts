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

    const getVal = (item: any, keys: string[]) => {
      const itemKeys = Object.keys(item);
      for (const k of keys) {
        const matchingKey = itemKeys.find(ik => ik.trim().toLowerCase() === k.toLowerCase());
        if (matchingKey && item[matchingKey] !== undefined && item[matchingKey] !== null && item[matchingKey] !== "") {
          return item[matchingKey];
        }
      }
      return undefined;
    };

    const mapping = {
      noRuas: ["No. Ruas", "No Ruas", "no_ruas", "ruas_id", "ruas", "Ruas"],
      namaJalan: ["Nama Jalan", "Nama Segmen", "Segmen", "nama_jalan", "Nama", "Jalan"],
      ppk: ["PPK", "ppk", "Ppk"],
      segmentId: ["ID Segmen", "ID", "Id", "id", "Segment ID", "segment_id", "SegmenID", "No. Segmen"],
      staAwal: ["STA Awal", "STA_Awal", "sta_awal", "Awal", "STA", "sta"],
      staAkhir: ["STA Akhir", "STA_Akhir", "sta_akhir", "Akhir"],
      lat: ["Lat", "Latitude", "lat", "latitude", "Y", "y"],
      lon: ["Lon", "Longitude", "lon", "longitude", "X", "x"],
      tahun: ["Tahun", "tahun", "Year", "year", "Label", "label", "Periode", "Tahun Data"],
      iri: ["IRI", "iri", "Iri", "Kondisi", "Nilai IRI"],
      treatment: ["Treatment", "treatment", "Penanganan", "penanganan", "Jenis Penanganan", "Program", "Pekerjaan", "Rencana Penanganan", "Tipe Penanganan"]
    };

    const parseNum = (val: any) => {
      if (val === undefined || val === null || val === "") return NaN;
      if (typeof val === "number") return val;
      let str = String(val).trim();
      if (str.includes('.') && str.includes(',')) {
        if (str.indexOf('.') < str.indexOf(',')) str = str.replace(/\./g, "").replace(/,/g, ".");
        else str = str.replace(/,/g, "");
      } else if (str.includes(',')) {
        const commaCount = (str.match(/,/g) || []).length;
        if (commaCount > 1) str = str.replace(/,/g, "");
        else str = str.replace(/,/g, ".");
      } else if (str.includes('.')) {
        const dotCount = (str.match(/\./g) || []).length;
        if (dotCount > 1) str = str.replace(/\./g, "");
      }
      return parseFloat(str);
    };

    const cleanTahunLabel = (label: any) => {
        let s = String(label || "").trim();
        if (s.endsWith(".0")) s = s.slice(0, -2);
        return s || "-";
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let imported = 0;

      for (const item of data) {
        const noRuas = String(getVal(item, mapping.noRuas) || "");
        const namaJalan = String(getVal(item, mapping.namaJalan) || "Tanpa Nama");
        const ppk = String(getVal(item, mapping.ppk) || "");
        const segmentId = String(getVal(item, mapping.segmentId) || "");
        
        if (!noRuas || !segmentId) continue;

        const staAwal = parseNum(getVal(item, mapping.staAwal));
        const staAkhir = parseNum(getVal(item, mapping.staAkhir));
        const lon = parseNum(getVal(item, mapping.lon));
        const lat = parseNum(getVal(item, mapping.lat));

        await client.query(`
          INSERT INTO ruas_jalan (no_ruas, nama_jalan, ppk) 
          VALUES ($1, $2, $3)
          ON CONFLICT(no_ruas) DO UPDATE SET 
            nama_jalan = COALESCE(EXCLUDED.nama_jalan, ruas_jalan.nama_jalan),
            ppk = COALESCE(EXCLUDED.ppk, ruas_jalan.ppk)
        `, [noRuas, namaJalan, ppk]);

        const ruasRes = await client.query("SELECT id FROM ruas_jalan WHERE no_ruas = $1", [noRuas]);
        if (ruasRes.rows.length === 0) continue;
        const ruasId = ruasRes.rows[0].id;
        
        await client.query(`
          INSERT INTO segmen_jalan (segment_id, ruas_id, sta_awal, sta_akhir, longitude, latitude)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(segment_id) DO UPDATE SET 
            sta_awal = COALESCE(EXCLUDED.sta_awal, segmen_jalan.sta_awal),
            sta_akhir = COALESCE(EXCLUDED.sta_akhir, segmen_jalan.sta_akhir),
            longitude = COALESCE(EXCLUDED.longitude, segmen_jalan.longitude),
            latitude = COALESCE(EXCLUDED.latitude, segmen_jalan.latitude)
        `, [segmentId, ruasId, isNaN(staAwal) ? null : staAwal, isNaN(staAkhir) ? null : staAkhir, isNaN(lon) ? null : lon, isNaN(lat) ? null : lat]);

        const segRes = await client.query("SELECT id FROM segmen_jalan WHERE segment_id = $1", [segmentId]);
        if (segRes.rows.length === 0) continue;
        const segId = segRes.rows[0].id;

        // Smart multi-year parsing
        const itemKeys = Object.keys(item);
        const processedYears = new Set<string>();

        // 1. Explicit Tahun/Label Column
        const explicitlySpecifiedYear = cleanTahunLabel(getVal(item, mapping.tahun));
        if (explicitlySpecifiedYear !== "-") {
            const iriVal = parseNum(getVal(item, mapping.iri));
            const trtVal = getVal(item, mapping.treatment);
            if (!isNaN(iriVal)) {
              await client.query(`
                INSERT INTO annual_data (segmen_id, tahun, iri) 
                VALUES ($1, $2, $3) 
                ON CONFLICT(segmen_id, tahun) DO UPDATE SET iri = EXCLUDED.iri
              `, [segId, explicitlySpecifiedYear, iriVal]);
            }
            if (trtVal) {
              await client.query(`
                INSERT INTO annual_data (segmen_id, tahun, treatment) 
                VALUES ($1, $2, $3) 
                ON CONFLICT(segmen_id, tahun) DO UPDATE SET treatment = EXCLUDED.treatment
              `, [segId, explicitlySpecifiedYear, String(trtVal).trim()]);
            }
            processedYears.add(explicitlySpecifiedYear);
        }

        // 2. Scan for year columns like "2025", "2025 S2", "IRI 2025", etc.
        for (const key of itemKeys) {
            const cleanKey = key.trim();
            // Match years like 2024, 2025, 2025 S2, 2025-S2, etc. (must start with 20)
            const yearMatch = cleanKey.match(/^20\d{2}(\s?S[12]|[-\s]?S[12])?$/i);
            const iriMatch = cleanKey.match(/^IRI\s?(20\d{2}.*)$/i);
            const trtMatch = cleanKey.match(/^(Treatment|Penanganan)\s?(20\d{2}.*)$/i);

            if (yearMatch) {
                const yearLabel = cleanTahunLabel(yearMatch[0]);
                const val = parseNum(item[key]);
                if (!isNaN(val)) {
                  await client.query(`
                    INSERT INTO annual_data (segmen_id, tahun, iri) VALUES ($1, $2, $3)
                    ON CONFLICT(segmen_id, tahun) DO UPDATE SET iri = EXCLUDED.iri
                  `, [segId, yearLabel, val]);
                }
            } else if (iriMatch) {
                const yearLabel = cleanTahunLabel(iriMatch[1]);
                const val = parseNum(item[key]);
                if (!isNaN(val)) {
                  await client.query(`
                    INSERT INTO annual_data (segmen_id, tahun, iri) VALUES ($1, $2, $3)
                    ON CONFLICT(segmen_id, tahun) DO UPDATE SET iri = EXCLUDED.iri
                  `, [segId, yearLabel, val]);
                }
            } else if (trtMatch) {
                const yearLabel = cleanTahunLabel(trtMatch[2]);
                const val = String(item[key]).trim();
                if (val) {
                  await client.query(`
                    INSERT INTO annual_data (segmen_id, tahun, treatment) VALUES ($1, $2, $3)
                    ON CONFLICT(segmen_id, tahun) DO UPDATE SET treatment = EXCLUDED.treatment
                  `, [segId, yearLabel, val]);
                }
            }
        }

        imported++;
      }

      await client.query("COMMIT");
      res.json({ success: true, count: imported });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Import Error:", error);
      res.status(500).json({ detail: "Gagal menyimpan data ke database. Periksa format file Anda." });
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
