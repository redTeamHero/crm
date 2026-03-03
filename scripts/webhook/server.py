from flask import Flask, Request, request
import hmac
import hashlib
import os
import subprocess
from pathlib import Path
from typing import Tuple

app = Flask(__name__)

SECRET = os.environ.get("GITHUB_WEBHOOK_SECRET", "").encode()

_ALLOWED_WEBHOOK_DIRS = {
    "/home/admin/webhook",
    "/home/runner/workspace/scripts/webhook",
}


def _validate_webhook_script(raw: str) -> str:
    resolved = str(Path(raw).resolve())
    if not any(resolved.startswith(d + "/") or resolved == d for d in _ALLOWED_WEBHOOK_DIRS):
        raise RuntimeError(
            f"GIT_PULL_SCRIPT must reside in one of {_ALLOWED_WEBHOOK_DIRS}, got: {resolved!r}"
        )
    if not os.path.isfile(resolved):
        raise RuntimeError(f"Webhook script does not exist: {resolved!r}")
    return resolved


_raw_webhook_script = os.environ.get("GIT_PULL_SCRIPT", "/home/admin/webhook/gitpull.sh")
WEBHOOK_SCRIPT: str | None = None


def _verify_signature(req: Request) -> Tuple[bool, str]:
    signature_header = req.headers.get("X-Hub-Signature-256")
    if not SECRET:
        return True, ""
    if not signature_header or "=" not in signature_header:
        return False, "Missing signature"

    sha_name, signature = signature_header.split("=", 1)
    if sha_name != "sha256":
        return False, "Unsupported signature method"

    mac = hmac.new(SECRET, msg=req.data, digestmod=hashlib.sha256)
    if not hmac.compare_digest(mac.hexdigest(), signature):
        return False, "Invalid signature"
    return True, ""


@app.post("/github-webhook")
def github_webhook():
    verified, error_message = _verify_signature(request)
    if not verified:
        return error_message, 403

    try:
        validated_script = _validate_webhook_script(_raw_webhook_script)
        subprocess.run([validated_script], check=True)
    except RuntimeError as exc:
        return f"Webhook script validation failed: {exc}", 500
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        return f"Failed to run webhook script: {exc}", 500

    return {"status": "ok"}, 200


if __name__ == "__main__":
    port = int(os.environ.get("WEBHOOK_PORT", "5005"))
    app.run(host="0.0.0.0", port=port)
