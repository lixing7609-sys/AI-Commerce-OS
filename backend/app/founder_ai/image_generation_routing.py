"""Provider-aware, model-agnostic routing for image generation requests."""
from __future__ import annotations

from dataclasses import asdict, dataclass


IMAGE_GENERATION_ROUTE_CATALOG = {
    # Both providers expose the OpenAI Images API. Model compatibility is still
    # established independently by discovery/probe evidence.
    "openai": {"api_mode": "openai_compatible", "request_mode": "images_generation", "endpoint_path": "/images/generations"},
    "ofoxai": {"api_mode": "openai_compatible", "request_mode": "images_generation", "endpoint_path": "/images/generations"},
}


@dataclass(frozen=True)
class ImageGenerationRoute:
    provider_type: str
    api_mode: str | None
    request_mode: str | None
    endpoint_path: str | None
    supported: bool
    reason: str | None

    def as_dict(self) -> dict:
        return asdict(self)


def resolve_image_generation_route(provider_type: str) -> ImageGenerationRoute:
    route = IMAGE_GENERATION_ROUTE_CATALOG.get(provider_type)
    if route is None:
        return ImageGenerationRoute(
            provider_type=provider_type,
            api_mode=None,
            request_mode=None,
            endpoint_path=None,
            supported=False,
            reason="provider_image_generation_request_mode_unregistered",
        )
    return ImageGenerationRoute(provider_type=provider_type, supported=True, reason=None, **route)


def build_image_generation_request(*, base_url: str, model_id: str, prompt: str) -> tuple[str, dict]:
    """Build the normalized OpenAI Images request shared by compatible providers."""
    return (
        f"{base_url.rstrip('/')}/images/generations",
        {"model": model_id, "prompt": prompt, "size": "1024x1024", "n": 1},
    )
