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
    pengelola TEXT,
    kabupaten_kota TEXT,
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
    sdi TEXT,
    treatment TEXT DEFAULT 'NONE',
    UNIQUE(segmen_id, tahun)
  );
`);

// Try running migrations for existing databases
try { db.exec("ALTER TABLE ruas_jalan ADD COLUMN pengelola TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE ruas_jalan ADD COLUMN kabupaten_kota TEXT;"); } catch(e) {}
try { db.exec("ALTER TABLE annual_data ADD COLUMN sdi TEXT;"); } catch(e) {}

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
  const PORT = parseInt(process.env.PORT || '3000', 10);

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
      INSERT INTO ruas_jalan (no_ruas, nama_jalan, ppk, pengelola, kabupaten_kota, panjang_km) 
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(no_ruas) DO UPDATE SET 
        nama_jalan = COALESCE(excluded.nama_jalan, ruas_jalan.nama_jalan),
        ppk = COALESCE(excluded.ppk, ruas_jalan.ppk),
        pengelola = COALESCE(excluded.pengelola, ruas_jalan.pengelola),
        kabupaten_kota = COALESCE(excluded.kabupaten_kota, ruas_jalan.kabupaten_kota),
        panjang_km = COALESCE(excluded.panjang_km, ruas_jalan.panjang_km)
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
        INSERT INTO annual_data (segmen_id, tahun, iri, sdi) 
        VALUES (?, ?, ?, ?) 
        ON CONFLICT(segmen_id, tahun) DO UPDATE SET iri = excluded.iri, sdi = excluded.sdi
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
      pengelola: ["Pengelola", "pengelola", "Pengelola (nasional/Provinsi/ Kabupaten kota)"],
      kabupatenKota: ["Kabupaten/Kota", "Kabupaten", "Kota", "kabupaten_kota", "Wilayah"],
      noRuas: ["No. Ruas", "No Ruas", "no_ruas", "ruas_id", "ruas", "Ruas"],
      namaJalan: ["Nama Jalan", "Nama Segmen", "Segmen", "nama_jalan", "Nama", "Jalan"],
      ppk: ["PPK", "ppk", "Ppk"],
      segmentId: ["ID Segmen", "ID", "Id", "id", "Segment ID", "segment_id", "SegmenID", "No. Segmen"],
      staAwal: ["STA Awal", "STA_Awal", "sta_awal", "Awal", "STA", "sta"],
      staAkhir: ["STA Akhir", "STA_Akhir", "sta_akhir", "Akhir"],
      lat: ["Lat", "Latitude", "lat", "latitude", "Y", "y"],
      lon: ["Lon", "Longitude", "lon", "longitude", "X", "x"],
      panjang: ["Panjang", "Panjang Ruas", "panjang", "panjang_km", "Panjang (km)"],
      tahun: ["Tahun", "tahun", "Year", "year", "Label", "label", "Periode", "Tahun Data"],
      iri: ["IRI", "iri", "Iri", "Kondisi", "Nilai IRI"],
      sdi: ["SDI", "sdi"],
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
        const pengelolaRaw = String(getVal(item, mapping.pengelola) || "nasional").toLowerCase();
        const pengelola = pengelolaRaw.includes("nasional") ? "nasional" : pengelolaRaw;
        
        let kabupatenKota = getVal(item, mapping.kabupatenKota);
        if (pengelola === "nasional") {
          kabupatenKota = null;
        } else if (!kabupatenKota) {
          // Fallback logic for Maluku if pengelola is specific
          if (pengelola.includes("ambon")) kabupatenKota = "kota ambon";
          else if (pengelola.includes("tual")) kabupatenKota = "kota tual";
          else if (pengelola.includes("buru selatan")) kabupatenKota = "kabupaten buru selatan";
          else if (pengelola.includes("buru")) kabupatenKota = "kabupaten buru";
          else if (pengelola.includes("aru")) kabupatenKota = "kabupaten kepulauan aru";
          else if (pengelola.includes("tanimbar")) kabupatenKota = "kabupaten kepulauan tanimbar";
          else if (pengelola.includes("barat daya")) kabupatenKota = "kabupaten maluku barat daya";
          else if (pengelola.includes("tengah")) kabupatenKota = "kabupaten maluku tengah";
          else if (pengelola.includes("tenggara")) kabupatenKota = "kabupaten maluku tenggara";
          else if (pengelola.includes("seram bagian barat")) kabupatenKota = "kabupaten seram bagian barat";
          else if (pengelola.includes("seram bagian timur")) kabupatenKota = "kabupaten seram bagian timur";
          else if (pengelola.includes("provinsi")) kabupatenKota = "provinsi maluku";
        }

        const noRuas = String(getVal(item, mapping.noRuas) || "");
        const namaJalan = String(getVal(item, mapping.namaJalan) || "Tanpa Nama");
        const ppk = String(getVal(item, mapping.ppk) || "");
        const segmentId = String(getVal(item, mapping.segmentId) || "");
        
        if (!noRuas || !segmentId) continue;

        const staAwal = parseNum(getVal(item, mapping.staAwal));
        const staAkhir = parseNum(getVal(item, mapping.staAkhir));
        const lon = parseNum(getVal(item, mapping.lon));
        const lat = parseNum(getVal(item, mapping.lat));
        const panjang = parseNum(getVal(item, mapping.panjang));

        insertRuas.run(noRuas, namaJalan, ppk, pengelola, kabupatenKota ? String(kabupatenKota).toLowerCase() : null, isNaN(panjang) ? null : panjang);
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
            const sdiValRaw = getVal(item, mapping.sdi);
            const sdiVal = (sdiValRaw !== undefined && sdiValRaw !== null && sdiValRaw !== "") ? String(sdiValRaw).trim() : null;
            
            upsertAnnualKondisi.run(seg.id, explicitlySpecifiedYear, isNaN(iriVal) ? null : iriVal, sdiVal);
            if (getVal(item, mapping.treatment)) upsertAnnualTreatment.run(seg.id, explicitlySpecifiedYear, String(getVal(item, mapping.treatment)).trim());
            processedYears.add(explicitlySpecifiedYear);
        }

        // 2. Scan for year columns like "2025", "2025 S2", "IRI 2025", etc.
        itemKeys.forEach(key => {
            const cleanKey = key.trim();
            // Match years like 2024, 2025, 2025 S2, 2025-S2, etc. (must start with 20)
            const yearMatch = cleanKey.match(/^20\d{2}(\s?S[12]|[-\s]?S[12])?$/i);
            const iriMatch = cleanKey.match(/^IRI\s?(20\d{2}.*)$/i);
            const sdiMatch = cleanKey.match(/^SDI\s?(20\d{2}.*)$/i);
            const trtMatch = cleanKey.match(/^(Treatment|Penanganan)\s?(20\d{2}.*)$/i);

            if (yearMatch) {
                const yearLabel = cleanTahunLabel(yearMatch[0]);
                const val = parseNum(item[key]);
                if (!isNaN(val)) upsertAnnualKondisi.run(seg.id, yearLabel, val, null);
            } else if (iriMatch) {
                const yearLabel = cleanTahunLabel(iriMatch[1]);
                const val = parseNum(item[key]);
                if (!isNaN(val)) upsertAnnualKondisi.run(seg.id, yearLabel, val, null);
            } else if (sdiMatch) {
                const yearLabel = cleanTahunLabel(sdiMatch[1]);
                const val = item[key];
                if (val !== undefined && val !== null && val !== "") {
                  upsertAnnualKondisi.run(seg.id, yearLabel, null, String(val).trim());
                }
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
      
      // Verify data was actually persisted
      const verifyRuas = db.prepare("SELECT COUNT(*) as count FROM ruas_jalan").get() as any;
      const verifySegmen = db.prepare("SELECT COUNT(*) as count FROM segmen_jalan").get() as any;
      const verifyAnnual = db.prepare("SELECT COUNT(*) as count FROM annual_data").get() as any;
      console.log(`[IMPORT OK] Imported: ${count} rows. DB now has: ${verifyRuas.count} ruas, ${verifySegmen.count} segmen, ${verifyAnnual.count} annual_data`);
      
      res.json({ success: true, count, db_counts: { ruas: verifyRuas.count, segmen: verifySegmen.count, annual: verifyAnnual.count } });
    } catch (error) {
      console.error("Import Error:", error);
      res.status(500).json({ detail: "Gagal menyimpan data ke database. Periksa format file Anda." });
    }
  });

  // Debug endpoint to check DB state
  app.get("/api/debug/counts", (req, res) => {
    try {
      const ruas = db.prepare("SELECT COUNT(*) as count FROM ruas_jalan").get() as any;
      const segmen = db.prepare("SELECT COUNT(*) as count FROM segmen_jalan").get() as any;
      const annual = db.prepare("SELECT COUNT(*) as count FROM annual_data").get() as any;
      const users = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
      const sampleRuas = db.prepare("SELECT * FROM ruas_jalan LIMIT 3").all();
      const sampleSegmen = db.prepare("SELECT * FROM segmen_jalan LIMIT 3").all();
      const sampleAnnual = db.prepare("SELECT * FROM annual_data LIMIT 3").all();
      res.json({
        counts: { ruas: ruas.count, segmen: segmen.count, annual: annual.count, users: users.count },
        samples: { ruas: sampleRuas, segmen: sampleSegmen, annual: sampleAnnual },
        db_path: path.resolve("roadtrack.db"),
        node_env: process.env.NODE_ENV,
        port: process.env.PORT
      });
    } catch (error) {
      console.error("Debug Error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.get("/api/ruas/all", (req, res) => {
    try {
      const ruas = db.prepare("SELECT * FROM ruas_jalan").all();
      console.log(`[FETCH] /api/ruas/all => ruas: ${ruas.length}`);
      const allSegments = db.prepare("SELECT * FROM segmen_jalan ORDER BY ruas_id, sta_awal ASC").all();
      const allAnnuals = db.prepare("SELECT * FROM annual_data").all();

      // Indexing for faster joining
      const annualsBySegmen = new Map();
      allAnnuals.forEach((a: any) => {
        if (!annualsBySegmen.has(a.segmen_id)) annualsBySegmen.set(a.segmen_id, []);
        annualsBySegmen.get(a.segmen_id).push(a);
      });

      const segmentsByRuas = new Map();
      allSegments.forEach((s: any) => {
        if (!segmentsByRuas.has(s.ruas_id)) segmentsByRuas.set(s.ruas_id, []);
        
        const annuals = annualsBySegmen.get(s.id) || [];
        const yearsData: any = {};
        annuals.forEach((a: any) => {
          yearsData[a.tahun] = { iri: a.iri, sdi: a.sdi, treatment: a.treatment };
        });
        
        segmentsByRuas.get(s.ruas_id).push({ ...s, ...yearsData });
      });

      const result = ruas.map((r: any) => {
        const segments = segmentsByRuas.get(r.id) || [];
        
        // Calculate length if missing
        let panjang = r.panjang_km;
        if (!panjang && segments.length > 0) {
          let min = Infinity;
          let max = -Infinity;
          segments.forEach((s: any) => {
            if (s.sta_awal !== null && s.sta_awal < min) min = s.sta_awal;
            if (s.sta_akhir !== null && s.sta_akhir > max) max = s.sta_akhir;
          });
          if (min !== Infinity && max !== -Infinity) {
            panjang = parseFloat(((max - min) / 1000).toFixed(3));
          }
        }

        return {
          ...r,
          panjang_km: panjang,
          segments: segments
        };
      });
      res.json(result);
    } catch (error) {
      console.error("Fetch All Error:", error);
      res.status(500).json({ detail: "Gagal mengambil data dari database" });
    }
  });

  app.get("/api/segmen/search", (req, res) => {
    const { query } = req.query;
    if (!query) return res.json([]);
    
    const results = db.prepare(`
      SELECT s.*, r.no_ruas, r.nama_jalan, r.ppk, r.pengelola, r.kabupaten_kota
      FROM segmen_jalan s 
      JOIN ruas_jalan r ON r.id = s.ruas_id 
      WHERE s.segment_id LIKE ? OR r.no_ruas LIKE ? OR r.nama_jalan LIKE ?
      LIMIT 10
    `).all(`%${query}%`, `%${query}%`, `%${query}%`);
    
    res.json(results);
  });

  app.post("/api/segmen/update-batch", (req, res) => {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ detail: "Data harus berupa array" });

    const updateRuas = db.prepare("UPDATE ruas_jalan SET no_ruas = ?, nama_jalan = ?, ppk = ?, pengelola = ?, kabupaten_kota = ? WHERE no_ruas = ?");
    const updateSeg = db.prepare(`
      UPDATE segmen_jalan SET 
        segment_id = ?, sta_awal = ?, sta_akhir = ?, 
        longitude = ?, latitude = ?
      WHERE id = ?
    `);
    const upsertAnnual = db.prepare(`
      INSERT INTO annual_data (segmen_id, tahun, iri, sdi, treatment)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(segmen_id, tahun) DO UPDATE SET 
        iri = COALESCE(excluded.iri, annual_data.iri),
        sdi = COALESCE(excluded.sdi, annual_data.sdi),
        treatment = COALESCE(excluded.treatment, annual_data.treatment)
    `);

    try {
      db.transaction((batch) => {
        for (const item of batch) {
          const { 
            id, no_ruas, nama_jalan, ppk, pengelola, kabupaten_kota, segment_id, 
            sta_awal, sta_akhir, longitude, latitude, iri_value, sdi_value, treatment, tahun 
          } = item;

          updateRuas.run(no_ruas, nama_jalan, ppk, pengelola || 'nasional', kabupaten_kota || null, no_ruas);
          updateSeg.run(segment_id, sta_awal, sta_akhir, longitude, latitude, id);

          if (tahun) {
            const cleanTahun = String(tahun);
            const iriNum = (iri_value === undefined || iri_value === null) ? null : parseFloat(iri_value);
            const sdiNum = (sdi_value === undefined || sdi_value === null) ? null : String(sdi_value);
            upsertAnnual.run(id, cleanTahun, iriNum, sdiNum, treatment || 'NONE');
          }
        }
      })(updates);
      res.json({ success: true, count: updates.length });
    } catch (error) {
      console.error("Batch Update Error:", error);
      res.status(500).json({ detail: "Gagal memperbarui database secara masal" });
    }
  });

  app.post("/api/segmen/update-manual", (req, res) => {
    const { 
      id, no_ruas, nama_jalan, ppk, pengelola, kabupaten_kota, segment_id, 
      sta_awal, sta_akhir, longitude, latitude, iri_value, sdi_value, treatment, tahun 
    } = req.body;

    try {
      db.transaction(() => {
        // Update Road Info
        db.prepare("UPDATE ruas_jalan SET no_ruas = ?, nama_jalan = ?, ppk = ?, pengelola = ?, kabupaten_kota = ? WHERE no_ruas = ?")
          .run(no_ruas, nama_jalan, ppk, pengelola || 'nasional', kabupaten_kota || null, no_ruas);

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
          const iriNum = (iri_value === undefined || iri_value === null || iri_value === "") ? null : parseFloat(iri_value);
          const sdiVal = (sdi_value === undefined || sdi_value === null) ? null : String(sdi_value).trim();
          
          db.prepare(`
            INSERT INTO annual_data (segmen_id, tahun, iri, sdi, treatment)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(segmen_id, tahun) DO UPDATE SET 
              iri = COALESCE(excluded.iri, annual_data.iri),
              sdi = COALESCE(excluded.sdi, annual_data.sdi),
              treatment = COALESCE(excluded.treatment, annual_data.treatment)
          `).run(id, cleanTahun, iriNum, sdiVal, treatment || 'NONE');
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
