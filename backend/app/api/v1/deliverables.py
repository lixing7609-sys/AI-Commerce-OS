import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.core.edition import Edition, require_edition
from app.models.deliverable_api import (
    CreateFollowUpTaskRequest,
    CreateFollowUpTaskResponse,
    DeliverableDetailResponse,
    DeliverableItemResponse,
    DeliverableListResponse,
    DeliverableShopSummary,
    DeliverableTaskSummary,
    DeliverableVersionResponse,
    DeliverableVersionSummary,
    validate_deliverable_status,
    validate_deliverable_type,
)
from app.services.deliverable_export_service import (
    SUPPORTED_FORMATS,
    UnsupportedExportFormatError,
    build_content_disposition,
    export_deliverable,
)
from app.services.deliverable_service import (
    DeliverableNotFoundError,
    DeliverableService,
    InvalidDeliverableTransitionError,
    NoDeliverableContentError,
    TaskNotCompletedError,
    TaskNotFoundError,
)
from app.services.task_service import TaskService

logger = logging.getLogger("app.deliverables_api")

router = APIRouter(
    prefix="/deliverables",
    tags=["Deliverables"],
    dependencies=[Depends(require_edition(Edition.DEVELOPER, Edition.OPERATOR))],
)

_ACTIONS_BY_STATUS = {
    "draft": ["approve", "reject", "archive", "export"],
    "pending_review": ["approve", "reject", "archive", "create_follow_up_task", "export"],
    "approved": ["archive", "create_follow_up_task", "export"],
    "rejected": ["archive", "create_follow_up_task", "export"],
    "converted_to_task": ["archive", "create_follow_up_task", "export"],
    "archived": ["restore", "export"],
}


def _shop_summary(shop_id: int | None) -> DeliverableShopSummary | None:
    if shop_id is None:
        return None

    from app.services.shop_service import ShopService

    shop = ShopService.get_shop(shop_id)
    if shop is None:
        return None

    return DeliverableShopSummary.model_validate(shop)


def _task_summary(task_id: str | None) -> DeliverableTaskSummary | None:
    if not task_id:
        return None

    task = TaskService.get_task(task_id)
    if task is None:
        return None

    return DeliverableTaskSummary.model_validate(task)


def _to_item_response(deliverable) -> DeliverableItemResponse:
    shop_name = None
    if deliverable.shop_id is not None:
        from app.services.shop_service import ShopService

        names = ShopService.get_names_by_ids([deliverable.shop_id])
        shop_name = names.get(deliverable.shop_id)

    return DeliverableItemResponse.model_validate(deliverable).model_copy(
        update={"shop_name": shop_name}
    )


