"""Compatibility adapters between legacy application records and domain views."""

from .task_adapter import (
    TaskViewModel,
    adapt_legacy_task,
    adapt_task_asset,
)

__all__ = ["TaskViewModel", "adapt_legacy_task", "adapt_task_asset"]
