"""Contract-level compatibility checks for capability reuse."""
from __future__ import annotations

from app.core.asset_lifecycle.service import list_assets

IMAGE_GENERATION_REQUIREMENT = {
    "capability_type": "image_generation",
    "input_modality": ["text", "optional_image_reference"],
    "output_modality": "image",
    "required_output": "generated_image_asset",
    "consumer": "studio_ai",
    "execution_semantics": "generate_and_persist_image_asset",
}


def _values(asset: dict) -> str:
    content = asset.get("content") or {}
    return " ".join(str(value).casefold() for value in (asset.get("name"), asset.get("purpose"), content))


def classify_image_generation_asset(asset: dict) -> dict:
    content = dict(asset.get("content") or {})
    capability_type = str(content.get("capability_type") or content.get("type") or "").casefold()
    output = str(content.get("output_modality") or content.get("output_type") or content.get("required_output") or "").casefold()
    consumers = {str(item).casefold() for item in content.get("consumers", [])}
    consumer = str(content.get("consumer") or "").casefold()
    can_output_image = capability_type == "image_generation" and ("image" in output or content.get("produces_image_asset") is True)
    studio_compatible = not consumer and not consumers or consumer == "studio_ai" or "studio_ai" in consumers
    exact = can_output_image and studio_compatible and asset.get("status") == "ready"
    compatible = can_output_image and studio_compatible
    related = any(term in _values(asset) for term in ("图片", "图像", "image", "商品", "分镜", "storyboard"))
    classification = "EXACT_REUSE" if exact else "COMPATIBLE_REUSE" if compatible else "RELATED_BUT_INCOMPATIBLE" if related else "CAPABILITY_MISSING"
    return {
        "asset_id": asset.get("asset_id"), "name": asset.get("name"), "status": asset.get("status"),
        "classification": classification,
        "compatibility": {
            "capability_type": capability_type or None,
            "output_modality": output or None,
            "consumer_compatible": studio_compatible,
            "generated_image_asset": can_output_image,
        },
        "reason": "Capability must produce a generated image asset for studio_ai; topical commerce relevance is insufficient.",
    }


def lookup_image_generation_compatibility() -> dict:
    capability_assets = [item for item in list_assets(include_legacy=False) if item.get("asset_type") in {"agent", "skill", "workflow", "prompt", "capability", "connector"}]
    assessments = [classify_image_generation_asset(item) for item in capability_assets]
    reusable = [item for item in assessments if item["classification"] in {"EXACT_REUSE", "COMPATIBLE_REUSE"}]
    related = [item for item in assessments if item["classification"] == "RELATED_BUT_INCOMPATIBLE"]
    return {
        "required_contract": dict(IMAGE_GENERATION_REQUIREMENT),
        "status": reusable[0]["classification"] if reusable else "CAPABILITY_MISSING",
        "selected": reusable[0] if reusable else None,
        "related_but_incompatible": related,
        "assessments": assessments,
    }
