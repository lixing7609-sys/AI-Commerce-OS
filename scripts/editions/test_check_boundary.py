"""
scripts/editions/check_boundary.py 的单元测试（stdlib unittest，
不需要额外依赖）。

运行方式：
    python3 -m unittest discover scripts/editions
    python3 -m pytest scripts/editions -q   # pytest 也能发现
"""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_boundary  # noqa: E402
import manifest  # noqa: E402


class ManifestSelfConsistencyTests(unittest.TestCase):
    def test_real_manifest_is_self_consistent(self):
        for edition in manifest.EDITIONS:
            errors = check_boundary.check_manifest_self_consistency(edition)
            self.assertEqual(errors, [], f"{edition}: {errors}")

    def test_catches_an_include_forbidden_overlap(self):
        with mock.patch.dict(
            manifest.FRONTEND_INCLUDE_PREFIXES,
            {"operator": ("frontend/src/pages/",)},
        ):
            errors = check_boundary.check_manifest_self_consistency("operator")

        self.assertTrue(errors)

    def test_catches_an_include_universal_forbidden_overlap(self):
        with mock.patch.dict(
            manifest.FRONTEND_INCLUDE_PREFIXES,
            {"operator": ("backend/tests/",)},
        ):
            errors = check_boundary.check_manifest_self_consistency("operator")

        self.assertTrue(errors)


class ResolveEditionFilesTests(unittest.TestCase):
    def test_resolves_only_included_non_forbidden_files(self):
        fake_files = [
            "frontend/src/editions/editionConfig.js",
            "frontend/src/pages/Dashboard.jsx",
            "frontend/src/operator-preview/OperatorPreviewApp.jsx",
            "backend/tests/test_foo.py",
            "docs/10-adr/ADR-0001-engineering-first.md",
        ]

        resolved = check_boundary.resolve_edition_files("operator", fake_files)

        self.assertIn("frontend/src/editions/editionConfig.js", resolved)
        self.assertIn(
            "frontend/src/operator-preview/OperatorPreviewApp.jsx", resolved
        )
        self.assertNotIn("frontend/src/pages/Dashboard.jsx", resolved)
        self.assertNotIn("backend/tests/test_foo.py", resolved)
        self.assertNotIn("docs/10-adr/ADR-0001-engineering-first.md", resolved)

    def test_device_admin_resolves_nothing_yet(self):
        fake_files = ["frontend/src/pages/Dashboard.jsx"]
        resolved = check_boundary.resolve_edition_files("device-admin", fake_files)
        self.assertEqual(resolved, [])


class NoForbiddenFilesResolvedTests(unittest.TestCase):
    def test_catches_a_manifest_that_accidentally_includes_tests(self):
        with mock.patch.dict(
            manifest.FRONTEND_INCLUDE_PREFIXES,
            {"operator": ("backend/tests/",)},
        ):
            errors = check_boundary.check_no_forbidden_files_resolved(
                "operator", ["backend/tests/test_leaked.py"]
            )

        self.assertTrue(errors)

    def test_catches_a_manifest_that_accidentally_includes_docs(self):
        with mock.patch.dict(
            manifest.FRONTEND_INCLUDE_PREFIXES,
            {"operator": ("docs/",)},
        ):
            errors = check_boundary.check_no_forbidden_files_resolved(
                "operator", ["docs/10-adr/ADR-0001-engineering-first.md"]
            )

        self.assertTrue(errors)

    def test_clean_resolution_has_no_errors(self):
        errors = check_boundary.check_no_forbidden_files_resolved(
            "operator", ["frontend/src/operator-preview/OperatorPreviewApp.jsx"]
        )

        self.assertEqual(errors, [])


class ImportBoundaryTests(unittest.TestCase):
    def test_flags_an_import_into_a_forbidden_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            # macOS 上 /tmp 是指向 /private/tmp 的符号链接：这里必须
            # resolve() 之后再当作 REPO_ROOT，否则 check_import_boundary
            # 内部 resolved_import.relative_to(REPO_ROOT) 会因为两侧
            # 符号链接展开程度不一致而抛 ValueError，被安全忽略，
            # 测试永远看不到失败。
            tmp_path = Path(tmp).resolve()
            preview_dir = tmp_path / "frontend/src/operator-preview"
            preview_dir.mkdir(parents=True)
            (preview_dir / "Bad.jsx").write_text(
                'import Dashboard from "../pages/Dashboard.jsx";\n'
            )

            with mock.patch.object(check_boundary, "REPO_ROOT", tmp_path):
                errors = check_boundary.check_import_boundary(
                    "operator",
                    ["frontend/src/operator-preview/Bad.jsx"],
                )

        self.assertTrue(errors)
        self.assertIn("developer-only", errors[0])

    def test_does_not_flag_an_import_within_the_edition(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp).resolve()
            preview_dir = tmp_path / "frontend/src/operator-preview"
            preview_dir.mkdir(parents=True)
            (preview_dir / "Clean.jsx").write_text(
                'import { getNavItemByKey } from "./helpers/navigation.js";\n'
            )

            with mock.patch.object(check_boundary, "REPO_ROOT", tmp_path):
                errors = check_boundary.check_import_boundary(
                    "operator",
                    ["frontend/src/operator-preview/Clean.jsx"],
                )

        self.assertEqual(errors, [])


class RealRepoIntegrationTests(unittest.TestCase):
    """
    对真实仓库跑一遍完整检查，确认今天的 operator-preview 原型
    本身就是干净的——这既是回归测试，也是 check_boundary.py 作为
    CLI 工具真正会做的事。
    """

    def test_operator_edition_passes_against_the_real_repo(self):
        all_files = check_boundary._git_ls_files()
        errors = check_boundary.run_checks("operator", all_files)
        self.assertEqual(errors, [], errors)


if __name__ == "__main__":
    unittest.main()