@router.get("", response_model=DeliverableListResponse)
def list_deliverables(
    status: str | None = None,
    deliverable_type: str | None = None,
    agent_name: str | None = None,
    shop_id: int | None = None,
    unassigned_shop: bool = False,
    source_task_id: str | None = None,
    root_task_id: str | None = None,
    keyword: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    if status is not None and not validate_deliverable_status(status):
        raise HTTPException(status_code=422, detail="不支持的成果状态")

    if deliverable_type is not None and not validate_deliverable_type(deliverable_type):
        raise HTTPException(status_code=422, detail="不支持的成果类型")

    items, total = DeliverableService.list_deliverables(
        status=status,
        deliverable_type=deliverable_type,
        agent_name=agent_name,
        shop_id=shop_id,
        unassigned_shop=unassigned_shop,
        source_task_id=source_task_id,
        root_task_id=root_task_id,
        keyword=keyword or None,
        created_from=created_from,
        created_to=created_to,
        limit=limit,
        offset=offset,
    )

    return DeliverableListResponse(
        items=[_to_item_response(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/from-task/{task_id}", response_model=DeliverableItemResponse)
def create_deliverable_from_task(task_id: str):
    try:
        deliverable = DeliverableService.create_from_task(task_id)
    except TaskNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except TaskNotCompletedError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except NoDeliverableContentError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.error(
            "manual deliverable creation failed: task_id=%s error_type=%s",
            task_id,
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500, detail=f"生成成果失败（{type(error).__name__}）"
        ) from error

    return _to_item_response(deliverable)


@router.get("/{deliverable_id}", response_model=DeliverableDetailResponse)
def get_deliverable(deliverable_id: int):
    deliverable = DeliverableService.get_deliverable(deliverable_id)

    if deliverable is None:
        raise HTTPException(status_code=404, detail=f"未找到成果：{deliverable_id}")

    current_version = DeliverableService.get_current_version(deliverable)
    versions = DeliverableService.get_versions(deliverable_id)

    child_rows = TaskService.get_children(deliverable.source_task_id)

    base = _to_item_response(deliverable)

    return DeliverableDetailResponse(
        **base.model_dump(),
        current_version_data=(
            DeliverableVersionResponse.model_validate(current_version)
            if current_version
            else None
        ),
        versions=[DeliverableVersionSummary.model_validate(v) for v in versions],
        source_task=_task_summary(deliverable.source_task_id),
        parent_task=_task_summary(deliverable.parent_task_id),
        child_tasks=[DeliverableTaskSummary.model_validate(row) for row in child_rows],
        shop=_shop_summary(deliverable.shop_id),
        available_actions=_ACTIONS_BY_STATUS.get(deliverable.status, []),
    )


@router.get(
    "/{deliverable_id}/versions", response_model=list[DeliverableVersionSummary]
)
def list_deliverable_versions(deliverable_id: int):
    if DeliverableService.get_deliverable(deliverable_id) is None:
        raise HTTPException(status_code=404, detail=f"未找到成果：{deliverable_id}")

    versions = DeliverableService.get_versions(deliverable_id)
    return [DeliverableVersionSummary.model_validate(v) for v in versions]


@router.get(
    "/{deliverable_id}/versions/{version_number}",
    response_model=DeliverableVersionResponse,
)
def get_deliverable_version(deliverable_id: int, version_number: int):
    version = DeliverableService.get_version(deliverable_id, version_number)

    if version is None:
        raise HTTPException(status_code=404, detail="未找到该版本")

    return DeliverableVersionResponse.model_validate(version)


@router.post("/{deliverable_id}/approve", response_model=DeliverableItemResponse)
def approve_deliverable(deliverable_id: int):
    try:
        deliverable = DeliverableService.approve(deliverable_id)
    except DeliverableNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    return _to_item_response(deliverable)


@router.post("/{deliverable_id}/reject", response_model=DeliverableItemResponse)
def reject_deliverable(deliverable_id: int):
    try:
        deliverable = DeliverableService.reject(deliverable_id)
    except DeliverableNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    return _to_item_response(deliverable)


@router.post("/{deliverable_id}/archive", response_model=DeliverableItemResponse)
def archive_deliverable(deliverable_id: int):
    try:
        deliverable = DeliverableService.archive(deliverable_id)
    except DeliverableNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    return _to_item_response(deliverable)


@router.post("/{deliverable_id}/restore", response_model=DeliverableItemResponse)
def restore_deliverable(deliverable_id: int):
    try:
        deliverable = DeliverableService.restore(deliverable_id)
    except DeliverableNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except InvalidDeliverableTransitionError as error:
        raise HTTPException(status_code=409, detail=error.detail) from error

    return _to_item_response(deliverable)


@router.post(
    "/{deliverable_id}/create-follow-up-task",
    response_model=CreateFollowUpTaskResponse,
    status_code=202,
)
def create_follow_up_task(deliverable_id: int, request: CreateFollowUpTaskRequest):
    from app.services.task_submission_service import AgentNotFoundError, ShopNotAvailableError

    try:
        task_db = DeliverableService.create_follow_up_task(
            deliverable_id,
            title=request.title,
            assigned_agent=request.assigned_agent,
            instruction=request.instruction,
            priority=request.priority,
            shop_id=request.target_shop_id,
            inherit_shop_scope=request.inherit_shop_scope,
        )
    except DeliverableNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except AgentNotFoundError as error:
        raise HTTPException(
            status_code=404, detail=f"未找到 Agent：{error.agent_name}"
        ) from error
    except ShopNotAvailableError as error:
        raise HTTPException(
            status_code=400, detail="所选店铺不存在或当前不可用，无法创建任务"
        ) from error
    except Exception as error:
        logger.error(
            "follow-up task creation failed: deliverable_id=%s error_type=%s",
            deliverable_id,
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500, detail=f"创建后续任务失败（{type(error).__name__}）"
        ) from error

    return CreateFollowUpTaskResponse(
        task_id=task_db.id,
        status=task_db.status,
        assigned_agent=task_db.assigned_agent,
        shop_id=task_db.shop_id,
        message="任务已创建并进入执行队列",
    )


@router.get("/{deliverable_id}/export")
def export_deliverable_file(deliverable_id: int, format: str = Query(...)):
    if format not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=422, detail="不支持的导出格式")

    deliverable = DeliverableService.get_deliverable(deliverable_id)

    if deliverable is None:
        raise HTTPException(status_code=404, detail=f"未找到成果：{deliverable_id}")

    version = DeliverableService.get_current_version(deliverable)

    if version is None:
        raise HTTPException(status_code=404, detail="该成果暂无可导出的版本内容")

    shop_name = None
    if deliverable.shop_id is not None:
        from app.services.shop_service import ShopService

        shop_name = ShopService.get_names_by_ids([deliverable.shop_id]).get(
            deliverable.shop_id
        )

    try:
        content, content_type, ascii_name, utf8_name = export_deliverable(
            deliverable, version, format, shop_name
        )
    except UnsupportedExportFormatError as error:
        raise HTTPException(status_code=422, detail="不支持的导出格式") from error
    except Exception as error:
        logger.error(
            "deliverable export failed: deliverable_id=%s format=%s error_type=%s",
            deliverable_id,
            format,
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500, detail=f"导出成果失败（{type(error).__name__}）"
        ) from error

    return Response(
        content=content,
        media_type=content_type,
        headers={
            "Content-Disposition": build_content_disposition(ascii_name, utf8_name)
        },
    )
