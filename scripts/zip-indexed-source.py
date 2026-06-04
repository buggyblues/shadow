#!/usr/bin/env python3
import argparse
import os
import subprocess
import zipfile
from pathlib import Path


DEFAULT_EXTS = {".ts", ".tsx", ".md"}


def run_git_ls_files(repo: Path) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=repo,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )

    output = result.stdout
    if not output:
        return []

    return [
        item.decode("utf-8", errors="replace")
        for item in output.split(b"\0")
        if item
    ]


def should_include(path: str, exts: set[str]) -> bool:
    return Path(path).suffix in exts


def make_zip(repo: Path, output: Path, exts: set[str]) -> int:
    files = run_git_ls_files(repo)

    selected = [
        f for f in files
        if should_include(f, exts) and (repo / f).is_file()
    ]

    output.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for rel_path in selected:
            abs_path = repo / rel_path
            zf.write(abs_path, arcname=rel_path)

    return len(selected)


def main():
    parser = argparse.ArgumentParser(
        description="Zip Git-indexed TypeScript/Markdown files from a project."
    )

    parser.add_argument(
        "repo",
        nargs="?",
        default=".",
        help="Project directory. Default: current directory.",
    )

    parser.add_argument(
        "-o",
        "--output",
        default="indexed-source.zip",
        help="Output zip path. Default: indexed-source.zip",
    )

    parser.add_argument(
        "--ext",
        nargs="+",
        default=sorted(DEFAULT_EXTS),
        help="Extensions to include. Default: .ts .tsx .md",
    )

    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    output = Path(args.output).resolve()
    exts = {e if e.startswith(".") else f".{e}" for e in args.ext}

    if not repo.exists():
        raise SystemExit(f"Repo path does not exist: {repo}")

    try:
        subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=repo,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
    except subprocess.CalledProcessError:
        raise SystemExit(f"Not a Git repository: {repo}")

    count = make_zip(repo, output, exts)

    print(f"Created: {output}")
    print(f"Included files: {count}")


if __name__ == "__main__":
    main()