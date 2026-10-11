import pytest
from unittest.mock import patch, MagicMock
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from voice_engine import VoiceEngine
from event_manager import EventManager

@pytest.fixture
def mock_sr():
    with patch('voice_engine.sr') as mock:
        yield mock

def test_voice_engine_initialization():
    em = EventManager()
    engine = VoiceEngine(em)
    assert engine.is_running == False

def test_voice_engine_start_stop(mock_sr):
    em = MagicMock()
    engine = VoiceEngine(em)
    
    # Mock mic and recognizer
    mock_sr.Microphone.return_value.__enter__.return_value = "mic_source"
    
    engine.start()
    assert engine.is_running == True
    em.trigger_event.assert_any_call("voice_status", {"listening": True, "state": "calibrating", "mode": "online"})
    
    engine.stop()
    assert engine.is_running == False
    em.trigger_event.assert_any_call("voice_status", {"listening": False, "state": "idle"})

def test_normalization():
    engine = VoiceEngine(MagicMock())
    assert engine._normalize_text("Start Control!") == "Start Control!"
    assert engine._normalize_text("  Pause control.  ") == "Pause control."
