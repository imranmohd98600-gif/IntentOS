import pytest
from nlu_router import NLURouter

def test_fallback_router_single():
    router = NLURouter()
    
    # Combined open and search
    parsed = router.parse("open Google and search what is the name of a bird")
    actions = parsed.get("actions", [])
    assert len(actions) == 2
    assert actions[0]["intent"] == "browser_open"
    assert actions[1]["intent"] == "browser_search"
    assert actions[1]["params"]["query"] == "what is the name of a bird"

def test_fallback_router_multiple():
    router = NLURouter()
    
    parsed = router.parse("open google and then type hello world and then press enter")
    actions = parsed.get("actions", [])
    assert len(actions) == 3
    
    assert actions[0]["intent"] == "browser_open"
    assert actions[0]["params"]["target"] == "google"
    
    assert actions[1]["intent"] == "type_text"
    assert actions[1]["params"]["text"] == "hello world"
    
    assert actions[2]["intent"] == "keyboard_press"
    assert actions[2]["params"]["key"] == "enter"

def test_fallback_router_unknown():
    router = NLURouter()
    parsed = router.parse("do a backflip")
    actions = parsed.get("actions", [])
    assert len(actions) == 1
    assert actions[0]["intent"] == "unknown"
