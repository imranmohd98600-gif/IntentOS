import pyttsx3
import threading
import queue
import time
from event_manager import EventManager

class TTSEngine:
    def __init__(self, event_manager: EventManager):
        self.event_manager = event_manager
        self.q = queue.Queue()
        self.is_running = False
        self.thread = None
        
        self.muted = False
        self.rate = 175
        self.volume = 1.0
        self.voice_id = None
        self.is_speaking = False
        
        # We initialize a temporary engine just to get voices,
        # but the actual speaking engine must be created inside the worker thread
        # because pyttsx3/COM on Windows is thread-bound.
        temp_engine = pyttsx3.init()
        self.voices = []
        try:
            for v in temp_engine.getProperty('voices'):
                self.voices.append({"id": v.id, "name": v.name})
            if self.voices:
                self.voice_id = self.voices[0]["id"]
        except Exception as e:
            print(f"[TTSEngine] Error loading voices: {e}")
        del temp_engine
            
    def start(self):
        if not self.is_running:
            self.is_running = True
            self.thread = threading.Thread(target=self._worker, daemon=True)
            self.thread.start()

    def stop_service(self):
        self.is_running = False
        self.stop_speaking()
        if self.thread:
            self.thread.join(timeout=2.0)

    def speak(self, text: str):
        if self.muted or not text:
            return
        # Broadcast that we queued something
        self.event_manager.trigger_event("tts_status", {"state": "queued", "text": text})
        self.q.put(text)

    def stop_speaking(self):
        # Clear queue
        with self.q.mutex:
            self.q.queue.clear()
        
        # If currently speaking, we interrupt. pyttsx3 engine.stop() needs to be called in the same thread.
        # We can pass a special control message to the queue if it's currently processing,
        # but for simplicity, clearing the queue stops subsequent messages.
        # To truly interrupt pyttsx3 on Windows SAPI, we'd have to destroy the engine or use async loop,
        # which is complex. We'll rely on short phrases and queue clearing for now.
        self.q.put("_STOP_")
        self.event_manager.trigger_event("tts_status", {"state": "idle", "text": ""})

    def set_settings(self, muted=None, rate=None, volume=None, voice_id=None):
        if muted is not None: self.muted = muted
        if rate is not None: self.rate = rate
        if volume is not None: self.volume = volume
        if voice_id is not None: self.voice_id = voice_id

    def _worker(self):
        # Initialize COM/pyttsx3 inside the worker thread
        import pythoncom
        import re
        pythoncom.CoInitialize()
        engine = pyttsx3.init()
        
        current_rate = None
        current_volume = None
        current_voice_id = None
        last_spoken_text = None
            
        while self.is_running:
            try:
                text = self.q.get(timeout=0.5)
                if text == "_STOP_":
                    engine.stop()
                    continue
                
                if not self.is_running or self.muted:
                    self.q.task_done()
                    continue

                # Deduplication
                if text == last_spoken_text:
                    self.q.task_done()
                    continue
                last_spoken_text = text

                self.is_speaking = True
                self.event_manager.trigger_event("tts_status", {"state": "speaking", "text": text})
                
                # Apply settings only if changed to avoid COM latency
                if current_rate != self.rate:
                    engine.setProperty('rate', self.rate)
                    current_rate = self.rate
                if current_volume != self.volume:
                    engine.setProperty('volume', self.volume)
                    current_volume = self.volume
                if self.voice_id and current_voice_id != self.voice_id:
                    engine.setProperty('voice', self.voice_id)
                    current_voice_id = self.voice_id
                
                # Split text into chunks to avoid long silences and allow interrupts
                # Split by sentence boundaries
                chunks = [c.strip() for c in re.split(r'(?<=[.!?])\s+', text) if c.strip()]
                if not chunks:
                    chunks = [text]
                
                interrupted = False
                for chunk in chunks:
                    # Check for stop token in queue
                    stop_requested = False
                    # We will drain the queue of any _STOP_ messages
                    msgs = []
                    while not self.q.empty():
                        try:
                            m = self.q.get_nowait()
                            msgs.append(m)
                            if m == "_STOP_":
                                stop_requested = True
                        except queue.Empty:
                            break
                    
                    # Put back non-stop messages
                    for m in msgs:
                        if m != "_STOP_":
                            self.q.put(m)
                            
                    if stop_requested or self.muted or not self.is_running:
                        engine.stop()
                        interrupted = True
                        break
                        
                    engine.say(chunk)
                    engine.runAndWait()
                    
                self.is_speaking = False
                self.q.task_done()
                
                # If queue is empty, we are idle
                if self.q.empty() and not interrupted:
                    self.event_manager.trigger_event("tts_status", {"state": "idle", "text": ""})
                    
            except queue.Empty:
                continue
            except Exception as e:
                print(f"[TTSEngine] Error during speech: {e}")
                self.is_speaking = False
                self.event_manager.trigger_event("tts_status", {"state": "error", "text": str(e)})
                
        pythoncom.CoUninitialize()
