import pytest
from unittest.mock import MagicMock
from intent_engine import IntentEngine

def test_intent_engine_states():
    em = MagicMock()
    engine = IntentEngine(em)
    
    # Mock inner engines
    engine.gesture_engine = MagicMock()
    engine.voice_engine = MagicMock()
    engine.pc_controller = MagicMock()
    
    # 1. Stopped -> Running
    engine.start()
    assert engine.is_running == True
    assert engine.is_paused == False
    engine.gesture_engine.start.assert_called_once()
    engine.voice_engine.start.assert_called_once()
    engine.pc_controller.enable.assert_called_once()
    em.trigger_event.assert_called_with("status_change", {"status": "running"})
    
    # 2. Running -> Paused
    engine.pause()
    assert engine.is_running == True
    assert engine.is_paused == True
    engine.gesture_engine.pause.assert_called_once()
    engine.pc_controller.disable.assert_called_once()
    em.trigger_event.assert_called_with("status_change", {"status": "paused"})
    
    # Repeated pause requests should not trigger double-pause
    em.trigger_event.reset_mock()
    engine.pause()
    em.trigger_event.assert_not_called()
    
    # 3. Paused -> Running
    engine.resume()
    assert engine.is_running == True
    assert engine.is_paused == False
    engine.gesture_engine.resume.assert_called_once()
    engine.pc_controller.enable.assert_called()
    em.trigger_event.assert_called_with("status_change", {"status": "running"})
    
    # 4. Emergency Stop while Running
    engine.stop()
    assert engine.is_running == False
    assert engine.is_paused == False
    engine.gesture_engine.stop.assert_called_once()
    engine.voice_engine.stop.assert_called_once()
    engine.pc_controller.disable.assert_called()
    em.trigger_event.assert_called_with("status_change", {"status": "stopped"})
    
    # 5. Resume while Stopped (Should fail/do nothing)
    em.trigger_event.reset_mock()
    engine.resume()
    assert engine.is_running == False
    assert engine.is_paused == False
    em.trigger_event.assert_not_called()
    
    # 6. Pause while Stopped (Should fail/do nothing)
    engine.pause()
    assert engine.is_running == False
    assert engine.is_paused == False
    em.trigger_event.assert_not_called()
    
    # 7. Start while Stopped -> Paused -> Emergency Stop while Paused
    engine.start()
    engine.pause()
    assert engine.is_paused == True
    engine.stop()
    assert engine.is_running == False
    assert engine.is_paused == False
    
def test_voice_commands_to_states():
    em = MagicMock()
    engine = IntentEngine(em)
    engine.start = MagicMock()
    engine.pause = MagicMock()
    engine.resume = MagicMock()
    engine.stop = MagicMock()
    engine.tts_engine = MagicMock()
    
    # Simulate voice events
    engine._on_event("voice", {"success": True, "actions": [{"intent": "intentos_action", "params": {"action": "pause"}}]})
    engine.pause.assert_called_once()
    engine.tts_engine.speak.assert_any_call("Pausing control.")
    
    engine._on_event("voice", {"success": True, "actions": [{"intent": "intentos_action", "params": {"action": "resume"}}]})
    engine.resume.assert_called_once()
    engine.tts_engine.speak.assert_any_call("Resuming control.")
    
    engine._on_event("voice", {"success": True, "actions": [{"intent": "intentos_action", "params": {"action": "stop"}}]})
    engine.stop.assert_called_once()
    engine.tts_engine.speak.assert_any_call("Stopping all controls.")
    
    engine._on_event("voice", {"success": True, "actions": [{"intent": "intentos_action", "params": {"action": "start"}}]})
    engine.start.assert_called_once()

def test_intent_engine_speech_response():
    em = MagicMock()
    engine = IntentEngine(em)
    engine.tts_engine = MagicMock()
    
    # Success response with hardcoded fallback
    engine._on_event("voice", {"success": True, "actions": [{"intent": "browser_search", "params": {"query": "test query"}}]})
    engine.tts_engine.speak.assert_called_with("Searching for test query")
    
    # Success response with LLM reply
    engine.tts_engine.speak.reset_mock()
    engine._on_event("voice", {"success": True, "reply": "Sure thing!", "actions": [{"intent": "browser_search", "params": {"query": "test query"}}]})
    engine.tts_engine.speak.assert_called_with("Sure thing!")
    
    # Failed response
    engine.tts_engine.speak.reset_mock()
    engine._on_event("voice", {"success": False})
    engine.tts_engine.speak.assert_called_with("I didn't quite catch that.")
