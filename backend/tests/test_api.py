import pytest
from fastapi.testclient import TestClient
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import app, event_manager, intent_engine
import asyncio
import time

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_and_teardown():
    # Mock loop for event manager
    event_manager.loop = asyncio.get_event_loop()
    intent_engine.stop()
    yield
    intent_engine.stop()

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_control_state_transitions():
    # Initial state
    resp = client.get("/api/status")
    assert resp.json()["running"] == False

    # Start
    client.post("/api/control/start")
    resp = client.get("/api/status")
    assert resp.json()["running"] == True
    assert resp.json()["paused"] == False

    # Pause
    client.post("/api/control/pause")
    resp = client.get("/api/status")
    assert resp.json()["running"] == True
    assert resp.json()["paused"] == True

    # Resume
    client.post("/api/control/resume")
    resp = client.get("/api/status")
    assert resp.json()["running"] == True
    assert resp.json()["paused"] == False

    # Stop
    client.post("/api/control/stop")
    resp = client.get("/api/status")
    assert resp.json()["running"] == False
    assert resp.json()["paused"] == False

def test_websocket_delivery():
    with client.websocket_connect("/ws/events") as websocket:
        # Trigger an event manually
        event_manager.trigger_event("gesture", {"name": "Pinch", "confidence": 0.99})
        # Wait and receive
        data = websocket.receive_json()
        assert data["type"] == "gesture"
        assert data["payload"]["name"] == "Pinch"
        assert data["payload"]["confidence"] == 0.99
