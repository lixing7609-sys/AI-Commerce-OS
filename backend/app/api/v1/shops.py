import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.core.edition import Edition, require_edition
from app.models.shop_api import (
    ConnectionTestResponse,
    OAuthStartResponse,
    ShopCreateRequest,
    ShopCredentialSummary,
    ShopCredentialsUpdateRequest,
    ShopItemResponse,
    ShopListResponse,
    ShopUpdateRequest,
)
from app.models.shop_db import SHOP_CONNECTION_STATUSES, SHOP_PLATFORMS, SHOP_STATUSES
from app.services.credential_encryption_service import (
    CredentialEncryptionNotConfiguredError,
)
from app.services.oauth_state_service import OAuthStateService
from app.services.shop_service import (
    DuplicatePlatformShopIdError,
    ShopService,
)

logger = logging.getLogger("app.shops_api")

router = APIRouter(
    prefix="/shops",
    tags=["Shops"],
    dependencies=[Depends(require_edition(Edition.DEVELOPER, Edition.OPERATOR))],
)


def _to_item_response(shop, counts: dict[str, int] | None = None) -> ShopItemResponse:
    credentials = ShopService.get_credentials(shop.id)
    counts = counts or {
        "task_count": ShopService.get_task_count(shop.id),
        "deliverable_count": ShopService.get_deliverable_count(shop.id),
    }

    return ShopItemResponse.model_validate(shop).model_copy(
        update={
            "task_count": counts["task_count"],
            "deliverable_count": counts["deliverable_count"],
            "credentials": [
                ShopCredentialSummary(
                    credential_type=row.credential_type,
                    configured=row.configured,
                    value_mask=row.value_mask,
                    expires_at=row.expires_at,
                )
                for row in credentials
            ],
        }
    )


@router.get("", response_model=ShopListResponse)
def list_shops(
    platform: str | None = None,
    status: str | None = None,
    connection_status: str | None = None,
    keyword: str | None = None,
):
    if platform is not None and platform not in SHOP_PLATFORMS:
        raise HTTPException(status_code=422, detail="不支持的平台")

    if status is not None and status not in SHOP_STATUSES:
        raise HTTPException(status_code=422, detail="不支持的店铺状态")

    if (
        connection_status is not None
        and connection_status not in SHOP_CONNECTION_STATUSES
    ):
        raise HTTPException(status_code=422, detail="不支持的连接状态")

    shops = ShopService.list_shops(
        platform=platform,
        status=status,
        connection_status=connection_status,
        keyword=keyword or None,
    )

    counts = ShopService.get_task_deliverable_counts([shop.id for shop in shops])

    items = [
        _to_item_response(shop, counts.get(shop.id))
        for shop in shops
    ]

    return ShopListResponse(items=items, total=len(items))


@router.post("", response_model=ShopItemResponse, status_code=201)
def create_shop(request: ShopCreateRequest):
    try:
        shop = ShopService.create_shop(request)
    except DuplicatePlatformShopIdError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except Exception as error:
        logger.error("shop creation failed: error_type=%s", type(error).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"创建店铺失败（{type(error).__name__}）",
        ) from error

    return _to_item_response(shop)


@router.get("/{shop_id}", response_model=ShopItemResponse)
def get_shop(shop_id: int):
    shop = ShopService.get_shop(shop_id)

    if shop is None:
        raise HTTPException(status_code=404, detail=f"未找到店铺：{shop_id}")

    return _to_item_response(shop)


@router.patch("/{shop_id}", response_model=ShopItemResponse)
def update_shop(shop_id: int, request: ShopUpdateRequest):
    shop = ShopService.update_shop(shop_id, request)

    if shop is None:
        raise HTTPException(status_code=404, detail=f"未找到店铺：{shop_id}")

    return _to_item_response(shop)


@router.post("/{shop_id}/disable", response_model=ShopItemResponse)
def disable_shop(shop_id: int):
    shop = ShopService.disable_shop(shop_id)

    if shop is None:
        raise HTTPException(status_code=404, detail=f"未找到店铺：{shop_id}")

    return _to_item_response(shop)


