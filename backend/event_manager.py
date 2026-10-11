import asyncio
import uuid
from typing import Dict, Any

class EventManager:
    def __init__(self):
        self.clients: Dict[str, Any] = {}
        self.subscribers = []
        self.loop = None

    def add_subscriber(self, callback):
        self.subscribers.append(callback)

    def register_client(self, websocket: Any) -> str:
        client_id = str(uuid.uuid4())
        self.clients[client_id] = websocket
        return client_id

    def unregister_client(self, client_id: str):
        if client_id in self.clients:
            del self.clients[client_id]

    async def broadcast_event(self, event_type: str, payload: Dict[str, Any]):
        message = {"type": event_type, "payload": payload}
        for client_id, websocket in list(self.clients.items()):
            try:
                await websocket.send_json(message)
            except Exception:
                self.unregister_client(client_id)

    def trigger_event(self, event_type: str, payload: Dict[str, Any]):
        # Notify local subscribers
        for sub in self.subscribers:
            try:
                sub(event_type, payload)
            except Exception as e:
                print(f"Subscriber error: {e}")
                
        if self.loop is not None and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast_event(event_type, payload), self.loop)
