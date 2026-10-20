import base64
import json
import sys
from pathlib import Path

from google import genai
from google.genai import types

import main as mark_l

BASE_DIR = Path(__file__).resolve().parent
API_KEY_PATH = BASE_DIR / "config" / "api_keys.json"
MODEL = "gemini-3.6-flash"


class BridgePlayer:
    muted = True
    current_file = None

    def write_log(self, *_args, **_kwargs):
        pass

    def set_state(self, *_args, **_kwargs):
        pass

    def show_content(self, *_args, **_kwargs):
        pass

    def start_camera_stream(self):
        pass

    def stop_camera_stream(self):
        pass


def api_key():
    config = json.loads(API_KEY_PATH.read_text(encoding="utf-8"))
    return config["gemini_api_key"]


def execute_tool(name, args, player):
    if name == "open_app":
        return mark_l.open_app(parameters=args, response=None, player=player)
    if name == "weather_report":
        return mark_l.weather_action(parameters=args, player=player)
    if name == "browser_control":
        return mark_l.browser_control(parameters=args, player=player)
    if name == "file_controller":
        return mark_l.file_controller(parameters=args, player=player)
    if name == "send_message":
        return mark_l.send_message(parameters=args, response=None, player=player, session_memory=None)
    if name == "reminder":
        return mark_l.reminder(parameters=args, response=None, player=player)
    if name == "youtube_video":
        return mark_l.youtube_video(parameters=args, response=None, player=player)
    if name == "computer_settings":
        return mark_l.computer_settings(parameters=args, response=None, player=player)
    if name == "desktop_control":
        return mark_l.desktop_control(parameters=args, player=player)
    if name == "computer_control":
        return mark_l.computer_control(parameters=args, player=player)
    if name == "web_search":
        return mark_l.web_search_action(parameters=args, player=player)
    if name == "system_status":
        return mark_l.get_system_status()
    return f"Tool {name} is not available in headless mode."


def answer(request):
    client = genai.Client(api_key=api_key(), http_options={"api_version": "v1beta"})
    player = BridgePlayer()
    prompt = request.get("prompt", "").strip()
    audio = request.get("audio")
    mime_type = request.get("mimeType") or "audio/webm"

    if audio:
        contents = [
            types.Part.from_text(
                text="Listen to this voice command, execute the requested action when possible, and answer in one or two concise sentences."
            ),
            types.Part.from_bytes(data=base64.b64decode(audio), mime_type=mime_type),
        ]
    else:
        contents = prompt

    config = types.GenerateContentConfig(
        temperature=0.3,
        max_output_tokens=256,
        tools=[types.Tool(function_declarations=mark_l.TOOL_DECLARATIONS)],
        system_instruction=(
            "You are ULTRON, a concise desktop assistant. Use the available tools for actions "
            "instead of claiming an action was completed. Never mention Mark-L or Jarvis."
        ),
    )
    response = client.models.generate_content(model=MODEL, contents=contents, config=config)

    if response.function_calls:
        tool_parts = []
        for call in response.function_calls:
            try:
                result = execute_tool(call.name, dict(call.args or {}), player)
            except Exception as exc:
                result = f"Action failed: {exc}"
            tool_parts.append(
                types.Part.from_function_response(
                    name=call.name,
                    response={"result": str(result or "Done.")},
                )
            )
        response = client.models.generate_content(
            model=MODEL,
            contents=[contents, response.candidates[0].content, types.Content(role="user", parts=tool_parts)],
            config=config,
        )

    return response.text or "I could not generate an answer."


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.read())
        print(json.dumps({"answer": answer(request)}))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        raise
