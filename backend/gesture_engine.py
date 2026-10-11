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
        
        wrist = hand_landmarks.landmark[self.mp_hands.HandLandmark.WRIST]
        
        index_mcp = hand_landmarks.landmark[self.mp_hands.HandLandmark.INDEX_FINGER_MCP]
        hand_size = self._calculate_distance(wrist, index_mcp)
        
        # Base/Pip for finger fold detection
        index_pip = hand_landmarks.landmark[self.mp_hands.HandLandmark.INDEX_FINGER_PIP]
        middle_pip = hand_landmarks.landmark[self.mp_hands.HandLandmark.MIDDLE_FINGER_PIP]
        ring_pip = hand_landmarks.landmark[self.mp_hands.HandLandmark.RING_FINGER_PIP]
        pinky_pip = hand_landmarks.landmark[self.mp_hands.HandLandmark.PINKY_PIP]
        
        # Check if fingers are up (y is smaller when higher on screen)
        index_up = index_tip.y < index_pip.y
        middle_up = middle_tip.y < middle_pip.y
        ring_up = ring_tip.y < ring_pip.y
        pinky_up = pinky_tip.y < pinky_pip.y
        
        pinch_dist = self._calculate_distance(thumb_tip, index_tip)
        norm_pinch = pinch_dist / (hand_size + 1e-6)
        
        gesture = "None"
        out_x = index_tip.x
        out_y = index_tip.y
        
        if not index_up and not middle_up and not ring_up and not pinky_up:
            gesture = "Closed Fist"
        elif index_up and middle_up and ring_up and pinky_up:
            gesture = "Open Palm"
        elif pinch_dist < 0.05:
            gesture = "Pinch"
        elif index_up and middle_up and not ring_up and not pinky_up:
            gesture = "Two Fingers"
            # For finger-only scrolling, use relative distance from wrist to fingertips
            avg_finger_y = (index_tip.y + middle_tip.y) / 2.0
            out_y = avg_finger_y - wrist.y
        elif index_up and not middle_up and not ring_up and not pinky_up:
            gesture = "Index Extended"

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
