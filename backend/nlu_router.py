import os
import json
import re
from typing import List, Dict, Any
from command_router import CommandRouter

class NLURouter:
    def __init__(self):
        self.fallback_router = CommandRouter()
        self.provider = os.getenv("AI_PROVIDER", "none").lower() # none, gemini, openai
        self.openai_client = None
        self.gemini_api_key = None
        self._init_provider()
        
    def _init_provider(self):
        if self.provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY")
            if api_key:
                self.gemini_api_key = api_key
            else:
                self.provider = "none"
        elif self.provider == "openai":
            try:
                from openai import OpenAI
                api_key = os.getenv("OPENAI_API_KEY")
                if api_key:
                    self.openai_client = OpenAI(api_key=api_key)
                else:
                    self.provider = "none"
            except ImportError:
                self.provider = "none"
                
    def parse(self, text: str, context: list = None) -> Dict[str, Any]:
        if not text:
            return {"reply": "", "actions": []}
            
        if self.provider == "gemini" and self.gemini_api_key:
            try:
                return self._parse_gemini(text, context)
            except Exception as e:
                print(f"[NLURouter] Gemini failed: {e}. Falling back to Regex.")
                
        elif self.provider == "openai" and self.openai_client:
            try:
                return self._parse_openai(text, context)
            except Exception as e:
                print(f"[NLURouter] OpenAI failed: {e}. Falling back to Regex.")
                
        # Fallback to Regex
        return self._parse_fallback(text)
        
    def _parse_fallback(self, text: str) -> Dict[str, Any]:
        sub_commands = re.split(r'\s+and\s+then\s+|\s+then\s+|\s+and\s+', text)
        actions = []
        for cmd in sub_commands:
            parsed = self.fallback_router.parse(cmd)
            if parsed and parsed.get("intent") != "unknown":
                actions.append(parsed)
        
        if not actions:
            actions = [self.fallback_router.parse(text)]
            
        # Basic fallback reply generation
        reply = "Done."
        if len(actions) == 1:
            intent = actions[0].get("intent")
            if intent == "browser_search":
                reply = f"Searching for {actions[0].get('params', {}).get('query', 'that')}."
            elif intent == "browser_open":
                reply = f"Opening {actions[0].get('params', {}).get('target', 'browser')}."
            elif intent == "unknown":
                reply = "I didn't quite catch that."
        else:
            reply = f"Executing {len(actions)} actions."
            
        return {"reply": reply, "actions": actions}

    def _get_system_prompt(self) -> str:
        return """You are the NLU core for IntentOS. Convert the user's natural language into a JSON object with a conversational "reply" and a sequential array of "actions".
Keep the reply brief, natural, and helpful. For multi-step tasks, summarize what you will do. For questions, provide a useful answer in the reply, along with any necessary actions (like opening a browser).
Valid intents:
- browser_search (params: engine, query)
- browser_open (params: target)
- browser_new_tab, browser_close_tab, browser_back, browser_forward, browser_refresh
- mouse_move (params: direction)
- mouse_click (params: button)
- mouse_double_click
- scroll (params: direction)
- scroll_extreme (params: direction)
- keyboard_press (params: key)
- keyboard_shortcut (params: action)
- type_text (params: text)
- window_minimize, window_maximize, window_switch, tab_next, tab_prev
- intentos_action (params: action -> start, pause, resume, stop, enable_zoom, disable_zoom, zoom_in, zoom_out)

Respond ONLY with valid JSON. No markdown formatting.
Example input: "Open Google, search for birds, and press enter"
Example output:
{
  "reply": "Sure, I'll open Google and search for birds.",
  "actions": [
    {"intent": "browser_open", "params": {"target": "google"}},
    {"intent": "browser_search", "params": {"engine": "default", "query": "birds"}},
    {"intent": "keyboard_press", "params": {"key": "enter"}}
  ]
}"""

    def _parse_gemini(self, text: str, context: list) -> List[Dict[str, Any]]:
        import requests
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_api_key}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "system_instruction": {
                "parts": [{"text": self._get_system_prompt()}]
            },
            "contents": [
                {"parts": [{"text": text}]}
            ],
            "generationConfig": {
                "temperature": 0.0
            }
        }
        resp = requests.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        content = content.replace("```json", "").replace("```", "").strip()
        return json.loads(content)

    def _parse_openai(self, text: str, context: list) -> List[Dict[str, Any]]:
        messages = [
            {"role": "system", "content": self._get_system_prompt()},
            {"role": "user", "content": text}
        ]
        response = self.openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            temperature=0
        )
        content = response.choices[0].message.content.replace("```json", "").replace("```", "").strip()
        return json.loads(content)
