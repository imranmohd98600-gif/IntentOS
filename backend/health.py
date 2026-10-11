from fastapi import FastAPI

app = FastAPI(title="IntentOS Health Service")

@app.get("/")
def home():
    return {"app": "IntentOS", "status": "online"}

@app.get("/api/status")
def status():
    return {"status": "connected"}
