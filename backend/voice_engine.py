import speech_recognition as sr
import threading
from event_manager import EventManager
import time
import string
from nlu_router import NLURouter

class VoiceEngine:
    def __init__(self, event_manager: EventManager, supported_commands: list = None):
        self.event_manager = event_manager
        self.is_running = False
        self.thread = None
        
        self.recognizer = sr.Recognizer()
        # Improve recognition for Indian accents and general responsiveness
        self.recognizer.energy_threshold = 300
        self.recognizer.dynamic_energy_threshold = True
        self.recognizer.pause_threshold = 0.8
        
        self.mic = None
        self.router = NLURouter()
        self.context = []
        self.is_tts_speaking = False
        
        # Subscribe to TTS status to avoid recording own voice
        self.event_manager.add_subscriber(self._on_tts_event)
        
    def _on_tts_event(self, event_type: str, payload: dict):
        if event_type == "tts_status":
            state = payload.get("state")
            if state == "speaking":
                self.is_tts_speaking = True
            elif state == "idle" or state == "error":
                # Small delay to ensure echo is gone
                time.sleep(0.5)
                self.is_tts_speaking = False
        
    def start(self):
        if not self.is_running:
            self.is_running = True
            try:
                self.mic = sr.Microphone()
                with self.mic as source:
                    self.event_manager.trigger_event("voice_status", {"listening": True, "state": "calibrating", "mode": "online"})
                    print("[VoiceEngine] Calibrating microphone for ambient noise... please wait.")
                    self.recognizer.adjust_for_ambient_noise(source, duration=1.5)
                    print("[VoiceEngine] Calibration complete. Listening online...")
            except Exception as e:
                self.is_running = False
                self.event_manager.trigger_event("error", {"message": f"Microphone error or unavailable: {e}"})
                print(f"[VoiceEngine] Error initializing microphone: {e}")
                return
            
            self.event_manager.trigger_event("voice_status", {"listening": True, "state": "waiting", "mode": "online"})
            self.thread = threading.Thread(target=self._run_loop, daemon=True)
            self.thread.start()

    def stop(self):
        self.is_running = False
        self.event_manager.trigger_event("voice_status", {"listening": False, "state": "idle"})
        if self.thread:
            self.thread.join(timeout=2.0)

    def _normalize_text(self, text: str) -> str:
        # Punctuation removal might break typing intents, so let's keep punctuation
        # and just lower case it for the NLU, or leave it fully raw.
        # Actually, if we type "Hello, World!", we want the punctuation!
        # So we shouldn't strip punctuation completely anymore.
        return text.strip()

    def _run_loop(self):
        while self.is_running:
            try:
                with self.mic as source:
                    self.event_manager.trigger_event("voice_status", {"listening": True, "state": "listening"})
                    audio = self.recognizer.listen(source, timeout=1.5, phrase_time_limit=10.0)
                
                if not self.is_running:
                    break
                    
                if self.is_tts_speaking:
                    # Ignore audio captured while TTS was speaking to avoid feedback loop
                    continue
                    
                self.event_manager.trigger_event("voice_status", {"listening": True, "state": "processing"})
                # Use en-IN for Indian English support
                text = self.recognizer.recognize_google(audio, language="en-IN")
                text = self._normalize_text(text)
                
                print(f"[VoiceEngine] Recognized text: '{text}'")
                
                if not text:
                    continue
                    
                # Parse intent plan
                parsed = self.router.parse(text, self.context)
                actions = parsed.get("actions", [])
                reply = parsed.get("reply", "")
                
                # Filter out unknowns
                valid_actions = [a for a in actions if a.get("intent") != "unknown"]
                
                if valid_actions or reply:
                    print(f"[VoiceEngine] Command accepted with {len(valid_actions)} actions. Reply: {reply}")
                    self.event_manager.trigger_event("voice_status", {"listening": True, "state": "executing"})
                    self.event_manager.trigger_event("voice", {
                        "text": text,
                        "actions": valid_actions,
                        "reply": reply,
                        "success": True
                    })
                    
                    # Keep some recent context
                    self.context.append({"role": "user", "text": text})
                    if len(self.context) > 5:
                        self.context = self.context[-5:]
                else:
                    self.event_manager.trigger_event("voice_status", {"listening": True, "state": "failed"})
                    self.event_manager.trigger_event("voice", {
                        "text": text,
                        "actions": [{"intent": "Unknown"}],
                        "success": False
                    })
                    
                time.sleep(0.5) # Prevent instant re-trigger
                    
            except sr.WaitTimeoutError:
                # Normal timeout when no one speaks
                continue
            except sr.UnknownValueError:
                self.event_manager.trigger_event("voice_status", {"listening": True, "state": "failed"})
                # Unintelligible
                pass
            except sr.RequestError as e:
                print(f"[VoiceEngine] Online recognition service error: {e}")
                self.event_manager.trigger_event("error", {"message": f"Online voice service unavailable: {e}"})
                time.sleep(2)
            except Exception as e:
                print(f"[VoiceEngine] Unexpected error: {e}")
                time.sleep(1)
