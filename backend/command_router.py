import re

class CommandRouter:
    def __init__(self):
        pass

    def parse(self, text: str):
        text = text.lower().strip()
        
        # 1. Search + Open intent combined
        match = re.search(r'open (google|chrome|youtube|browser)\s*and\s*search\s*(?:for\s*)?(.*)', text)
        if match:
            return {"intent": "browser_search", "params": {"engine": match.group(1), "query": match.group(2)}}
            
        match = re.search(r'search (?:for\s*)?(.*)', text)
        if match:
            return {"intent": "browser_search", "params": {"engine": "default", "query": match.group(1)}}
            
        match = re.search(r'google (.*)', text)
        if match:
            return {"intent": "browser_search", "params": {"engine": "google", "query": match.group(1)}}
            
        match = re.search(r'search youtube (?:for\s*)?(.*)', text)
        if match:
            return {"intent": "browser_search", "params": {"engine": "youtube", "query": match.group(1)}}
            
        # 2. Open App/Website
        match = re.search(r'open (google|chrome|youtube|gmail|a new tab|new tab)', text)
        if match:
            target = match.group(1)
            if target in ["a new tab", "new tab"]:
                return {"intent": "browser_new_tab", "params": {}}
            return {"intent": "browser_open", "params": {"target": target}}
            
        # 3. Browser actions
        if text in ["close this tab", "close tab"]: return {"intent": "browser_close_tab", "params": {}}
        if text in ["go back"]: return {"intent": "browser_back", "params": {}}
        if text in ["go forward"]: return {"intent": "browser_forward", "params": {}}
        if text in ["refresh the page", "refresh page", "reload"]: return {"intent": "browser_refresh", "params": {}}
        
        # 4. Mouse / Scroll
        match = re.search(r'move cursor (up|down|left|right)', text)
        if match: return {"intent": "mouse_move", "params": {"direction": match.group(1)}}
        
        if text in ["click", "left click"]: return {"intent": "mouse_click", "params": {"button": "left"}}
        if text in ["double click"]: return {"intent": "mouse_double_click", "params": {}}
        if text in ["right click"]: return {"intent": "mouse_click", "params": {"button": "right"}}
        
        match = re.search(r'scroll (up|down)', text)
        if match: return {"intent": "scroll", "params": {"direction": match.group(1)}}
        
        if text in ["scroll to the top", "scroll to top"]: return {"intent": "scroll_extreme", "params": {"direction": "top"}}
        if text in ["scroll to the bottom", "scroll to bottom"]: return {"intent": "scroll_extreme", "params": {"direction": "bottom"}}
        
        # 5. Keyboard & Text
        match = re.search(r'press (enter|escape|tab|backspace)', text)
        if match: return {"intent": "keyboard_press", "params": {"key": match.group(1)}}
        
        if text in ["select all"]: return {"intent": "keyboard_shortcut", "params": {"action": "select_all"}}
        if text in ["copy"]: return {"intent": "keyboard_shortcut", "params": {"action": "copy"}}
        if text in ["paste"]: return {"intent": "keyboard_shortcut", "params": {"action": "paste"}}
        if text in ["undo"]: return {"intent": "keyboard_shortcut", "params": {"action": "undo"}}
        if text in ["redo"]: return {"intent": "keyboard_shortcut", "params": {"action": "redo"}}
        
        match = re.search(r'(?:type|write) (.*)', text)
        if match: return {"intent": "type_text", "params": {"text": match.group(1)}}
        
        # 6. Window / Tab Management
        if text in ["minimize window", "minimize"]: return {"intent": "window_minimize", "params": {}}
        if text in ["maximize window", "maximize"]: return {"intent": "window_maximize", "params": {}}
        if text in ["switch window"]: return {"intent": "window_switch", "params": {}}
        if text in ["switch to the next tab", "next tab"]: return {"intent": "tab_next", "params": {}}
        if text in ["switch to the previous tab", "previous tab"]: return {"intent": "tab_prev", "params": {}}
        
        # 7. IntentOS controls
        if text in ["start control", "enable control"]: return {"intent": "intentos_action", "params": {"action": "start"}}
        if text in ["pause control"]: return {"intent": "intentos_action", "params": {"action": "pause"}}
        if text in ["resume control"]: return {"intent": "intentos_action", "params": {"action": "resume"}}
        if text in ["stop control"]: return {"intent": "intentos_action", "params": {"action": "stop"}}
        
        if text in ["enable zoom", "start zoom"]: return {"intent": "intentos_action", "params": {"action": "enable_zoom"}}
        if text in ["disable zoom", "stop zoom"]: return {"intent": "intentos_action", "params": {"action": "disable_zoom"}}
        if text in ["zoom in"]: return {"intent": "intentos_action", "params": {"action": "zoom_in"}}
        if text in ["zoom out"]: return {"intent": "intentos_action", "params": {"action": "zoom_out"}}
        
        if text in ["enable voice control", "start voice control"]: return {"intent": "intentos_action", "params": {"action": "enable_voice"}}
        if text in ["disable voice control", "stop voice control"]: return {"intent": "intentos_action", "params": {"action": "disable_voice"}}
        
        return {"intent": "unknown", "params": {}}
