import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.external_task_auth import verify_external_task_api_key
from app.models.task_api import (
    ExternalTaskSubmitRequest,
    ExternalTaskSubmitResponse,
)
from app.services.task_submission_service import (
    AgentNotFoundError,
    TaskSubmissionService,
)

logger = logging.getLogger("app.integrations_api")

router = APIRouter(
    prefix="/integrations/tasks",
    tags=["Integrations"],
)


def _request_id_digest(request_id: str) -> str:
    """
    request_id 的安全摘要（SHA-256 前 12 位十六进制），仅用于日志。

    不记录 request_id 全文：外部系统可能把业务相关信息
    （如订单号、执行编号）编码进 request_id，摘要足以在日志中
    关联同一请求的多次出现，同时不泄露原文。
    """

    return hashlib.sha256(request_id.encode("utf-8")).hexdigest()[:12]


@router.post(
    "/submit",
    response_model=ExternalTaskSubmitResponse,
    status_code=202,
    responses={
        200: {
            "model": ExternalTaskSubmitResponse,
            "description": (
                "相同 (source, request_id) 的重复请求：返回已有任务，"
                "duplicate=true"
            ),
        },
    },
)
def submit_external_task(
    request: ExternalTaskSubmitRequest,
    response: Response,
    _: None = Depends(verify_external_task_api_key),
):
    """
    外部任务接入网关：供 n8n 等外部系统在 API Key 鉴权通过后提交
    任务，按 (source, request_id) 联合唯一做幂等去重。

    首次提交：创建 status=pending 的任务，commit 成功后才唤醒
    后台 TaskConsumerService，返回 202、duplicate=false。

    相同 (source, request_id) 重复提交：不创建第二条任务、不重新
    执行（无论原任务当前是 pending/running/completed/failed），
    直接返回已有任务的当前状态，返回 200、duplicate=true。

    本接口完全不检查、不修改 Runtime 状态，不启动 Runtime；
    Runtime stopped 时任务照常入队并保持 pending。assigned_agent
    只做"是否已在 AgentRegistry 注册"的存在性校验，不检查该 Agent
    当前运行状态。
    """

    try:
        task_db, duplicate = TaskSubmissionService.submit_external_task(
            request
        )
    except AgentNotFoundError as error:
        raise HTTPException(
            status_code=404,
            detail=f"未找到 Agent：{error.agent_name}",
        ) from error
    except Exception as error:
        logger.error(
            "external task submission failed: error_type=%s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail=f"任务提交失败（{type(error).__name__}）",
        ) from error

    logger.info(
        "external task submitted: task_id=%s source=%s "
        "request_digest=%s assigned_agent=%s priority=%s duplicate=%s",
        task_db.id,
        task_db.external_source,
        _request_id_digest(request.request_id),
        task_db.assigned_agent,
        task_db.priority,
        duplicate,
    )

    response.status_code = 200 if duplicate else 202

    return ExternalTaskSubmitResponse(
        id=task_db.id,
        request_id=task_db.external_request_id,
        source=task_db.external_source,
        status=task_db.status,
        assigned_agent=task_db.assigned_agent,
        task_type=task_db.task_type,
        priority=task_db.priority,
        created_at=task_db.created_at,
        duplicate=duplicate,
        message=(
            "该请求已接收，返回已有任务" if duplicate else "任务已进入执行队列"
        ),
    )
