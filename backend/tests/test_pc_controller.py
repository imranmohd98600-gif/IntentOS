import pytest
import time
from unittest.mock import patch, MagicMock
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pc_controller import PCController

@pytest.fixture
def mocked_pyautogui():
    with patch('pc_controller.pyautogui') as mock:
        mock.size.return_value = (1920, 1080)
        yield mock

def test_pc_controller_initialization(mocked_pyautogui):
    controller = PCController(smoothing_factor=0.5, margin_x=0.1, margin_y=0.1)
    assert controller.is_enabled == False
    assert controller.screen_width == 1920
    assert controller.screen_height == 1080

def test_move_cursor(mocked_pyautogui):
    controller = PCController(smoothing_factor=1.0, margin_x=0.1, margin_y=0.1)
    controller.enable()
    
    # Center (0.5, 0.5) should map to 959, 539 (half of 1919x1079)
    controller.handle_gesture({"name": "Index Extended", "x": 0.5, "y": 0.5})
    mocked_pyautogui.moveTo.assert_called_with(959, 539, _pause=False)

def test_corners(mocked_pyautogui):
    controller = PCController(smoothing_factor=1.0, margin_x=0.1, margin_y=0.1)
    controller.enable()
    
    # Top-left corner (x <= 0.1, y <= 0.1)
    controller.handle_gesture({"name": "Index Extended", "x": 0.05, "y": 0.05})
    mocked_pyautogui.moveTo.assert_called_with(0, 0, _pause=False)
    
    # Bottom-right corner (x >= 0.9, y >= 0.9)
    controller.handle_gesture({"name": "Index Extended", "x": 0.95, "y": 0.95})
    mocked_pyautogui.moveTo.assert_called_with(1919, 1079, _pause=False)

def test_smoothing(mocked_pyautogui):
    controller = PCController(smoothing_factor=0.5, margin_x=0.0, margin_y=0.0)
    controller.enable()
    
    # First move sets the position
    controller.handle_gesture({"name": "Index Extended", "x": 0.0, "y": 0.0})
    mocked_pyautogui.moveTo.assert_called_with(0, 0, _pause=False)
    
    # Second move applies smoothing: halfway to 1.0 (1919, 1079) -> (959, 539)
    controller.handle_gesture({"name": "Index Extended", "x": 1.0, "y": 1.0})
    mocked_pyautogui.moveTo.assert_called_with(959, 539, _pause=False)

def test_click_debounce(mocked_pyautogui):
    controller = PCController(margin_x=0.0, margin_y=0.0, smoothing_factor=1.0)
    controller.enable()
    
    # Transition to Pinch: should click and move
    controller.handle_gesture({"name": "Pinch", "x": 0.5, "y": 0.5})
    assert mocked_pyautogui.click.call_count == 1
    mocked_pyautogui.moveTo.assert_called_with(959, 539, _pause=False)
    
    # Continued Pinch: should move, but NOT click again
    controller.handle_gesture({"name": "Pinch", "x": 0.6, "y": 0.6})
    assert mocked_pyautogui.click.call_count == 1
    mocked_pyautogui.moveTo.assert_called_with(1151, 647, _pause=False)
    
    # Reset gesture
    controller.handle_gesture({"name": "Index Extended", "x": 0.6, "y": 0.6})
    
    # Wait for cooldown
    import time
    time.sleep(0.55)
    
    # Second Pinch: should click again
    controller.handle_gesture({"name": "Pinch", "x": 0.6, "y": 0.6})
    assert mocked_pyautogui.click.call_count == 2

def test_scroll(mocked_pyautogui):
    controller = PCController()
    controller.enable()
    
    # First frame of scroll sets reference
    controller.handle_gesture({"name": "Two Fingers", "y": 0.5})
    mocked_pyautogui.scroll.assert_not_called()
    
    # Wait for cooldown just in case
    time.sleep(0.15)
    
    # Move hand up significantly (y decreases by > threshold)
    controller.handle_gesture({"name": "Two Fingers", "y": 0.4})
    mocked_pyautogui.scroll.assert_called_with(150)  # Scroll up
    
    time.sleep(0.15)
    
    # Move hand down significantly (y increases by > threshold)
    controller.handle_gesture({"name": "Two Fingers", "y": 0.6})
    mocked_pyautogui.scroll.assert_called_with(-150) # Scroll down

def test_disabled_safety(mocked_pyautogui):
    controller = PCController()
    # Not enabled
    controller.handle_gesture({"name": "Pinch"})
    controller.handle_gesture({"name": "Index Extended", "x": 0.5, "y": 0.5})
    
    mocked_pyautogui.click.assert_not_called()
    mocked_pyautogui.moveTo.assert_not_called()

def test_zoom(mocked_pyautogui):
    controller = PCController(zoom_callback=MagicMock())
    controller.enable()
    controller.zoom_enabled = True
    
    # Initialize zoom reference
    controller.handle_gesture({"name": "Index Extended", "x": 0.5, "y": 0.5, "pinch_dist": 0.5})
    assert controller.zoom_ref_dist == 0.5
    
    # Wait for cooldown
    import time
    time.sleep(0.55)
    
    # Spread fingers -> Zoom In (distance increases)
    controller.handle_gesture({"name": "Index Extended", "x": 0.5, "y": 0.5, "pinch_dist": 0.65})
    mocked_pyautogui.hotkey.assert_called_with('ctrl', '+')
    assert controller.zoom_ref_dist == 0.65
    
    time.sleep(0.55)
    
    # Bring fingers together -> Zoom Out (distance decreases)
    controller.handle_gesture({"name": "Index Extended", "x": 0.5, "y": 0.5, "pinch_dist": 0.4})
    mocked_pyautogui.hotkey.assert_called_with('ctrl', '-')
    assert controller.zoom_ref_dist == 0.4
    
    # If zoom is disabled, no hotkeys should be pressed
    mocked_pyautogui.hotkey.reset_mock()
    controller.zoom_enabled = False
    time.sleep(0.55)
    controller.handle_gesture({"name": "Index Extended", "x": 0.5, "y": 0.5, "pinch_dist": 0.8})
    mocked_pyautogui.hotkey.assert_not_called()

def test_voice_actions(mocked_pyautogui):
    controller = PCController()
    controller.enable()
    
    # Keyboard
    controller.type_text("hello")
    mocked_pyautogui.write.assert_called_with("hello", interval=0.01)
    
    controller.keyboard_press("enter")
    mocked_pyautogui.press.assert_called_with("enter")
    
    controller.keyboard_shortcut("copy")
    mocked_pyautogui.hotkey.assert_called_with('ctrl', 'c')
    
    # Mouse
    controller.mouse_action("move", {"direction": "up"})
    mocked_pyautogui.moveRel.assert_called_with(0, -100)
    
    controller.mouse_action("click", {"button": "right"})
    mocked_pyautogui.click.assert_called_with(button="right")
    
    # Window
    controller.window_action("minimize")
    mocked_pyautogui.hotkey.assert_called_with('win', 'down')
    
    controller.window_action("tab_next")
    mocked_pyautogui.hotkey.assert_called_with('ctrl', 'tab')

