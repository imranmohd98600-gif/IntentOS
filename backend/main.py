from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from event_manager import EventManager
from intent_engine import IntentEngine
from pydantic import BaseModel

app = FastAPI(title="IntentOS Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

event_manager = EventManager()
intent_engine = IntentEngine(event_manager)

@app.on_event("startup")
async def startup_event():
    event_manager.loop = asyncio.get_running_loop()

class ControlCommand(BaseModel):
    action: str

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/status")
def get_status():
    return intent_engine.get_status()

@app.post("/api/control/start")
def start_control():
    intent_engine.start()
    return {"status": "started"}

@app.post("/api/control/pause")
def pause_control():
    intent_engine.pause()
    return {"status": "paused"}

@app.post("/api/control/resume")
def resume_control():
    intent_engine.resume()
    return {"status": "resumed"}

@app.post("/api/control/stop")
def stop_control():
    intent_engine.stop()
    return {"status": "stopped"}

@app.post("/api/control/zoom_enable")
def enable_zoom():
    intent_engine.enable_zoom()
    return {"status": "zoom enabled"}

@app.post("/api/control/zoom_disable")
def disable_zoom():
    intent_engine.disable_zoom()
    return {"status": "zoom disabled"}

@app.get("/api/gestures")
def get_gestures():
    return intent_engine.get_supported_gestures()

@app.get("/api/commands")
def get_commands():
    return intent_engine.get_supported_commands()

class TTSSettings(BaseModel):
    muted: bool = None
    rate: int = None
    volume: float = None
    voice_id: str = None

@app.get("/api/tts/voices")
def get_tts_voices():
    if intent_engine.tts_engine:
        return {"voices": intent_engine.tts_engine.voices, "current_id": intent_engine.tts_engine.voice_id}
    return {"voices": []}

@app.post("/api/tts/settings")
def update_tts_settings(settings: TTSSettings):
    if intent_engine.tts_engine:
        intent_engine.tts_engine.set_settings(
            muted=settings.muted,
            rate=settings.rate,
            volume=settings.volume,
            voice_id=settings.voice_id
        )
    return {"status": "ok"}

class TTSSpeak(BaseModel):
    text: str

@app.post("/api/tts/speak")
def tts_speak(payload: TTSSpeak):
    if intent_engine.tts_engine:
        intent_engine.tts_engine.speak(payload.text)
    return {"status": "ok"}

@app.post("/api/tts/stop")
def tts_stop():
    if intent_engine.tts_engine:
        intent_engine.tts_engine.stop_speaking()
    return {"status": "ok"}

def generate_frames():
    import time
    while True:
        if intent_engine.gesture_engine and intent_engine.gesture_engine.is_running:
            frame = intent_engine.gesture_engine.get_latest_frame()
            if frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            else:
                time.sleep(0.05)
        else:
            time.sleep(0.1)

@app.get("/api/video_feed")
def video_feed():
    return StreamingResponse(generate_frames(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_id = event_manager.register_client(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming WebSocket messages if any
    except WebSocketDisconnect:
        event_manager.unregister_client(client_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
