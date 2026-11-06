import pytest
from command_router import CommandRouter

@pytest.fixture
def router():
    return CommandRouter()

def test_intentos_actions(router):
    # Pause commands
    assert router.parse("pause")["intent"] == "intentos_action"
    assert router.parse("pause control")["intent"] == "intentos_action"
    assert router.parse("pause.")["intent"] == "intentos_action"
    assert router.parse("Please pause control")["intent"] == "intentos_action"
    assert router.parse("pause")["params"]["action"] == "pause"

    # Resume / Start
    assert router.parse("resume")["params"]["action"] == "resume"
    assert router.parse("resume control")["params"]["action"] == "resume"
    assert router.parse("start")["params"]["action"] == "start"
    assert router.parse("start control")["params"]["action"] == "start"
    assert router.parse("enable control")["params"]["action"] == "start"

    # Stop / Emergency Stop
    assert router.parse("stop")["params"]["action"] == "stop"
    assert router.parse("emergency stop")["params"]["action"] == "stop"
    assert router.parse("stop control.")["params"]["action"] == "stop"

    # Zoom
    assert router.parse("enable zoom")["params"]["action"] == "enable_zoom"
    assert router.parse("disable zoom")["params"]["action"] == "disable_zoom"
    assert router.parse("zoom in")["params"]["action"] == "zoom_in"
    assert router.parse("zoom out")["params"]["action"] == "zoom_out"

def test_browser_search(router):
    res = router.parse("search for python tutorials")
    assert res["intent"] == "browser_search"
    assert res["params"]["query"] == "python tutorials"

    res = router.parse("google artificial intelligence")
    assert res["intent"] == "browser_search"
    assert res["params"]["query"] == "artificial intelligence"

    res = router.parse("search youtube for lo fi music")
    assert res["intent"] == "browser_search"
    assert res["params"]["engine"] == "youtube"
    assert res["params"]["query"] == "lo fi music"

    res = router.parse("open google and search for latest news")
    assert res["intent"] == "browser_search"
    assert res["params"]["query"] == "latest news"

def test_browser_open_and_tabs(router):
    assert router.parse("open google")["intent"] == "browser_open"
    assert router.parse("open youtube")["intent"] == "browser_open"
    assert router.parse("open new tab")["intent"] == "browser_new_tab"
    assert router.parse("new tab")["intent"] == "browser_new_tab"
    assert router.parse("close tab")["intent"] == "browser_close_tab"
    assert router.parse("close this tab")["intent"] == "browser_close_tab"
    assert router.parse("go back")["intent"] == "browser_back"
    assert router.parse("forward")["intent"] == "browser_forward"
    assert router.parse("refresh")["intent"] == "browser_refresh"

def test_mouse_and_scroll(router):
    assert router.parse("click")["intent"] == "mouse_click"
    assert router.parse("left click")["intent"] == "mouse_click"
    assert router.parse("right click")["intent"] == "mouse_click"
    assert router.parse("double click")["intent"] == "mouse_double_click"
    assert router.parse("scroll down")["intent"] == "scroll"
    assert router.parse("scroll down")["params"]["direction"] == "down"
    assert router.parse("scroll up")["intent"] == "scroll"
    assert router.parse("scroll up")["params"]["direction"] == "up"
    assert router.parse("page down")["intent"] == "scroll"
    assert router.parse("scroll to top")["intent"] == "scroll_extreme"
    assert router.parse("scroll to bottom")["intent"] == "scroll_extreme"

def test_keyboard_and_typing(router):
    assert router.parse("press enter")["intent"] == "keyboard_press"
    assert router.parse("enter")["intent"] == "keyboard_press"
    assert router.parse("press escape")["intent"] == "keyboard_press"
    assert router.parse("escape")["intent"] == "keyboard_press"
    assert router.parse("press tab")["intent"] == "keyboard_press"
    assert router.parse("select all")["intent"] == "keyboard_shortcut"
    assert router.parse("copy")["intent"] == "keyboard_shortcut"
    assert router.parse("paste")["intent"] == "keyboard_shortcut"
    
    res = router.parse("type Hello World")
    assert res["intent"] == "type_text"
    assert res["params"]["text"] == "Hello World"

    res = router.parse("write Testing IntentOS 123.")
    assert res["intent"] == "type_text"
    assert res["params"]["text"] == "Testing IntentOS 123"

def test_unknown_commands(router):
    assert router.parse("banana dance")["intent"] == "unknown"
    assert router.parse("flabbergasted")["intent"] == "unknown"
