"""No GCP/network/credentials: verify pre-restart GPT secret gating."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "deploy/gcp/render-env.sh"


class RenderGPTEnvTest(unittest.TestCase):
    def render(self, provider, post="gemini", key=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "bin").mkdir()
            curl = root / "bin/curl"
            curl.write_text('''#!/bin/bash
case "${@: -1}" in
 */project/project-id) echo test-project;;
 */site-host) echo market.example;;
 */acme-email) echo admin@example.com;;
esac
''')
            gcloud = root / "bin/gcloud"
            gcloud.write_text('''#!/bin/bash
if [[ " $* " == *" --secret=openai-api-key "* ]]; then
  [[ "$FAKE_OPENAI" == yes ]] || exit 1
fi
printf 'test-secret'
''')
            curl.chmod(0o755)
            gcloud.chmod(0o755)
            extra = root / "extra.env"
            extra.write_text(f"TEXT_PROVIDER={provider}\nPOST_MODEL={post}\n")
            run = root / "run"
            run.mkdir()
            output = run / "app.env"
            output.write_text("previous-environment")
            result = subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True,
                env={**os.environ, "PATH": str(root / "bin") + ":" + os.environ["PATH"],
                     "ISRAMARKET_RUN_DIR": str(run), "ISRAMARKET_EXTRA_ENV": str(extra),
                     "FAKE_OPENAI": "yes" if key else "no"})
            return result, output.read_text(), output.stat().st_mode & 0o777

    def test_gpt_missing_key_leaves_previous_environment_intact(self):
        for provider, post in (("openai", "gemini"), ("gemini", "openai")):
            result, output, _ = self.render(provider, post)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(output, "previous-environment")
            self.assertIn("OPENAI_API_KEY is empty", result.stderr)

    def test_gpt_funded_key_and_gemini_rollback_render(self):
        for provider, post, key in (("openai", "openai", True), ("gemini", "gemini", False)):
            result, output, mode = self.render(provider, post, key)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("TEXT_PROVIDER=" + provider, output)
            self.assertEqual(mode, 0o600)


if __name__ == "__main__":
    unittest.main()
