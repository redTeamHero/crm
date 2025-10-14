from flask import Flask, Request, request
import hmac
import hashlib
import os
import subprocess
from typing import Tuple

app = Flask(__name__)

SECRET = os.environ.get("GITHUB_WEBHOOK_SECRET", "").encode()
WEBHOOK_SCRIPT = os.environ.get("GIT_PULL_SCRIPT", "/home/admin/webhook/gitpull.sh")


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
        subprocess.run([WEBHOOK_SCRIPT], check=True)
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        return f"Failed to run webhook script: {exc}", 500

    return {"status": "ok"}, 200


if __name__ == "__main__":
    port = int(os.environ.get("WEBHOOK_PORT", "5005"))
    app.run(host="0.0.0.0", port=port)
