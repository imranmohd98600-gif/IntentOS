import pyautogui
import time
from typing import Dict, Any

# Ensure failsafe is enabled
pyautogui.FAILSAFE = True

class PCController:
    def __init__(self, smoothing_factor: float = 0.5, margin_x: float = 0.15, margin_y: float = 0.15, zoom_callback=None):
        self.is_enabled = False
        self.screen_width, self.screen_height = pyautogui.size()
        self.zoom_callback = zoom_callback
        
        # Deadzones/margins so user doesn't have to reach the absolute edge of the camera
        self.margin_x = margin_x
        self.margin_y = margin_y
        
        # Cursor smoothing
        self.smoothing_factor = smoothing_factor
        self.last_x, self.last_y = None, None
        
        # Debounce
        self.last_click_time = 0.0
        self.click_cooldown = 0.5  # seconds
        
        # Scrolling state
        self.last_scroll_time = 0.0
        self.scroll_cooldown = 0.1
        self.scroll_ref_y = None
        self.scroll_threshold = 0.02
        
        self.active_gesture = "None"
        
        # Zooming state
        self.zoom_enabled = False
        self.last_zoom_time = 0.0
        self.zoom_cooldown = 0.5
        self.zoom_ref_dist = None
        self.zoom_threshold = 0.1  # normalized distance threshold
        
        print(f"[PCController] Initialized with screen resolution: {self.screen_width}x{self.screen_height}")

    def enable(self):
        self.is_enabled = True
        self.last_x, self.last_y = None, None
        self.active_gesture = "None"
        self.scroll_ref_y = None
        self.zoom_ref_dist = None

    def disable(self):
        self.is_enabled = False

    def handle_gesture(self, gesture_data: Dict[str, Any]):
        if not self.is_enabled:
            return

        name = gesture_data.get("name")
        x_norm = gesture_data.get("x")
        y_norm = gesture_data.get("y")
        pinch_dist = gesture_data.get("pinch_dist")
        
        # Reset scroll and zoom references if gesture changed
        if name != "Two Fingers":
            self.scroll_ref_y = None
        if name != "Index Extended":
            self.zoom_ref_dist = None

        if name == "Index Extended" and x_norm is not None and y_norm is not None:
            self._move_cursor(x_norm, y_norm)
            if self.zoom_enabled and pinch_dist is not None:
                self._handle_zoom(pinch_dist)
            
        elif name == "Pinch":
            # Allow cursor movement while pinching to maintain accuracy before the click registers
            if x_norm is not None and y_norm is not None:
                self._move_cursor(x_norm, y_norm)
                
            # Only click if we just transitioned into a Pinch
            if self.active_gesture != "Pinch":
                self._click()
            
        elif name == "Two Fingers" and y_norm is not None:
            self._scroll(y_norm)
            
        self.active_gesture = name

    def _move_cursor(self, x_norm: float, y_norm: float):
        # Convert normalized coordinates [0.0, 1.0] to screen pixels using margins
        # The camera image is already mirrored in gesture_engine, so x_norm goes 0 (left) to 1 (right) naturally.
        
        # Apply margins to get the active area
        active_w = 1.0 - (2 * self.margin_x)
        active_h = 1.0 - (2 * self.margin_y)
        
        adjusted_x = (x_norm - self.margin_x) / active_w
        adjusted_y = (y_norm - self.margin_y) / active_h
        
        # Clamp to [0, 1]
        clamped_x = max(0.0, min(1.0, adjusted_x))
        clamped_y = max(0.0, min(1.0, adjusted_y))
        
        max_x = self.screen_width - 1
        max_y = self.screen_height - 1
        target_x = int(clamped_x * max_x)
        target_y = int(clamped_y * max_y)

        # Apply smoothing
        if self.last_x is not None and self.last_y is not None:
            smooth_x = int(self.last_x + (target_x - self.last_x) * self.smoothing_factor)
            smooth_y = int(self.last_y + (target_y - self.last_y) * self.smoothing_factor)
        else:
            smooth_x, smooth_y = target_x, target_y

        self.last_x, self.last_y = smooth_x, smooth_y
        
        # Rate-limited diagnostic log
        current_time = time.time()
        if not hasattr(self, 'last_log_time') or current_time - self.last_log_time > 1.0:
            print(f"[PCController] Moving to {smooth_x}, {smooth_y} (norm: {x_norm:.2f}, {y_norm:.2f})")
            self.last_log_time = current_time

        # Actually move the mouse
        pyautogui.moveTo(smooth_x, smooth_y, _pause=False)

    def _click(self):
        current_time = time.time()
        if current_time - self.last_click_time > self.click_cooldown:
            pyautogui.click(_pause=False)
            self.last_click_time = current_time

    def _scroll(self, y_norm: float):
        current_time = time.time()
        
        # Initialize reference point if we just started scrolling
        if self.scroll_ref_y is None:
            self.scroll_ref_y = y_norm
            return
            
        if current_time - self.last_scroll_time > self.scroll_cooldown:
            delta = y_norm - self.scroll_ref_y
            
            # If movement exceeds threshold
            if abs(delta) > self.scroll_threshold:
                # scroll direction: delta positive means hand moved down screen (y increases)
                # Usually hand down -> scroll down -> pyautogui.scroll negative
                scroll_amount = -150 if delta > 0 else 150
                pyautogui.scroll(scroll_amount)
                
                # Update reference so you have to move again to scroll more
                self.scroll_ref_y = y_norm
                self.last_scroll_time = current_time

    def scroll_direction(self, direction: str):
        if not self.is_enabled:
            return
        if direction == "up":
            pyautogui.scroll(200)
        elif direction == "down":
            pyautogui.scroll(-200)

    def _handle_zoom(self, pinch_dist: float):
        if self.zoom_ref_dist is None:
            self.zoom_ref_dist = pinch_dist
            return
            
        current_time = time.time()
        if current_time - self.last_zoom_time > self.zoom_cooldown:
            delta = pinch_dist - self.zoom_ref_dist
            if abs(delta) > self.zoom_threshold:
                if delta > 0:
                    self.zoom_action("in")
                else:
                    self.zoom_action("out")
                self.zoom_ref_dist = pinch_dist
                self.last_zoom_time = current_time

    def zoom_action(self, direction: str):
        if not self.is_enabled:
            return
        if direction == "in":
            print("[PCController] Zoom In")
            pyautogui.hotkey('ctrl', '+')
            if self.zoom_callback:
                self.zoom_callback("Zoom In")
        elif direction == "out":
            print("[PCController] Zoom Out")
            pyautogui.hotkey('ctrl', '-')
            if self.zoom_callback:
                self.zoom_callback("Zoom Out")

    # Voice Command Actions
    def browser_open(self, target: str):
        import webbrowser
        urls = {
            "google": "https://www.google.com",
            "chrome": "https://www.google.com",
            "youtube": "https://www.youtube.com",
            "gmail": "https://mail.google.com",
            "browser": "https://www.google.com"
        }
        url = urls.get(target.lower(), "https://www.google.com")
        webbrowser.open(url)

    def browser_search(self, engine: str, query: str):
        import webbrowser
        import urllib.parse
        encoded_query = urllib.parse.quote(query)
        if engine == "youtube":
            webbrowser.open(f"https://www.youtube.com/results?search_query={encoded_query}")
        else:
            webbrowser.open(f"https://www.google.com/search?q={encoded_query}")

    def browser_action(self, action: str):
        if action == "back": pyautogui.hotkey('alt', 'left')
        elif action == "forward": pyautogui.hotkey('alt', 'right')
        elif action == "refresh": pyautogui.hotkey('ctrl', 'r')
        elif action == "new_tab": pyautogui.hotkey('ctrl', 't')
        elif action == "close_tab": pyautogui.hotkey('ctrl', 'w')

    def keyboard_press(self, key: str):
        valid_keys = {"enter": "enter", "escape": "esc", "tab": "tab", "backspace": "backspace"}
        if key in valid_keys:
            pyautogui.press(valid_keys[key])

    def keyboard_shortcut(self, action: str):
        if action == "select_all": pyautogui.hotkey('ctrl', 'a')
        elif action == "copy": pyautogui.hotkey('ctrl', 'c')
        elif action == "paste": pyautogui.hotkey('ctrl', 'v')
        elif action == "undo": pyautogui.hotkey('ctrl', 'z')
        elif action == "redo": pyautogui.hotkey('ctrl', 'y')

    def type_text(self, text: str):
        pyautogui.write(text, interval=0.01)

    def window_action(self, action: str):
        if action == "minimize":
            pyautogui.hotkey('win', 'down')
        elif action == "maximize":
            pyautogui.hotkey('win', 'up')
        elif action == "switch":
            pyautogui.hotkey('alt', 'tab')
        elif action == "tab_next":
            pyautogui.hotkey('ctrl', 'tab')
        elif action == "tab_prev":
            pyautogui.hotkey('ctrl', 'shift', 'tab')

    def mouse_action(self, action: str, params: dict):
        if action == "move":
            direction = params.get("direction")
            offset = 100
            if direction == "up": pyautogui.moveRel(0, -offset)
            elif direction == "down": pyautogui.moveRel(0, offset)
            elif direction == "left": pyautogui.moveRel(-offset, 0)
            elif direction == "right": pyautogui.moveRel(offset, 0)
        elif action == "click":
            button = params.get("button", "left")
            pyautogui.click(button=button)
        elif action == "double_click":
            pyautogui.doubleClick()
        elif action == "scroll_extreme":
            direction = params.get("direction")
            if direction == "top": pyautogui.press('home')
            elif direction == "bottom": pyautogui.press('end')
