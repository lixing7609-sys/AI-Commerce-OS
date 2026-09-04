from app.founder_ai.business_data_reset import BUSINESS_TABLES, PROJECT_SHELL_NAMES, PROJECT_SHELLS, SYSTEM_TABLES


def test_reset_classifies_founder_business_data_without_system_configuration():
    required_business = {
        "conversations", "conversation_messages", "secretary_digests",
        "founder_drafts", "task_assets", "asset_catalog", "artifact_assets",
        "memory_assets", "decision_assets", "founder_objects", "execution_deltas",
    }
    assert required_business.issubset(BUSINESS_TABLES)
    assert not set(BUSINESS_TABLES) & SYSTEM_TABLES


def test_reset_preserves_model_provider_and_role_configuration():
    assert {
        "model_provider_configs", "model_registry", "model_role_assignments",
        "application_capability_assignments", "ai_capability_configs",
    }.issubset(SYSTEM_TABLES)


def test_reset_keeps_only_expected_project_shell_names():
    assert PROJECT_SHELL_NAMES == {
        "ai commerce os", "sino operator ai", "sino studio ai", "ai短剧生产系统",
    }
    assert len(PROJECT_SHELLS) == 4
