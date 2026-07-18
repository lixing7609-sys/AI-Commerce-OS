from pydantic import BaseModel, Field, field_validator


class TaskMarkFailedRequest(BaseModel):
    """
    POST /api/v1/tasks/{task_id}/mark-failed 的请求体。

    reason 是人工输入的安全展示文本：去除首尾空格、限长 500，
    不拼接内部异常、不自动附加 traceback。
    """

    reason: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="人工提供的失败原因，将原样（去除首尾空格后）保存到 task.error",
    )

    @field_validator("reason", mode="before")
    @classmethod
    def _strip_reason(cls, value):
        if isinstance(value, str):
            return value.strip()

        return value
