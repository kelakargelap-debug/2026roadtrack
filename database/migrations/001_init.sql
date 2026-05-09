CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE wilayah (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nama VARCHAR(150) NOT NULL,
    kode VARCHAR(20) UNIQUE,
    geom GEOMETRY(MULTIPOLYGON, 4326)
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('superadmin','admin','surveyor','viewer')),
    wilayah_id UUID REFERENCES wilayah(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

CREATE TABLE ruas_jalan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    no_ruas VARCHAR(20) UNIQUE NOT NULL,
    nama_jalan VARCHAR(200) NOT NULL,
    ppk VARCHAR(50),
    wilayah_id UUID REFERENCES wilayah(id),
    panjang_km NUMERIC(8,3),
    lebar_m NUMERIC(5,2),
    fungsi_jalan VARCHAR(50),
    geom GEOMETRY(LINESTRING, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ruas_geom ON ruas_jalan USING GIST(geom);

CREATE TABLE segmen_jalan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ruas_id UUID REFERENCES ruas_jalan(id) ON DELETE CASCADE,
    segment_id VARCHAR(20),
    sta_awal NUMERIC(8,3),
    sta_akhir NUMERIC(8,3),
    panjang_m NUMERIC(8,2) DEFAULT 100,
    longitude NUMERIC(12,6),
    latitude NUMERIC(12,6),
    geom GEOMETRY(POINT, 4326),
    iri_2025 NUMERIC(5,2),
    treatment_2026 VARCHAR(100), kode_2026 VARCHAR(10), iri_2026 NUMERIC(5,2),
    treatment_2027 VARCHAR(100), kode_2027 VARCHAR(10), iri_2027 NUMERIC(5,2),
    treatment_2028 VARCHAR(100), kode_2028 VARCHAR(10), iri_2028 NUMERIC(5,2),
    treatment_2029 VARCHAR(100), kode_2029 VARCHAR(10), iri_2029 NUMERIC(5,2),
    panjang_tidak_mantap NUMERIC(8,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_segmen_geom ON segmen_jalan USING GIST(geom);
CREATE INDEX idx_segmen_ruas ON segmen_jalan(ruas_id);

CREATE TABLE riwayat_penanganan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ruas_id UUID REFERENCES ruas_jalan(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES users(id),
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE,
    jenis_penanganan VARCHAR(100) NOT NULL,
    kode_treatment VARCHAR(10),
    panjang_m NUMERIC(8,2),
    anggaran_rp BIGINT,
    kontraktor VARCHAR(200),
    no_kontrak VARCHAR(100),
    status VARCHAR(20) DEFAULT 'selesai',
    catatan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Data (Optional)
INSERT INTO wilayah (nama, kode) VALUES ('Maluku', 'MLK'),('Ambon','AMB');
-- Password is 'admin123'
INSERT INTO users (name,email,password_hash,role) VALUES
('Super Admin','admin@roadtrack.id', '$2b$12$D4S/A5ZpW5kO5V5l7E8U7O/h7v1t/u9r8T7G6G1M2E2W', 'superadmin');
