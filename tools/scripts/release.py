#!/usr/bin/env python3
"""Build deterministic Homelab Atlas release files."""

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TAG_RE = re.compile(r"^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
FILES = (
    "go.mod",
    "app/main.go",
    "app/server.go",
    "deploy/Dockerfile",
    "compose.yaml",
    ".dockerignore",
    "deploy/compose.release.yaml",
    "README.md",
    "LICENSE",
    "docs/THIRD_PARTY_NOTICES.md",
    ".github/CONTRIBUTING.md",
    ".github/SECURITY.md",
)


def version_for(root: Path, tag: str) -> str:
    match = TAG_RE.fullmatch(tag)
    if not match:
        raise ValueError("tag must be stable SemVer: vMAJOR.MINOR.PATCH")
    version = ".".join(match.groups())
    package_version = json.loads((root / "package.json").read_text())["version"]
    if version != package_version:
        raise ValueError(f"tag {tag} does not match package.json version {package_version}")
    expected_image = f"ghcr.io/aiden0rchad/homelab-atlas:${{ATLAS_VERSION:-{version}}}"
    compose = (root / "deploy/compose.release.yaml").read_text()
    images = re.findall(r"^\s*image:\s*(\S+)\s*$", compose, re.MULTILINE)
    if images != [expected_image]:
        raise ValueError(f"compose.release.yaml image must be {expected_image}")
    return version


def release_files(root: Path) -> list[Path]:
    for name in ("app", "deploy", "docs", ".github"):
        directory = root / name
        if directory.is_symlink():
            raise ValueError(f"release input must not be a symlink: {directory}")
    paths = [root / name for name in FILES]
    public = root / "app/public"
    if public.is_symlink():
        raise ValueError(f"release input must not be a symlink: {public}")
    for current, directories, filenames in os.walk(public, followlinks=False):
        current_path = Path(current)
        for name in directories:
            if (current_path / name).is_symlink():
                raise ValueError(f"release input must not be a symlink: {current_path / name}")
        paths.extend(current_path / name for name in filenames)
    for path in paths:
        if path.is_symlink():
            raise ValueError(f"release input must not be a symlink: {path}")
        if not path.is_file():
            raise FileNotFoundError(path)
    return sorted(paths, key=lambda path: path.relative_to(root).as_posix())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build(root: Path, tag: str, output: Path) -> tuple[Path, Path, Path]:
    version = version_for(root, tag)
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"homelab-atlas-{version}.zip"
    compose = output / "compose.release.yaml"
    checksums = output / "SHA256SUMS"
    prefix = f"homelab-atlas-{version}"

    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in release_files(root):
            relative = path.relative_to(root).as_posix()
            info = zipfile.ZipInfo(f"{prefix}/{relative}", (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            bundle.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    shutil.copyfile(root / "deploy/compose.release.yaml", compose)
    covered = sorted((archive, compose), key=lambda path: path.name)
    checksums.write_text("".join(f"{sha256(path)}  {path.name}\n" for path in covered))
    return archive, compose, checksums


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", help="stable release tag, for example v0.1.0")
    parser.add_argument("--output", type=Path, default=Path("dist"))
    args = parser.parse_args()
    build(ROOT, args.tag, args.output)


if __name__ == "__main__":
    main()
