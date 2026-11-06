import re

class CommandRouter:
    def __init__(self):
        pass

    def parse(self, text: str):
        if not isinstance(text, str):
            text = str(text)
            
        raw_text = text.strip()
        text = raw_text.lower()
        
        # Strip trailing punctuation (e.g. "pause.", "click!", "scroll down?")
        text = re.sub(r'[\.,!?;\:]+$', '', text).strip()
        
        # Strip common polite / conversational filler prefixes
        text = re.sub(r'^(?:please|can you|could you|would you|i want to|kindly|hey intentos|intentos)\s+', '', text).strip()
        
        # 1. Search + Open intent combined
        match = re.search(r'open (google|chrome|youtube|browser)\s*and\s*search\s*(?:for\s*)?(.*)', text)
        if match:
            return {"intent": "browser_search", "params": {"engine": match.group(1), "query": match.group(2).strip()}}
            
        match = re.search(r'search youtube (?:for\s*)?(.*)', text)
        if match:
            return {"intent": "browser_search", "params": {"engine": "youtube", "query": match.group(1).strip()}}

        match = re.search(r'youtube search (?:for\s*)?(.*)', text)
        if match:
            return {"intent": "browser_search", "params": {"engine": "youtube", "query": match.group(1).strip()}}
            
        match = re.search(r'search (?:for\s*)?(.*)', text)
        if match:
            return {"intent": "browser_search", "params": {"engine": "default", "query": match.group(1).strip()}}
            
        match = re.search(r'google (?:for\s*)?(.*)', text)
        if match:
            return {"intent": "browser_search", "params": {"engine": "google", "query": match.group(1).strip()}}

        match = re.search(r'(?:find|look up) (?:information about|info on|for\s*)?(.*)', text)
        if match and match.group(1).strip():
            return {"intent": "browser_search", "params": {"engine": "default", "query": match.group(1).strip()}}
            
        # 2. Open App/Website
        match = re.search(r'open (google|chrome|youtube|gmail|browser|a new tab|new tab)', text)
        if match:
            target = match.group(1)
            if target in ["a new tab", "new tab"]:
                return {"intent": "browser_new_tab", "params": {}}
            return {"intent": "browser_open", "params": {"target": target}}
            
        if text in ["new tab", "open a tab", "open tab"]:
            return {"intent": "browser_new_tab", "params": {}}

        # 3. Browser actions
        if text in ["close this tab", "close tab", "close window"]:
            return {"intent": "browser_close_tab", "params": {}}
        if text in ["go back", "back"]:
            return {"intent": "browser_back", "params": {}}
        if text in ["go forward", "forward"]:
            return {"intent": "browser_forward", "params": {}}
        if text in ["refresh the page", "refresh page", "refresh", "reload", "reload page"]:
            return {"intent": "browser_refresh", "params": {}}
        
        # 4. Mouse / Scroll
        match = re.search(r'move cursor (up|down|left|right)', text)
        if match:
            return {"intent": "mouse_move", "params": {"direction": match.group(1)}}
        
        if text in ["click", "left click", "single click"]:
            return {"intent": "mouse_click", "params": {"button": "left"}}
        if text in ["double click"]:
            return {"intent": "mouse_double_click", "params": {}}
        if text in ["right click"]:
            return {"intent": "mouse_click", "params": {"button": "right"}}
        
        match = re.search(r'scroll (up|down)', text)
        if match:
            return {"intent": "scroll", "params": {"direction": match.group(1)}}

        match = re.search(r'page (up|down)', text)
        if match:
            return {"intent": "scroll", "params": {"direction": match.group(1)}}
        
        if text in ["scroll to the top", "scroll to top", "scroll top"]:
            return {"intent": "scroll_extreme", "params": {"direction": "top"}}
        if text in ["scroll to the bottom", "scroll to bottom", "scroll bottom"]:
            return {"intent": "scroll_extreme", "params": {"direction": "bottom"}}
        
        # 5. Keyboard & Text
        match = re.search(r'(?:press\s+)?(enter|escape|tab|backspace)$', text)
        if match:
            return {"intent": "keyboard_press", "params": {"key": match.group(1)}}
        
        if text in ["select all"]:
            return {"intent": "keyboard_shortcut", "params": {"action": "select_all"}}
        if text in ["copy"]:
            return {"intent": "keyboard_shortcut", "params": {"action": "copy"}}
        if text in ["paste"]:
            return {"intent": "keyboard_shortcut", "params": {"action": "paste"}}
        if text in ["undo"]:
            return {"intent": "keyboard_shortcut", "params": {"action": "undo"}}
        if text in ["redo"]:
            return {"intent": "keyboard_shortcut", "params": {"action": "redo"}}
        
        match = re.search(r'(?:type|write)\s+(.*)', text)
        if match:
            # Preserve original casing from raw_text for typing
            typed_match = re.search(r'(?:type|write)\s+(.*)', raw_text, re.IGNORECASE)
            typed_content = typed_match.group(1) if typed_match else match.group(1)
            # Remove trailing punctuation like periods if added by speech recognition
            if typed_content.endswith('.') and not raw_text.endswith('..'):
                typed_content = typed_content[:-1]
            return {"intent": "type_text", "params": {"text": typed_content}}
        
        # 6. Window / Tab Management
        if text in ["minimize window", "minimize"]:
            return {"intent": "window_minimize", "params": {}}
        if text in ["maximize window", "maximize"]:
            return {"intent": "window_maximize", "params": {}}
        if text in ["switch window", "switch app"]:
            return {"intent": "window_switch", "params": {}}
        if text in ["switch to the next tab", "next tab"]:
            return {"intent": "tab_next", "params": {}}
        if text in ["switch to the previous tab", "previous tab"]:
            return {"intent": "tab_prev", "params": {}}
        
        # 7. IntentOS controls
        if text in ["start", "start control", "enable control", "start intentos"]:
            return {"intent": "intentos_action", "params": {"action": "start"}}
        if text in ["pause", "pause control", "pause intentos", "pause tracking"]:
            return {"intent": "intentos_action", "params": {"action": "pause"}}
        if text in ["resume", "resume control", "resume intentos", "resume tracking", "continue"]:
            return {"intent": "intentos_action", "params": {"action": "resume"}}
        if text in ["stop", "stop control", "stop intentos", "stop tracking", "emergency stop", "quit", "exit"]:
            return {"intent": "intentos_action", "params": {"action": "stop"}}
        
        if text in ["enable zoom", "start zoom", "turn on zoom"]:
            return {"intent": "intentos_action", "params": {"action": "enable_zoom"}}
        if text in ["disable zoom", "stop zoom", "turn off zoom"]:
            return {"intent": "intentos_action", "params": {"action": "disable_zoom"}}
        if text in ["zoom in"]:
            return {"intent": "intentos_action", "params": {"action": "zoom_in"}}
        if text in ["zoom out"]:
            return {"intent": "intentos_action", "params": {"action": "zoom_out"}}
        
        if text in ["enable voice control", "start voice control", "enable voice"]:
            return {"intent": "intentos_action", "params": {"action": "enable_voice"}}
        if text in ["disable voice control", "stop voice control", "disable voice"]:
            return {"intent": "intentos_action", "params": {"action": "disable_voice"}}
        
        return {"intent": "unknown", "params": {}}
