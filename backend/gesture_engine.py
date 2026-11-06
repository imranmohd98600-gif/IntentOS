import cv2
import mediapipe as mp
import threading
import time
import math
from event_manager import EventManager

class GestureEngine:
    def __init__(self, event_manager: EventManager):
        self.event_manager = event_manager
        self.is_running = False
        self.is_paused = False
        self.thread = None
        self.cap = None
        
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7
        )
        self.mp_draw = mp.solutions.drawing_utils
        self.current_frame = None
        self.last_gesture = "None"
        
        self.lock = threading.Lock()

    def start(self):
        if not self.is_running:
            self.is_running = True
            self.is_paused = False
            self.cap = cv2.VideoCapture(0)
            if not self.cap.isOpened():
                self.event_manager.trigger_event("error", {"message": "Camera not found or permission denied."})
                self.is_running = False
                return
                
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            actual_w = self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)
            actual_h = self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
            print(f"[GestureEngine] Camera started at resolution {int(actual_w)}x{int(actual_h)}")
                
            self.thread = threading.Thread(target=self._run_loop, daemon=True)
            self.thread.start()

    def pause(self):
        self.is_paused = True

    def resume(self):
        self.is_paused = False

    def stop(self):
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=1.0)
        if self.cap:
            self.cap.release()
            self.cap = None
        self.current_frame = None

    def get_latest_frame(self):
        with self.lock:
            if self.current_frame is not None:
                encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 90]
                ret, buffer = cv2.imencode('.jpg', self.current_frame, encode_param)
                if ret:
                    return buffer.tobytes()
        return None

    def _calculate_distance(self, p1, p2):
        return math.hypot(p2.x - p1.x, p2.y - p1.y)

    def _detect_gesture(self, hand_landmarks):
        # Finger tips
        thumb_tip = hand_landmarks.landmark[self.mp_hands.HandLandmark.THUMB_TIP]
        index_tip = hand_landmarks.landmark[self.mp_hands.HandLandmark.INDEX_FINGER_TIP]
        middle_tip = hand_landmarks.landmark[self.mp_hands.HandLandmark.MIDDLE_FINGER_TIP]
        ring_tip = hand_landmarks.landmark[self.mp_hands.HandLandmark.RING_FINGER_TIP]
        pinky_tip = hand_landmarks.landmark[self.mp_hands.HandLandmark.PINKY_TIP]
        
        # DIP joints
        index_dip = hand_landmarks.landmark[self.mp_hands.HandLandmark.INDEX_FINGER_DIP]
        middle_dip = hand_landmarks.landmark[self.mp_hands.HandLandmark.MIDDLE_FINGER_DIP]
        ring_dip = hand_landmarks.landmark[self.mp_hands.HandLandmark.RING_FINGER_DIP]
        pinky_dip = hand_landmarks.landmark[self.mp_hands.HandLandmark.PINKY_DIP]
        
        # PIP joints
        index_pip = hand_landmarks.landmark[self.mp_hands.HandLandmark.INDEX_FINGER_PIP]
        middle_pip = hand_landmarks.landmark[self.mp_hands.HandLandmark.MIDDLE_FINGER_PIP]
        ring_pip = hand_landmarks.landmark[self.mp_hands.HandLandmark.RING_FINGER_PIP]
        pinky_pip = hand_landmarks.landmark[self.mp_hands.HandLandmark.PINKY_PIP]

        # MCP knuckles
        index_mcp = hand_landmarks.landmark[self.mp_hands.HandLandmark.INDEX_FINGER_MCP]
        middle_mcp = hand_landmarks.landmark[self.mp_hands.HandLandmark.MIDDLE_FINGER_MCP]
        ring_mcp = hand_landmarks.landmark[self.mp_hands.HandLandmark.RING_FINGER_MCP]
        pinky_mcp = hand_landmarks.landmark[self.mp_hands.HandLandmark.PINKY_MCP]

        wrist = hand_landmarks.landmark[self.mp_hands.HandLandmark.WRIST]
        hand_size = self._calculate_distance(wrist, index_mcp)
        
        def is_extended(tip, dip, pip, mcp):
            # Upright check: tip is above pip and dip (in image coords, smaller y = higher)
            upright = (tip.y < pip.y) and (tip.y < dip.y)
            # Distance from wrist check (rotation invariant)
            d_tip = self._calculate_distance(wrist, tip)
            d_pip = self._calculate_distance(wrist, pip)
            d_mcp = self._calculate_distance(wrist, mcp)
            far = (d_tip > d_pip * 1.15) and (d_tip > d_mcp * 1.25)
            return upright or far
            
        index_up = is_extended(index_tip, index_dip, index_pip, index_mcp)
        middle_up = is_extended(middle_tip, middle_dip, middle_pip, middle_mcp)
        ring_up = is_extended(ring_tip, ring_dip, ring_pip, ring_mcp)
        pinky_up = is_extended(pinky_tip, pinky_dip, pinky_pip, pinky_mcp)
        
        pinch_dist = self._calculate_distance(thumb_tip, index_tip)
        norm_pinch = pinch_dist / (hand_size + 1e-6)
        
        gesture = "None"
        out_x = index_tip.x
        out_y = index_tip.y
        
        # 1. Closed Fist: no fingers extended
        if not index_up and not middle_up and not ring_up and not pinky_up:
            gesture = "Closed Fist"
            
        # 2. Open Palm: all 4 fingers extended
        elif index_up and middle_up and ring_up and pinky_up:
            gesture = "Open Palm"
            
        # 3. Pinch Click: thumb tip and index tip close together
        elif norm_pinch < 0.22:
            gesture = "Pinch"
            out_x = (index_tip.x + thumb_tip.x) / 2.0
            out_y = (index_tip.y + thumb_tip.y) / 2.0
            
        # 4. Two Fingers Scroll: index and middle extended, ring/pinky not both extended
        elif index_up and middle_up and not (ring_up and pinky_up):
            gesture = "Two Fingers"
            out_y = (index_tip.y + middle_tip.y) / 2.0
            out_x = (index_tip.x + middle_tip.x) / 2.0
            
        # 5. Index Extended (Move cursor): index extended, middle not extended, not pinching
        elif index_up and not middle_up:
            gesture = "Index Extended"
            out_x = index_tip.x
            out_y = index_tip.y

        return gesture, out_x, out_y, norm_pinch

    def _run_loop(self):
        while self.is_running:
            success, image = self.cap.read()
            if not success:
                time.sleep(0.1)
                continue

            image = cv2.flip(image, 1)
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            # Process hands
            results = self.hands.process(rgb_image)
            
            gesture = "None"
            x, y = 0.0, 0.0
            norm_pinch = 0.0
            
            if results.multi_hand_landmarks:
                # Use only the first hand
                hand_landmarks = results.multi_hand_landmarks[0]
                self.mp_draw.draw_landmarks(
                    image, hand_landmarks, self.mp_hands.HAND_CONNECTIONS)
                
                if not self.is_paused:
                    gesture, x, y, norm_pinch = self._detect_gesture(hand_landmarks)
            
            # Emit continuous stream of cursor coordinates
            if gesture != "None":
                self.event_manager.trigger_event("gesture", {
                    "name": gesture, 
                    "confidence": 0.85,
                    "x": x,
                    "y": y,
                    "pinch_dist": norm_pinch
                })
                self.last_gesture = gesture
                
            with self.lock:
                self.current_frame = image
            
            time.sleep(0.03)  # Roughly 30 fps
