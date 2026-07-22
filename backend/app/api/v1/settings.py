from fastapi import APIRouter, Depends

from app.core.edition import Edition, require_edition
from app.services.settings_service import SettingsService

router = APIRouter(
    prefix="/settings",
    tags=["Settings"],
)

_DIAGNOSTIC_EDITIONS = Depends(require_edition(Edition.DEVELOPER, Edition.DEVICE_ADMIN))
_OPERATOR_VISIBLE_EDITIONS = Depends(
    require_edition(Edition.DEVELOPER, Edition.OPERATOR, Edition.DEVICE_ADMIN)
)


@router.get("/integration-status", dependencies=[_DIAGNOSTIC_EDITIONS])
def get_integration_status():
    """
    集成配置状态（只返回布尔值，从不返回真实配置值）。
    """

    return SettingsService.get_integration_status()


@router.get("/llm-status", dependencies=[_OPERATOR_VISIBLE_EDITIONS])
def get_llm_status():
    """
    LLM Gateway 配置与可达性状态。只返回 Provider 名称、模型
    标识符和布尔可达性，从不返回 API Key 或 Base URL 凭据。
    """

    return SettingsService.get_llm_status()


@router.get("/system-info", dependencies=[_DIAGNOSTIC_EDITIONS])
def get_system_info():
    """
    系统信息（后端版本、数据库迁移版本、执行器健康状态、
    运行环境、Agent 数量）。不包含任何 Secret 或连接串。
    """

    return SettingsService.get_system_info()
