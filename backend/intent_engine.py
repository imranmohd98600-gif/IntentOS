import threading
import time
from event_manager import EventManager
from gesture_engine import GestureEngine
from pc_controller import PCController
from voice_engine import VoiceEngine

from tts_engine import TTSEngine

class IntentEngine:
    def __init__(self, event_manager: EventManager):
        self.event_manager = event_manager
        self.is_running = False
        self.is_paused = False
        
        self.gesture_engine = GestureEngine(event_manager)
        
        supported_commands = self.get_supported_commands()
        self.voice_engine = VoiceEngine(event_manager, supported_commands)
        self.tts_engine = TTSEngine(event_manager)
        
        def on_zoom(action):
            self.event_manager.trigger_event("zoom_status", {"action": action})
            
        self.pc_controller = PCController(smoothing_factor=0.3, zoom_callback=on_zoom)
        
        self.event_manager.add_subscriber(self._on_event)

    def _generate_speech_response(self, payload: dict):
        reply = payload.get("reply")
        if reply:
            self.tts_engine.speak(reply)
            return

        # Fallback if no reply provided
        actions = payload.get("actions", [])
        if not actions: return
        
        main_action = actions[0]
        intent = main_action.get("intent")
        params = main_action.get("params", {})
        
        if intent == "browser_search":
            query = params.get("query", "your request")
            self.tts_engine.speak(f"Searching for {query}")
        elif intent == "browser_open":
            target = params.get("target", "the browser")
            self.tts_engine.speak(f"Opening {target}")
        elif intent == "type_text":
            self.tts_engine.speak("Typing text.")
        elif intent == "intentos_action":
            action = params.get("action")
            if action == "stop":
                self.tts_engine.speak("Stopping all controls.")
            elif action == "pause":
                self.tts_engine.speak("Pausing control.")
            elif action == "resume":
                self.tts_engine.speak("Resuming control.")
            elif action == "zoom_in":
                self.tts_engine.speak("Zooming in.")
            elif action == "zoom_out":
                self.tts_engine.speak("Zooming out.")
        elif intent == "scroll":
            direction = params.get("direction", "down")
            self.tts_engine.speak(f"Scrolling {direction}.")

    def _on_event(self, event_type: str, payload: dict):
        if event_type == "gesture":
            self.pc_controller.handle_gesture(payload)
        elif event_type == "voice":
            if not payload.get("success"):
                self.tts_engine.speak("I didn't quite catch that.")
                return
                
            self._generate_speech_response(payload)
            
            actions = payload.get("actions", [])
            
            for action_item in actions:
                intent = action_item.get("intent")
                params = action_item.get("params", {})
                
                if intent == "intentos_action":
                    action = params.get("action")
                    if action == "stop": self.stop()
                    elif action == "pause": self.pause()
                    elif action == "resume": self.resume()
                    elif action == "start": self.start()
                    elif action == "enable_zoom": self.enable_zoom()
                    elif action == "disable_zoom": self.disable_zoom()
                    elif action == "zoom_in": self.pc_controller.zoom_action("in")
                    elif action == "zoom_out": self.pc_controller.zoom_action("out")
                    # Voice enable/disable handled externally or via API
                    
                elif self.pc_controller and self.pc_controller.is_enabled:
                    if intent == "browser_search":
                        self.pc_controller.browser_search(params.get("engine", "default"), params.get("query", ""))
                    elif intent == "browser_open":
                        self.pc_controller.browser_open(params.get("target"))
                    elif intent == "browser_new_tab":
                        self.pc_controller.browser_action("new_tab")
                    elif intent == "browser_close_tab":
                        self.pc_controller.browser_action("close_tab")
                    elif intent == "browser_back":
                        self.pc_controller.browser_action("back")
                    elif intent == "browser_forward":
                        self.pc_controller.browser_action("forward")
                    elif intent == "browser_refresh":
                        self.pc_controller.browser_action("refresh")
                    elif intent == "mouse_move":
                        self.pc_controller.mouse_action("move", params)
                    elif intent == "mouse_click":
                        self.pc_controller.mouse_action("click", params)
                    elif intent == "mouse_double_click":
                        self.pc_controller.mouse_action("double_click", {})
                    elif intent == "scroll":
                        self.pc_controller.scroll_direction(params.get("direction"))
                    elif intent == "scroll_extreme":
                        self.pc_controller.mouse_action("scroll_extreme", params)
                    elif intent == "keyboard_press":
                        self.pc_controller.keyboard_press(params.get("key"))
                    elif intent == "keyboard_shortcut":
                        self.pc_controller.keyboard_shortcut(params.get("action"))
                    elif intent == "type_text":
                        self.pc_controller.type_text(params.get("text"))
                    elif intent == "window_minimize":
                        self.pc_controller.window_action("minimize")
                    elif intent == "window_maximize":
                        self.pc_controller.window_action("maximize")
                    elif intent == "window_switch":
                        self.pc_controller.window_action("switch")
                    elif intent == "tab_next":
                        self.pc_controller.window_action("tab_next")
                    elif intent == "tab_prev":
                        self.pc_controller.window_action("tab_prev")
                
                # Small pause between sequenced actions
                time.sleep(0.1)
                
            # Broadcast the result back to UI
            self.event_manager.trigger_event("voice_status", {"state": "completed"})

    def enable_zoom(self):
        if self.pc_controller:
            self.pc_controller.zoom_enabled = True
            self.event_manager.trigger_event("zoom_status", {"enabled": True, "action": "None"})

    def disable_zoom(self):
        if self.pc_controller:
            self.pc_controller.zoom_enabled = False
            self.event_manager.trigger_event("zoom_status", {"enabled": False, "action": "None"})
            
    def start(self):
        if not self.is_running:
            self.is_running = True
            self.is_paused = False
            self.gesture_engine.start()
            self.voice_engine.start()
            self.tts_engine.start()
            self.pc_controller.enable()
            self.event_manager.trigger_event("status_change", {"status": "running"})
            print("IntentOS Started")
        elif self.is_paused:
            self.resume()

    def pause(self):
        if self.is_running and not self.is_paused:
            self.is_paused = True
            self.gesture_engine.pause()
            self.pc_controller.disable()
            self.event_manager.trigger_event("status_change", {"status": "paused"})
            print("IntentOS Paused")

    def resume(self):
        if self.is_running and self.is_paused:
            self.is_paused = False
            self.gesture_engine.resume()
            self.pc_controller.enable()
            self.event_manager.trigger_event("status_change", {"status": "running"})
            print("IntentOS Resumed")

    def stop(self):
        self.is_running = False
        self.is_paused = False
        self.gesture_engine.stop()
        self.voice_engine.stop()
        self.tts_engine.stop_service()
        self.pc_controller.disable()
        self.event_manager.trigger_event("status_change", {"status": "stopped"})
        print("IntentOS Stopped")

    def get_status(self):
        pc_status = "offline"
        if self.pc_controller:
            pc_status = "ready" if self.pc_controller.is_enabled else "disabled"
            
        voice_status = "offline"
        if self.voice_engine:
            voice_status = "ready" if self.voice_engine.is_running else "disabled"

        gesture_status = "offline"
        if self.gesture_engine:
            gesture_status = "ready" if self.gesture_engine.is_running else "disabled"

        return {
            "running": self.is_running,
            "paused": self.is_paused,
            "gesture_engine": gesture_status,
            "voice_engine": voice_status,
            "pc_controller": pc_status,
            "zoom_enabled": self.pc_controller.zoom_enabled if self.pc_controller else False
        }

    def get_supported_gestures(self):
        return [
            {"id": "index_move", "name": "Cursor Move", "description": "Index finger extended"},
            {"id": "pinch_click", "name": "Left Click", "description": "Thumb and index pinch"},
            {"id": "two_finger_scroll", "name": "Scroll", "description": "Two fingers extended"},
            {"id": "open_palm", "name": "Pause/Resume", "description": "Open palm"}
        ]

    def get_supported_commands(self):
        return [
            "start control",
            "pause control",
            "resume control",
            "stop control",
            "scroll up",
            "scroll down",
            "zoom in",
            "zoom out",
            "stop zoom"
        ]
