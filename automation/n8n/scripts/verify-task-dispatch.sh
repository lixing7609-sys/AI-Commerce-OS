#!/usr/bin/env bash
#
# 端到端验证脚本：调用 n8n Webhook（不是后端 API Key 网关本身），
# 以此验证 "n8n Webhook -> Code 校验 -> 后端外部任务网关" 完整链路。
#
# 用法：
#   N8N_TASK_WEBHOOK_URL="http://localhost:5678/webhook/ai-secretariat/task" \
#     ./verify-task-dispatch.sh
#
# 可选环境变量：
#   REQUEST_ID       默认 "demo-verify-task-dispatch"（固定值，
#                    重复运行本脚本可以验证 duplicate=true）
#   ASSIGNED_AGENT    默认 "AI CEO"
#   TASK_TEXT         默认 "生成今日经营分析"
#   PRIORITY          默认 "normal"
#   N8N_WEBHOOK_AUTH_HEADER   若 Webhook 启用了 Header
#                             Authentication，设置该 Header 的名称
#                             （例如 X-Secretariat-Webhook-Auth）
#   N8N_WEBHOOK_AUTH_VALUE    对应的 Header 值。本脚本只会把它放进
#                             请求 Header，绝不打印、绝不写入任何
#                             输出或日志。
#
# 本脚本本身不持有、不读取、不输出任何后端 API Key——鉴权 Key 只
# 存在于 n8n workflow 内部（EXTERNAL_TASK_API_KEY /
# AI_COMMERCE_TASK_API_KEY 环境变量），本脚本只是外部调用方视角的
# 黑盒验证；N8N_WEBHOOK_AUTH_VALUE 是 Webhook 自身的入口保护 Header
# 值（如果启用），与后端 API Key 是两个完全独立的凭据。

set -euo pipefail

if [ -z "${N8N_TASK_WEBHOOK_URL:-}" ]; then
  echo "错误：未设置 N8N_TASK_WEBHOOK_URL" >&2
  echo "示例：N8N_TASK_WEBHOOK_URL=\"http://localhost:5678/webhook/ai-secretariat/task\" $0" >&2
  exit 1
fi

REQUEST_ID="${REQUEST_ID:-demo-verify-task-dispatch}"
ASSIGNED_AGENT="${ASSIGNED_AGENT:-AI CEO}"
TASK_TEXT="${TASK_TEXT:-生成今日经营分析}"
PRIORITY="${PRIORITY:-normal}"

HAS_JQ=0
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=1
fi

echo "==> 目标 Webhook：${N8N_TASK_WEBHOOK_URL}"
echo "==> request_id：${REQUEST_ID}"
echo "==> assigned_agent：${ASSIGNED_AGENT}"
echo "==> priority：${PRIORITY}"
echo

build_payload() {
  if [ "$HAS_JQ" -eq 1 ]; then
    jq -n \
      --arg request_id "$REQUEST_ID" \
      --arg source "n8n" \
      --arg assigned_agent "$ASSIGNED_AGENT" \
      --arg task "$TASK_TEXT" \
      --arg priority "$PRIORITY" \
      '{
        request_id: $request_id,
        source: $source,
        assigned_agent: $assigned_agent,
        task: $task,
        context: {channel: "verify-task-dispatch-script"},
        priority: $priority
      }'
  else
    # 无 jq 时的兜底：手工拼接 JSON。仅用于本脚本内置字段，均已知
    # 不含双引号/反斜杠等需要转义的特殊字符，因此简单拼接是安全的。
    printf '{"request_id":"%s","source":"n8n","assigned_agent":"%s","task":"%s","context":{"channel":"verify-task-dispatch-script"},"priority":"%s"}' \
      "$REQUEST_ID" "$ASSIGNED_AGENT" "$TASK_TEXT" "$PRIORITY"
  fi
}

PAYLOAD="$(build_payload)"

RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

# Webhook Header Authentication 是可选的：只有同时设置了
# N8N_WEBHOOK_AUTH_HEADER 和 N8N_WEBHOOK_AUTH_VALUE 才会附加该
# Header；未设置时按无保护 Webhook 处理，行为与之前完全一致。
AUTH_HEADER_ARGS=()
if [ -n "${N8N_WEBHOOK_AUTH_HEADER:-}" ] && [ -n "${N8N_WEBHOOK_AUTH_VALUE:-}" ]; then
  AUTH_HEADER_ARGS=(-H "${N8N_WEBHOOK_AUTH_HEADER}: ${N8N_WEBHOOK_AUTH_VALUE}")
  echo "==> 已附加 Webhook 入口保护 Header：${N8N_WEBHOOK_AUTH_HEADER}（值不显示）"
fi

HTTP_STATUS="$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
  -X POST "$N8N_TASK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  "${AUTH_HEADER_ARGS[@]}" \
  --max-time 15 \
  -d "$PAYLOAD")"

BODY="$(cat "$RESPONSE_FILE")"

echo "==> HTTP 状态码：${HTTP_STATUS}"

if [ "$HAS_JQ" -eq 1 ]; then
  echo "==> 响应内容："
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "==> 响应内容（原文，未安装 jq，未格式化）："
  echo "$BODY"
fi

echo

case "$HTTP_STATUS" in
  202)
    echo "结果：首次接收成功（202，duplicate=false 预期）"
    ;;
  200)
    echo "结果：请求已处理（200，通常代表 duplicate=true，即重复的 request_id）"
    ;;
  400)
    echo "结果：请求被拒绝（400，INVALID_REQUEST——校验失败，未调用后端）"
    ;;
  401)
    echo "结果：鉴权失败（401，AUTH_FAILED）"
    ;;
  403)
    echo "结果：Webhook 入口鉴权失败（403，请检查 N8N_WEBHOOK_AUTH_HEADER/VALUE 是否正确）"
    ;;
  404)
    echo "结果：Agent 不存在（404，AGENT_NOT_FOUND）"
    ;;
  422)
    echo "结果：任务内容不符合要求（422，INVALID_REQUEST）"
    ;;
  503)
    echo "结果：任务网关未配置（503，GATEWAY_NOT_CONFIGURED）"
    ;;
  000)
    echo "结果：请求未能送达（网络错误或超时，请确认 N8N_TASK_WEBHOOK_URL 可访问）" >&2
    exit 1
    ;;
  *)
    echo "结果：收到未预期的状态码 ${HTTP_STATUS}，请检查 n8n workflow 是否已激活、URL 是否正确" >&2
    exit 1
    ;;
esac

echo
echo "提示：重复运行本脚本（使用相同 REQUEST_ID，默认已固定）可验证幂等——"
echo "      第二次及以后应看到 HTTP 200 且响应体 duplicate=true。"
