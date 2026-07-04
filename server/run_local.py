"""Launch the query service, optionally loading OPENROUTER_API_KEY from an env file.

    python run_local.py --env-file ../../.env --port 8077
"""
import argparse
import os

import uvicorn


def load_env_file(path: str) -> None:
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if key in ("OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY") and key not in os.environ:
                os.environ[key] = value.strip().strip('"').strip("'")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", default=None)
    parser.add_argument("--port", type=int, default=8077)
    args = parser.parse_args()
    if args.env_file:
        load_env_file(args.env_file)
    uvicorn.run("main:app", port=args.port, host="127.0.0.1")
