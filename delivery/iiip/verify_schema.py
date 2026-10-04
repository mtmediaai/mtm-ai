import json
import re
from pathlib import Path

def test_schema_validity(html_path):
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    match = re.search(r'<script\s+type=[\"\']application/ld\+json[\"\']>(.*?)</script>', html, re.DOTALL)
    assert match, f"No application/ld+json script tag found in {html_path}"

    schema_raw = match.group(1).strip()
    try:
        data = json.loads(schema_raw)
    except Exception as e:
        raise AssertionError(f"JSON-LD syntax error: {e}")

    assert "@context" in data and data["@context"] == "https://schema.org", "Missing or invalid @context"
    assert "@graph" in data and isinstance(data["@graph"], list), "Missing or invalid @graph array"

    types = [item.get("@type") for item in data["@graph"]]
    print(f"[OK] Parsed @graph in {Path(html_path).name} with {len(data['@graph'])} entities:")
    assert len(data['@graph']) >= 18, f"Expected at least 18 entities in @graph, found {len(data['@graph'])}"

    image_objects = [item for item in data["@graph"] if item.get("@type") == "ImageObject"]
    assert len(image_objects) >= 9, f"Expected at least 9 ImageObjects (1 snapshot + 8 figures), found {len(image_objects)}"

    forbidden_prefixes = ("image of", "photo of", "graphic of", "picture of")

    for img in image_objects:
        img_id = img.get("@id", "unknown")
        caption = img.get("caption", "")
        desc = img.get("description", "")
        print(f"  - ImageObject: {img_id}")
        assert img.get("contentUrl"), f"Missing contentUrl on {img_id}"
        assert img.get("width") and img.get("height"), f"Missing dimensions on {img_id}"
        assert img.get("encodingFormat") == "image/webp", f"Expected image/webp on {img_id}"
        
        words = caption.split()
        assert 5 <= len(words) <= 40, f"Caption word count on {img_id} must be 5-40 words, got {len(words)} ('{caption}')"
        for pfx in forbidden_prefixes:
            assert not caption.lower().startswith(pfx), f"Forbidden prefix '{pfx}' in caption on {img_id}"

    # Verify Report ties to image array
    report = next((item for item in data["@graph"] if item.get("@id") == "https://mtmediaai.com/delivery/iiip/#report"), None)
    assert report, "Missing #report entity in @graph"
    assert "image" in report and isinstance(report["image"], list), "Missing image array on #report"
    assert len(report["image"]) >= 9, "Expected at least 9 images linked in #report"

    print("[PASS] All 18 entities and Nina's Alt Gate ImageObject rules verified successfully.")
    return data

if __name__ == "__main__":
    test_schema_validity(r"C:\MOS\delivery\iiip\index.html")
