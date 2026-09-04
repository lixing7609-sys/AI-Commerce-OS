from app.core.intelligence_evolution.config import cloud_readiness, load_cloud_dependencies


def test_cloud_dependencies_are_explicit_and_provider_owned():
    environment = {
        "DATABASE_URL": "postgresql+psycopg://example.invalid/evolution",
        "AI_COMMERCE_CLOUD_COMPUTE_ENDPOINT": "https://compute.example.invalid",
        "AI_COMMERCE_CLOUD_IAM_ISSUER": "https://iam.example.invalid",
        "AI_COMMERCE_CLOUD_IAM_AUDIENCE": "intelligence-evolution",
        "AI_COMMERCE_CLOUD_IAM_PUBLIC_KEY": "test-public-key",
        "AI_COMMERCE_CLOUD_NETWORK_ZONE": "foundation-private",
    }

    dependencies = load_cloud_dependencies(environment)

    assert dependencies.ready is True
    assert cloud_readiness(environment) == {
        "ready": True,
        "checks": {"storage": True, "compute": True, "iam": True, "network": True},
    }


def test_cloud_readiness_reports_missing_dependencies_without_side_effects():
    assert cloud_readiness({}) == {
        "ready": False,
        "checks": {"storage": False, "compute": False, "iam": False, "network": False},
    }
