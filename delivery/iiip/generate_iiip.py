#!/usr/bin/env python3
"""
IIIP Delivery Generator — MTM Sovereign Package Hydration Engine
Protocol: SEAL 3.5 / AEDPS-v3 Active
Universal Orchestrator: Axiom | IDE Maestro: Circuit 10.0

Usage:
    python generate_iiip.py [--config path/to/config.json] [--output path/to/output.html]
    Default: injects iiip-config.sample.json into iiip-template.html to output index.html
"""

import os
import sys
import json
import re
import argparse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

def generate_package(config_path=None, template_path=None, output_path=None):
    if not config_path:
        config_path = BASE_DIR / "iiip-config.sample.json"
    if not template_path:
        template_path = BASE_DIR / "iiip-template.html"
    if not output_path:
        output_path = BASE_DIR / "index.html"

    config_path = Path(config_path)
    template_path = Path(template_path)
    output_path = Path(output_path)

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")
    if not template_path.exists():
        raise FileNotFoundError(f"Template file not found: {template_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        config_data = json.load(f)

    with open(template_path, "r", encoding="utf-8") as f:
        template_html = f.read()

    # Pre-render title and watermarks in HTML for instant first paint
    prospect = config_data.get("prospect", {})
    company_name = prospect.get("companyName", "Your Firm")
    exec_name = prospect.get("executiveName", "Principal Pending")
    exec_title = prospect.get("executiveTitle", "Title Pending")

    # Replace initial skeleton text with prospect values dynamically via regex
    hydrated_html = re.sub(
        r'(<div class="iiip-prospect-entity"[^>]*>)[^<]*(</div>)',
        rf'\g<1>{company_name}\g<2>',
        template_html
    )
    hydrated_html = re.sub(
        r'(<span class="iiip-recipient-name"[^>]*>)[^<]*(</span>)',
        rf'\g<1>{exec_name}\g<2>',
        hydrated_html
    )
    hydrated_html = re.sub(
        r'(<span data-bind="prospect\.executiveTitle"[^>]*>)[^<]*(</span>)',
        rf'\g<1>{exec_title}\g<2>',
        hydrated_html
    )
    hydrated_html = re.sub(
        r'(<title>)[^<]*(</title>)',
        rf'\g<1>{company_name} // Invisible Infrastructure Intelligence Package | MT Media AI\g<2>',
        hydrated_html
    )
    hydrated_html = re.sub(
        r'(<div class="iiip-watermark-overlay"[^>]*>)[^<]*(</div>)',
        rf'\g<1>Prepared exclusively for {company_name}\g<2>',
        hydrated_html
    )

    # Pre-populate first vital spotlight if available
    vitals = prospect.get("vitals", [])
    if vitals and len(vitals) > 0:
        first_vital = vitals[0]
        hydrated_html = re.sub(
            r'(<span class="vital-spot-k" id="vital-spot-k">)[^<]*(</span>)',
            rf'\g<1>{first_vital.get("label", "Field of Practice")}\g<2>',
            hydrated_html
        )
        hydrated_html = re.sub(
            r'(<span class="vital-spot-v" id="vital-spot-v">)[^<]*(</span>)',
            rf'\g<1>{first_vital.get("value", "")}\g<2>',
            hydrated_html
        )
        hydrated_html = re.sub(
            r'(<span class="vital-spot-note" id="vital-spot-note">)[^<]*(</span>)',
            rf'\g<1>{first_vital.get("note", "")}\g<2>',
            hydrated_html
        )

    # Embed configuration payload and boot trigger
    config_script = f"""  <script src="iiip-engine.js?v=20261004_v8"></script>
  <script>
    window.IIIP_CONFIG = {json.dumps(config_data, indent=2)};
    document.addEventListener('DOMContentLoaded', function () {{
      if (window.IIIPEngine) window.IIIPEngine.init(window.IIIP_CONFIG);
    }});
  </script>
</body>
</html>"""

    # Replace end scripts
    pattern_end = """  <script src="iiip-engine.js?v=20261004_v4"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      if (window.IIIPEngine) window.IIIPEngine.init();
    });
  </script>
</body>
</html>"""

    if pattern_end in hydrated_html:
        final_html = hydrated_html.replace(pattern_end, config_script)
    else:
        # Fallback replacement
        idx = hydrated_html.rfind('<script src="iiip-engine.js')
        if idx != -1:
            final_html = hydrated_html[:idx] + config_script
        else:
            final_html = hydrated_html.replace('</body>\n</html>', config_script)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(final_html)

    print(f"[OK] Generated IIIP Package: {output_path} ({len(final_html):,} bytes)")
    return output_path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="IIIP Delivery Package Generator")
    parser.add_argument("--config", help="Path to prospect config JSON", default=None)
    parser.add_argument("--template", help="Path to IIIP HTML template", default=None)
    parser.add_argument("--output", help="Path to output HTML file", default=None)
    args = parser.parse_args()

    generate_package(args.config, args.template, args.output)
