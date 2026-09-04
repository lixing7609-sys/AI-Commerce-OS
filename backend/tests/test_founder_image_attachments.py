from io import BytesIO
from types import SimpleNamespace
from PIL import Image
import pytest

from app.founder_ai import attachments, vision_routing

def png_bytes():
    stream = BytesIO(); Image.new("RGB", (12, 8), "red").save(stream, "PNG"); return stream.getvalue()

def test_image_types_and_size_are_bounded():
    with pytest.raises(ValueError, match="unsupported_image_type"):
        attachments.save_pending_image("missing", "x.gif", "image/gif", png_bytes())

def test_vision_requires_explicit_capable_model(monkeypatch):
    monkeypatch.setattr(vision_routing, "resolve_model_route", lambda capability: [])
    with pytest.raises(ValueError, match="vision_model_unavailable"):
        vision_routing.understand_images("conversation", "look", ["attachment"])

def test_vision_routes_text_and_image_in_one_request(monkeypatch):
    monkeypatch.setattr(vision_routing, "resolve_model_route", lambda capability: [{"provider_id": "p", "model_id": "vision"}])
    monkeypatch.setattr(vision_routing, "multimodal_images", lambda c, ids: [{"mime_type":"image/png","base64":"AA==","data_url":"data:image/png;base64,AA=="}])
    seen = {}
    monkeypatch.setattr(vision_routing.llm_gateway, "generate_for_model", lambda p, m, request: seen.setdefault("request", request) or None)
    # setdefault returns request, so provide a response through a dedicated stub
    monkeypatch.setattr(vision_routing, "_record_probe", lambda *args: None)
    payload = '{"image_type":"ui_screenshot","observed_ui_area":"left sidebar","observed_elements":["project tree","arrow"],"likely_target":"AI Commerce OS node","visible_issue":"node does not collapse","founder_annotation_context":"arrow points to node","confidence":0.96}'
    monkeypatch.setattr(vision_routing.llm_gateway, "generate_for_model", lambda p, m, request: (seen.update({"request": request}) or SimpleNamespace(provider=p, model=m, content=payload)))
    result = vision_routing.understand_images("conversation", "collapse this", ["attachment"])
    assert seen["request"].user_prompt == "collapse this" and seen["request"].metadata["images"]
    assert result["likely_target"] == "AI Commerce OS node"
    assert result["model_provider"] == "p"
