
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="IntentOS Health Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://imranmohd98600-gif.github.io"
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"app": "IntentOS", "status": "online"}

@app.get("/api/status")
def status():
    return {"status": "connected"}
