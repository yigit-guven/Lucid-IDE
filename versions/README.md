# versions/

This directory contains the update metadata consumed by the built-in Lucid IDE auto-updater.

The updater fetches:
```
https://raw.githubusercontent.com/yigit-guven/Lucid-IDE/refs/heads/main/versions/{quality}/{platform}/{arch}
```

Expected response format:
```json
{
  "url": "https://github.com/yigit-guven/Lucid-IDE/releases/download/{tag}/{asset}",
  "name": "1.2.3",
  "version": "1.2.3",
  "productVersion": "1.2.3",
  "hash": "<sha1-of-archive>",
  "timestamp": 1234567890000,
  "sha256hash": "<sha256-of-archive>"
}
```

## Supported paths

| Quality  | Platform       | Arch         |
|----------|---------------|--------------|
| stable   | linux         | x64          |
| stable   | linux         | arm64        |
| stable   | linux         | arm          |
| stable   | win32         | x64          |
| stable   | win32         | arm64        |
| stable   | darwin        | x64          |
| stable   | darwin        | arm64        |
| insider  | linux         | x64          |
| insider  | linux         | arm64        |
| insider  | win32         | x64          |
| insider  | darwin        | x64          |
| insider  | darwin        | arm64        |

## Updating

The CI publish workflows should write the correct JSON to the appropriate path and commit it to `main` after each release.

Example update command (run from repo root after releasing):
```bash
# Write stable linux x64 update metadata
cat > versions/stable/linux/x64 <<EOF
{
  "url": "https://github.com/yigit-guven/Lucid-IDE/releases/download/${TAG}/LucidIDE-linux-x64-${VERSION}.tar.gz",
  "name": "${VERSION}",
  "version": "${VERSION}",
  "productVersion": "${VERSION}",
  "hash": "${SHA1}",
  "timestamp": $(date +%s)000,
  "sha256hash": "${SHA256}"
}
EOF
```
