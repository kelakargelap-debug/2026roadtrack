from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, Boolean, DateTime, text
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import Optional
import os

DATABASE_URL = os.getenv("DATABASE_URL","postgresql+asyncpg://roaduser:roadpass123@db/roadtrack")
SECRET_KEY = os.getenv("SECRET_KEY","ganti-dengan-secret-key-aman")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

app = FastAPI(title="RoadTrack GIS API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

def create_access_token(data: dict, expires_delta: Optional[timedelta]=None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@app.post("/api/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id,name,email,password_hash,role,is_active FROM users WHERE email=:e"),
        {"e": form_data.username}
    )
    user = result.fetchone()
    if not user or not pwd_context.verify(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Akun dinonaktifkan")
    await db.execute(text("UPDATE users SET last_login=NOW() WHERE id=:id"),{"id":user.id})
    await db.commit()
    token = create_access_token({"sub":str(user.id),"role":user.role,"name":user.name})
    return {"access_token":token,"token_type":"bearer","user":{"id":str(user.id),"name":user.name,"email":user.email,"role":user.role}}

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"id":payload["sub"],"role":payload["role"],"name":payload["name"]}
    except JWTError:
        raise HTTPException(status_code=401, detail="Token tidak valid")

@app.get("/api/ruas")
async def get_ruas(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(text("""
        SELECT r.id, r.no_ruas, r.nama_jalan, r.ppk, r.panjang_km,
               COUNT(s.id) as jumlah_segmen,
               AVG(s.iri_2025) as avg_iri_2025
        FROM ruas_jalan r
        LEFT JOIN segmen_jalan s ON s.ruas_id=r.id
        GROUP BY r.id ORDER BY r.no_ruas
    """))
    rows = result.fetchall()
    return [dict(r._mapping) for r in rows]

@app.get("/api/segmen/geojson")
async def get_segmen_geojson(tahun: int=2025, ppk: Optional[str]=None,
    bbox: Optional[str]=None, db: AsyncSession=Depends(get_db)):
    iri_col = f"iri_{tahun}"
    kode_col = f"kode_{tahun}" if tahun > 2025 else None
    where = []
    params: dict = {"tahun": tahun}
    if ppk:
        where.append("r.ppk=:ppk"); params["ppk"]=ppk
    if bbox:
        coords = bbox.split(",")
        where.append(f"s.longitude BETWEEN :lon1 AND :lon2 AND s.latitude BETWEEN :lat1 AND :lat2")
        params.update({"lon1":float(coords[0]),"lat1":float(coords[1]),"lon2":float(coords[2]),"lat2":float(coords[3])})
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    result = await db.execute(text(f"""
        SELECT s.segment_id, s.longitude, s.latitude, s.sta_awal, s.sta_akhir,
               s.{iri_col} as iri_value, {'s.'+kode_col if kode_col else 'NULL'} as kode_treatment,
               r.nama_jalan, r.no_ruas, r.ppk
        FROM segmen_jalan s JOIN ruas_jalan r ON r.id=s.ruas_id
        {where_sql} AND s.longitude IS NOT NULL
    """), params)
    rows = result.fetchall()
    features = []
    for row in rows:
        iri = float(row.iri_value) if row.iri_value else None
        kondisi = get_kondisi(iri)
        features.append({"type":"Feature","geometry":{"type":"Point","coordinates":[float(row.longitude),float(row.latitude)]},"properties":{
            "segment_id":row.segment_id,"no_ruas":row.no_ruas,"nama_ruas":row.nama_jalan,
            "ppk":row.ppk,"sta_awal":row.sta_awal,"sta_akhir":row.sta_akhir,
            "iri":iri,"kondisi":kondisi["label"],"warna":kondisi["warna"],"kode":row.kode_treatment
        }})
    return {"type":"FeatureCollection","features":features}

def get_kondisi(iri):
    if iri is None: return {"label":"N/A","warna":"#888888"}
    if iri<=4: return {"label":"Baik","warna":"#1A7A2E"}
    if iri<=6: return {"label":"Sedang","warna":"#A8C822"}
    if iri<=8: return {"label":"Sedang Marginal","warna":"#F5C800"}
    if iri<=12: return {"label":"Rusak Ringan","warna":"#E07820"}
    return {"label":"Rusak Berat","warna":"#CC1A1A"}

@app.post("/api/import/upload")
async def import_excel(db: AsyncSession=Depends(get_db), user=Depends(get_current_user)):
    if user["role"] not in ["superadmin","admin","surveyor"]:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    return {"message":"Upload endpoint aktif. Gunakan multipart/form-data dengan field 'file'"}

@app.get("/api/dashboard/summary")
async def dashboard_summary(db: AsyncSession=Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(text("""
        SELECT COUNT(DISTINCT r.id) as total_ruas,
               SUM(r.panjang_km) as total_panjang_km,
               COUNT(s.id) as total_segmen,
               AVG(s.iri_2025) as avg_iri,
               COUNT(CASE WHEN s.iri_2025>12 THEN 1 END) as rusak_berat,
               COUNT(CASE WHEN s.iri_2025<=4 THEN 1 END) as baik
        FROM ruas_jalan r LEFT JOIN segmen_jalan s ON s.ruas_id=r.id
    """))
    row = result.fetchone()
    d = dict(row._mapping)
    total = d["total_segmen"] or 1
    return {**d, "pct_mantap": round((d["baik"]/total)*100,1) if total else 0}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