@router.post("/{shop_id}/enable", response_model=ShopItemResponse)
def enable_shop(shop_id: int):
    shop = ShopService.enable_shop(shop_id)

    if shop is None:
        raise HTTPException(status_code=404, detail=f"未找到店铺：{shop_id}")

    return _to_item_response(shop)


@router.post("/{shop_id}/archive", response_model=ShopItemResponse)
def archive_shop(shop_id: int):
    shop = ShopService.archive_shop(shop_id)

    if shop is None:
        raise HTTPException(status_code=404, detail=f"未找到店铺：{shop_id}")

    return _to_item_response(shop)


@router.delete("/{shop_id}")
def delete_shop(shop_id: int):
    if ShopService.get_shop(shop_id) is None:
        raise HTTPException(status_code=404, detail=f"未找到店铺：{shop_id}")

    deleted, reason = ShopService.delete_shop(shop_id)

    if not deleted:
        raise HTTPException(status_code=409, detail=reason)

    return {"success": True}


@router.put("/{shop_id}/credentials", response_model=list[ShopCredentialSummary])
def update_shop_credentials(shop_id: int, request: ShopCredentialsUpdateRequest):
    """
    只更新本次实际提供的非空字段；日志不记录请求体（避免任何
    Secret 明文进入日志）。
    """

    if ShopService.get_shop(shop_id) is None:
        raise HTTPException(status_code=404, detail=f"未找到店铺：{shop_id}")

    fields = request.provided_fields()

    try:
        rows = ShopService.upsert_credentials(shop_id, fields)
    except CredentialEncryptionNotConfiguredError as error:
        raise HTTPException(
            status_code=503,
            detail="Secret 加密未配置，无法保存店铺凭据，请联系管理员配置加密密钥",
        ) from error

    logger.info(
        "shop credentials updated: shop_id=%s fields=%s",
        shop_id,
        sorted(fields.keys()),
    )

    return [
        ShopCredentialSummary(
            credential_type=row.credential_type,
            configured=row.configured,
            value_mask=row.value_mask,
            expires_at=row.expires_at,
        )
        for row in rows
    ]


@router.delete("/{shop_id}/credentials/{credential_type}")
def delete_shop_credential(shop_id: int, credential_type: str):
    if ShopService.get_shop(shop_id) is None:
        raise HTTPException(status_code=404, detail=f"未找到店铺：{shop_id}")

    deleted = ShopService.delete_credential(shop_id, credential_type)

    if not deleted:
        raise HTTPException(status_code=404, detail="未找到该凭据")

    return {"success": True}


@router.post("/{shop_id}/test-connection", response_model=ConnectionTestResponse)
def test_shop_connection(shop_id: int):
    result = ShopService.test_connection(shop_id)

    if result is None:
        raise HTTPException(status_code=404, detail=f"未找到店铺：{shop_id}")

    return ConnectionTestResponse(
        status=result.status,
        connector_available=result.connector_available,
        message=result.message,
        tested_at=datetime.now(timezone.utc),
    )


@router.get("/{shop_id}/oauth/start", response_model=OAuthStartResponse)
def start_shop_oauth(shop_id: int):
    shop = ShopService.get_shop(shop_id)

    if shop is None:
        raise HTTPException(status_code=404, detail=f"未找到店铺：{shop_id}")

    result = ShopService.start_oauth(shop_id)

    # 框架预留：真正接入某平台 OAuth 后，该平台的 start_oauth()
    # 会返回一个真实 authorize_url，此时才需要签发 state 并拼接进
    # 跳转地址；本阶段所有平台都直接返回 not_implemented、
    # authorize_url 为 None，因此不签发 state（OAuthStateService.issue
    # 未被调用），避免产生永远不会被消费的 state。
    if result.authorize_url is not None:
        state = OAuthStateService.issue(shop_id, shop.platform)
        logger.info("oauth state issued: shop_id=%s state_issued=true", shop_id)
        _ = state

    return OAuthStartResponse(
        status=result.status,
        authorize_url=result.authorize_url,
        message=result.message,
    )
