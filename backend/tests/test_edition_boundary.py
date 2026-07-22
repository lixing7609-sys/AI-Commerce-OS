"""
ADR-0002 Edition Boundary 测试。

覆盖：require_edition() 依赖在 EDITION=operator / EDITION=device-admin
下正确挡掉不该暴露的路由（404，不是 403，见 edition.py 的说明）；
同时验证默认（不设置 EDITION）下现有全部路由行为完全不变——这是
整套改动"零风险上线"能否成立的关键回归保护。

不测试每一个端点，只覆盖 Permission Boundary 表里每一类的代表路由：
developer-only（tasks/agents/analytics/runtime 控制面）、
operator 可见（shops/deliverables/dashboard）、
device-admin 诊断面（settings/system-info、settings/integration-status）、
三个 Edition 都可见的只读状态面（runtime/status、settings/llm-status）。
"""

from fastapi.testclient import TestClient

from app.main import app

_DEVELOPER_ONLY_ROUTES = [
    ("GET", "/api/v1/tasks"),
    ("GET", "/api/v1/agents"),
    ("GET", "/api/v1/analytics/tasks"),
    ("GET", "/api/v1/runtime/consumer-status"),
    ("POST", "/api/v1/runtime/start"),
    ("POST", "/api/v1/runtime/stop"),
]

_OPERATOR_VISIBLE_ROUTES = [
    ("GET", "/api/v1/dashboard/summary"),
    ("GET", "/api/v1/shops"),
    ("GET", "/api/v1/deliverables"),
]

_DEVICE_ADMIN_DIAGNOSTIC_ROUTES = [
    ("GET", "/api/v1/settings/system-info"),
    ("GET", "/api/v1/settings/integration-status"),
]

_ALL_EDITION_VISIBLE_ROUTES = [
    ("GET", "/api/v1/runtime/status"),
    ("GET", "/api/v1/settings/llm-status"),
]


def _client():
    return TestClient(app)


def _call(client, method, path):
    if method == "GET":
        return client.get(path)
    if method == "POST":
        return client.post(path)
    raise ValueError(f"unsupported method in test table: {method}")


def _clear_edition_env(monkeypatch):
    monkeypatch.delenv("EDITION", raising=False)


def test_default_edition_preserves_full_access(monkeypatch):
    """
    不设置 EDITION（现有部署/测试的真实状态）时，所有既有路由都
    必须保持 100% 现有行为：不应该出现任何因为本次改动新增的 404。
    """

    _clear_edition_env(monkeypatch)

    all_routes = (
        _DEVELOPER_ONLY_ROUTES
        + _OPERATOR_VISIBLE_ROUTES
        + _DEVICE_ADMIN_DIAGNOSTIC_ROUTES
        + _ALL_EDITION_VISIBLE_ROUTES
    )

    with _client() as client:
        for method, path in all_routes:
            response = _call(client, method, path)
            assert response.status_code != 404, (
                f"{method} {path} 在默认 EDITION 下不应该 404，"
                f"实际状态码 {response.status_code}"
            )


def test_operator_edition_cannot_reach_developer_only_routes(monkeypatch):
    monkeypatch.setenv("EDITION", "operator")

    with _client() as client:
        for method, path in _DEVELOPER_ONLY_ROUTES:
            response = _call(client, method, path)
            assert response.status_code == 404, (
                f"{method} {path} 在 EDITION=operator 下必须 404，"
                f"实际状态码 {response.status_code}"
            )

        for method, path in _OPERATOR_VISIBLE_ROUTES:
            response = _call(client, method, path)
            assert response.status_code != 404, (
                f"{method} {path} 是 operator 可见路由，不应该 404，"
                f"实际状态码 {response.status_code}"
            )

        for method, path in _ALL_EDITION_VISIBLE_ROUTES:
            response = _call(client, method, path)
            assert response.status_code != 404, (
                f"{method} {path} 对所有 Edition 可见，不应该 404，"
                f"实际状态码 {response.status_code}"
            )


def test_device_admin_edition_cannot_reach_operator_business_routes(monkeypatch):
    """
    Device Admin 只应看到诊断信息，不应该获得经营者业务权限之外的
    数据（ADR-0002 Step 6 要求）：shops/deliverables/dashboard 等
    经营数据路由必须对 device-admin 404。
    """

    monkeypatch.setenv("EDITION", "device-admin")

    with _client() as client:
        for method, path in _DEVELOPER_ONLY_ROUTES:
            response = _call(client, method, path)
            assert response.status_code == 404, (
                f"{method} {path} 在 EDITION=device-admin 下必须 404，"
                f"实际状态码 {response.status_code}"
            )

        for method, path in _OPERATOR_VISIBLE_ROUTES:
            response = _call(client, method, path)
            assert response.status_code == 404, (
                f"{method} {path} 是经营者业务路由，EDITION=device-admin "
                f"下必须 404，实际状态码 {response.status_code}"
            )

        for method, path in _DEVICE_ADMIN_DIAGNOSTIC_ROUTES:
            response = _call(client, method, path)
            assert response.status_code != 404, (
                f"{method} {path} 是 device-admin 诊断路由，不应该 404，"
                f"实际状态码 {response.status_code}"
            )


def test_unknown_edition_value_falls_back_to_developer(monkeypatch):
    """
    EDITION 被设置成无法识别的值时，安全降级为 developer（而不是
    崩溃或意外放行/意外拒绝），与 get_active_edition() 的文档行为
    一致。
    """

    monkeypatch.setenv("EDITION", "not-a-real-edition")

    with _client() as client:
        response = client.get("/api/v1/tasks")

    assert response.status_code != 404
