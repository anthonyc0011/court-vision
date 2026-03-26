import json
import os
import re
from pathlib import Path
from urllib.request import urlopen


BASE_DIR = Path(__file__).resolve().parents[1]
MANIFEST_PATH = BASE_DIR / "school_logo_manifest.json"
OUTPUT_DIR = BASE_DIR / "school_logos"


def normalize_name(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")


def download(url: str, destination: Path) -> bool:
    try:
        with urlopen(url, timeout=15) as response:
            content = response.read()
        destination.write_bytes(content)
        return True
    except Exception:
        return False


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    completed = 0
    failed = []

    for school_name, domain in manifest.items():
        filename = OUTPUT_DIR / f"{normalize_name(school_name)}.png"
        if filename.exists():
            completed += 1
            continue
        urls = [
            f"https://logo.clearbit.com/{domain}",
            f"https://www.google.com/s2/favicons?sz=256&domain_url={domain}",
        ]
        success = False
        for url in urls:
            if download(url, filename):
                success = True
                completed += 1
                break
        if not success:
            failed.append(school_name)

    print(f"Downloaded {completed} logos")
    if failed:
        print("Missing:")
        for school in failed:
            print(f"- {school}")


if __name__ == "__main__":
    main()
