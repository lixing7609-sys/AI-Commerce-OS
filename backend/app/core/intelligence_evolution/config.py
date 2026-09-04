from dataclasses import dataclass
import os


@dataclass(frozen=True, slots=True)
class CloudDependencies:
    """References to infrastructure owned by AI Commerce OS Cloud."""

    storage_url: str
    compute_endpoint: str
    iam_issuer: str
    iam_audience: str
    iam_public_key: str
    network_zone: str

    @property
    def ready(self) -> bool:
        return all((
            self.storage_url,
            self.compute_endpoint,
            self.iam_issuer,
            self.iam_audience,
            self.iam_public_key,
            self.network_zone,
        ))


def load_cloud_dependencies(environ: dict[str, str] | None = None) -> CloudDependencies:
    values = environ if environ is not None else os.environ
    return CloudDependencies(
        storage_url=values.get("DATABASE_URL", ""),
        compute_endpoint=values.get("AI_COMMERCE_CLOUD_COMPUTE_ENDPOINT", ""),
        iam_issuer=values.get("AI_COMMERCE_CLOUD_IAM_ISSUER", ""),
        iam_audience=values.get("AI_COMMERCE_CLOUD_IAM_AUDIENCE", ""),
        iam_public_key=values.get("AI_COMMERCE_CLOUD_IAM_PUBLIC_KEY", ""),
        network_zone=values.get("AI_COMMERCE_CLOUD_NETWORK_ZONE", ""),
    )


def cloud_readiness(environ: dict[str, str] | None = None) -> dict[str, object]:
    dependencies = load_cloud_dependencies(environ)
    checks = {
        "storage": bool(dependencies.storage_url),
        "compute": bool(dependencies.compute_endpoint),
        "iam": bool(dependencies.iam_issuer and dependencies.iam_audience and dependencies.iam_public_key),
        "network": bool(dependencies.network_zone),
    }
    return {"ready": all(checks.values()), "checks": checks}
