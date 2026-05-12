import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import Database from "better-sqlite3";

const SECRET_KEY = "roadtrack-super-secret";
const db = new Database("roadtrack.db", { timeout: 15000 });

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS ruas_jalan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no_ruas TEXT UNIQUE NOT NULL,
    nama_jalan TEXT NOT NULL,
    ppk TEXT,
    panjang_km REAL
  );

  CREATE TABLE IF NOT EXISTS segmen_jalan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ruas_id INTEGER REFERENCES ruas_jalan(id),
    segment_id TEXT UNIQUE,
    sta_awal REAL,
    sta_akhir REAL,
    longitude REAL,
    latitude REAL
  );

  CREATE TABLE IF NOT EXISTS annual_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    segmen_id INTEGER REFERENCES segmen_jalan(id),
    tahun TEXT NOT NULL,
    iri REAL,
    treatment TEXT DEFAULT 'NONE',
    UNIQUE(segmen_id, tahun)
  );
`);

// Seed Admin User (admin@roadtrack.id / sibusibu)
const adminExists = db.prepare("SELECT * FROM users WHERE email = ?").get("admin@roadtrack.id");
if (!adminExists) {
  const hash = bcrypt.hashSync("sibusibu", 10);
  db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)").run(
    "Super Admin", "admin@roadtrack.id", hash, "superadmin"
  );
} else {
  // Update password to new one if it already exists
  const hash = bcrypt.hashSync("sibusibu", 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").run(hash, "admin@roadtrack.id");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Routes
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(username) as any;
    
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

  app.get("/api/dashboard/summary", (req, res) => {
    const totalRuas = db.prepare("SELECT COUNT(*) as count FROM ruas_jalan").get() as any;
    const totalPanjang = db.prepare("SELECT SUM(panjang_km) as sum FROM ruas_jalan").get() as any;
    const totalSegmen = db.prepare("SELECT COUNT(*) as count FROM segmen_jalan").get() as any;
    
    // Get latest available year
    const lastYearRow = db.prepare("SELECT MAX(tahun) as year FROM annual_data").get() as any;
    const lastYear = lastYearRow?.year ? String(lastYearRow.year) : null;
    
    const condition = lastYear 
      ? db.prepare("SELECT COUNT(*) as count FROM annual_data WHERE tahun = ? AND iri <= 4").get(lastYear) as any
      : { count: 0 };

    res.json({
      total_ruas: totalRuas.count,
      total_panjang_km: totalPanjang.sum,
      baik: condition.count,
      total_segmen: totalSegmen.count,
      pct_mantap: totalSegmen.count > 0 ? (condition.count / totalSegmen.count * 100).toFixed(1) : 0,
      reporting_year: lastYear || "-"
    });
  });

  app.post("/api/import/save", (req, res) => {
    const { data } = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ detail: "Data harus berupa array" });

    const insertRuas = db.prepare(`
      INSERT INTO ruas_jalan (no_ruas, nama_jalan, ppk) 
      VALUES (?, ?, ?)
      ON CONFLICT(no_ruas) DO UPDATE SET 
        nama_jalan = COALESCE(excluded.nama_jalan, ruas_jalan.nama_jalan),
        ppk = COALESCE(excluded.ppk, ruas_jalan.ppk)
    `);
    
    const insertSeg = db.prepare(`
      INSERT INTO segmen_jalan (segment_id, ruas_id, sta_awal, sta_akhir, longitude, latitude)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(segment_id) DO UPDATE SET 
        sta_awal = COALESCE(excluded.sta_awal, segmen_jalan.sta_awal),
        sta_akhir = COALESCE(excluded.sta_akhir, segmen_jalan.sta_akhir),
        longitude = COALESCE(excluded.longitude, segmen_jalan.longitude),
        latitude = COALESCE(excluded.latitude, segmen_jalan.latitude)
    `);
    
    const upsertAnnualKondisi = db.prepare(`
        INSERT INTO annual_data (segmen_id, tahun, iri) 
        VALUES (?, ?, ?) 
        ON CONFLICT(segmen_id, tahun) DO UPDATE SET iri = excluded.iri
    `);
    const upsertAnnualTreatment = db.prepare(`
        INSERT INTO annual_data (segmen_id, tahun, treatment) 
        VALUES (?, ?, ?) 
        ON CONFLICT(segmen_id, tahun) DO UPDATE SET treatment = excluded.treatment
    `);
    
    const selectRuasId = db.prepare("SELECT id FROM ruas_jalan WHERE no_ruas = ?");
    const selectSegId = db.prepare("SELECT id FROM segmen_jalan WHERE segment_id = ?");

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

    const transaction = db.transaction((items) => {
      let imported = 0;
      for (const item of items) {
        const noRuas = String(getVal(item, mapping.noRuas) || "");
        const namaJalan = String(getVal(item, mapping.namaJalan) || "Tanpa Nama");
        const ppk = String(getVal(item, mapping.ppk) || "");
        const segmentId = String(getVal(item, mapping.segmentId) || "");
        
        if (!noRuas || !segmentId) continue;

        const staAwal = parseNum(getVal(item, mapping.staAwal));
        const staAkhir = parseNum(getVal(item, mapping.staAkhir));
        const lon = parseNum(getVal(item, mapping.lon));
        const lat = parseNum(getVal(item, mapping.lat));

        insertRuas.run(noRuas, namaJalan, ppk);
        const ruas = selectRuasId.get(noRuas) as any;
        if (!ruas) continue;
        
        insertSeg.run(segmentId, ruas.id, isNaN(staAwal) ? null : staAwal, isNaN(staAkhir) ? null : staAkhir, isNaN(lon) ? null : lon, isNaN(lat) ? null : lat);
        const seg = selectSegId.get(segmentId) as any;
        if (!seg) continue;

        // Smart multi-year parsing
        const itemKeys = Object.keys(item);
        const processedYears = new Set<string>();

        // 1. Explicit Tahun/Label Column
        const explicitlySpecifiedYear = cleanTahunLabel(getVal(item, mapping.tahun));
        if (explicitlySpecifiedYear !== "-") {
            const iriVal = parseNum(getVal(item, mapping.iri));
            const trtVal = getVal(item, mapping.treatment);
            if (!isNaN(iriVal)) upsertAnnualKondisi.run(seg.id, explicitlySpecifiedYear, iriVal);
            if (trtVal) upsertAnnualTreatment.run(seg.id, explicitlySpecifiedYear, String(trtVal).trim());
            processedYears.add(explicitlySpecifiedYear);
        }

        // 2. Scan for year columns like "2025", "2025 S2", "IRI 2025", etc.
        itemKeys.forEach(key => {
            const cleanKey = key.trim();
            // Match years like 2024, 2025, 2025 S2, 2025-S2, etc. (must start with 20)
            const yearMatch = cleanKey.match(/^20\d{2}(\s?S[12]|[-\s]?S[12])?$/i);
            const iriMatch = cleanKey.match(/^IRI\s?(20\d{2}.*)$/i);
            const trtMatch = cleanKey.match(/^(Treatment|Penanganan)\s?(20\d{2}.*)$/i);

            if (yearMatch) {
                const yearLabel = cleanTahunLabel(yearMatch[0]);
                const val = parseNum(item[key]);
                if (!isNaN(val)) upsertAnnualKondisi.run(seg.id, yearLabel, val);
            } else if (iriMatch) {
                const yearLabel = cleanTahunLabel(iriMatch[1]);
                const val = parseNum(item[key]);
                if (!isNaN(val)) upsertAnnualKondisi.run(seg.id, yearLabel, val);
            } else if (trtMatch) {
                const yearLabel = cleanTahunLabel(trtMatch[2]);
                const val = String(item[key]).trim();
                if (val) upsertAnnualTreatment.run(seg.id, yearLabel, val);
            }
        });

        imported++;
      }
      return imported;
    });

    try {
      const count = transaction(data);
      res.json({ success: true, count });
    } catch (error) {
      console.error("Import Error:", error);
      res.status(500).json({ detail: "Gagal menyimpan data ke database. Periksa format file Anda." });
    }
  });

  app.get("/api/ruas/all", (req, res) => {
    const ruas = db.prepare("SELECT * FROM ruas_jalan").all();
    const result = ruas.map((r: any) => {
      const segments = db.prepare("SELECT * FROM segmen_jalan WHERE ruas_id = ? ORDER BY sta_awal ASC").all(r.id);
      return {
        ...r,
        segments: segments.map((s: any) => {
          const annuals = db.prepare("SELECT tahun, iri, treatment FROM annual_data WHERE segmen_id = ?").all(s.id);
          const yearsData: any = {};
          annuals.forEach((a: any) => {
            yearsData[a.tahun] = { iri: a.iri, treatment: a.treatment };
          });
          return { ...s, ...yearsData };
        })
      };
    });
    res.json(result);
  });

  app.get("/api/segmen/search", (req, res) => {
    const { query } = req.query;
    if (!query) return res.json([]);
    
    const results = db.prepare(`
      SELECT s.*, r.no_ruas, r.nama_jalan, r.ppk 
      FROM segmen_jalan s 
      JOIN ruas_jalan r ON r.id = s.ruas_id 
      WHERE s.segment_id LIKE ? OR r.no_ruas LIKE ? OR r.nama_jalan LIKE ?
      LIMIT 10
    `).all(`%${query}%`, `%${query}%`, `%${query}%`);
    
    res.json(results);
  });

  app.post("/api/segmen/update-manual", (req, res) => {
    const { 
      id, no_ruas, nama_jalan, ppk, segment_id, 
      sta_awal, sta_akhir, longitude, latitude, iri_value, treatment, tahun 
    } = req.body;

    try {
      db.transaction(() => {
        // Update Road Info
        db.prepare("UPDATE ruas_jalan SET no_ruas = ?, nama_jalan = ?, ppk = ? WHERE no_ruas = ?")
          .run(no_ruas, nama_jalan, ppk, no_ruas);

        // Update Segment Info
        db.prepare(`
          UPDATE segmen_jalan SET 
            segment_id = ?, sta_awal = ?, sta_akhir = ?, 
            longitude = ?, latitude = ?
          WHERE id = ?
        `).run(segment_id, sta_awal, sta_akhir, longitude, latitude, id);

        // Update or Insert Annual Data
        if (tahun) {
          const cleanTahun = String(tahun);
          if (iri_value !== undefined && treatment !== undefined) {
             db.prepare(`
                INSERT INTO annual_data (segmen_id, tahun, iri, treatment)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(segmen_id, tahun) DO UPDATE SET iri = excluded.iri, treatment = excluded.treatment
              `).run(id, cleanTahun, parseFloat(iri_value), treatment);
          } else if (iri_value !== undefined) {
            db.prepare(`
              INSERT INTO annual_data (segmen_id, tahun, iri)
              VALUES (?, ?, ?)
              ON CONFLICT(segmen_id, tahun) DO UPDATE SET iri = excluded.iri
            `).run(id, cleanTahun, parseFloat(iri_value));
          } else if (treatment !== undefined) {
            db.prepare(`
              INSERT INTO annual_data (segmen_id, tahun, treatment)
              VALUES (?, ?, ?)
              ON CONFLICT(segmen_id, tahun) DO UPDATE SET treatment = excluded.treatment
            `).run(id, cleanTahun, treatment);
          }
        }
      })();
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ detail: "Gagal memperbarui database" });
    }
  });

  app.post("/api/segmen/delete-multiple", (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ detail: "ID tidak valid" });
    }

    try {
      db.transaction(() => {
        const deleteAnnual = db.prepare("DELETE FROM annual_data WHERE segmen_id = ?");
        const deleteSeg = db.prepare("DELETE FROM segmen_jalan WHERE id = ?");
        
        for (const id of ids) {
          deleteAnnual.run(id);
          deleteSeg.run(id);
        }
      })();
      res.json({ success: true, count: ids.length });
    } catch (error) {
      console.error(error);
      res.status(500).json({ detail: "Gagal menghapus data" });
    }
  });

  app.post("/api/admin/clear-database", (req, res) => {
    const { year } = req.body;
    try {
      db.transaction(() => {
        if (year) {
          db.prepare("DELETE FROM annual_data WHERE tahun = ?").run(String(year));
        } else {
          db.prepare("DELETE FROM annual_data").run();
          db.prepare("DELETE FROM segmen_jalan").run();
          db.prepare("DELETE FROM ruas_jalan").run();
        }
      })();
      res.json({ success: true, message: year ? `Data tahun ${year} berhasil dihapus` : "Database berhasil dikosongkan" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ detail: "Gagal membersihkan database" });
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
