<div id="lucidide-logo" align="center">
    <br />
    <img src="./icons/stable/codium_cnl.svg" alt="Lucid IDE Logo" width="200"/>
    <h1>Lucid IDE</h1>
    <h3>Free/Libre VS Code Binaries with Integrated Local AI</h3>
</div>

<div id="badges" align="center">

[![current release](https://img.shields.io/github/release/yigit-guven/Lucid-IDE.svg)](https://github.com/yigit-guven/Lucid-IDE/releases)
[![license](https://img.shields.io/github/license/yigit-guven/Lucid-IDE.svg)](https://github.com/yigit-guven/Lucid-IDE/blob/main/LICENSE)

</div>

**Lucid IDE is a build system that produces freely-licensed binaries of [Microsoft's `vscode` repository](https://github.com/microsoft/vscode) without telemetry/tracking, rebranded as Lucid IDE and extended with integrated local AI model management.**

> This project is a fork of [VSCodium](https://vscodium.com), which itself is not a code fork of VS Code — it is a set of scripts that clone and compile VS Code with community-friendly defaults.

## Table of Contents

- [Download/Install](#download-install)
- [Build](#build)
- [Why Does This Exist](#why)
- [More Info](#more-info)
- [Supported Platforms](#supported-platforms)

## <a id="download-install"></a>Download/Install

Download the latest release:
- [Stable](https://github.com/yigit-guven/Lucid-IDE/releases)
- [Insiders](https://github.com/yigit-guven/Lucid-IDE/releases?q=insider&expanded=true)

## <a id="build"></a>Build

```bash
# Clone this repo
git clone https://github.com/yigit-guven/Lucid-IDE
cd Lucid-IDE

# Build (Linux/macOS)
./dev/build.sh

# Build (Windows, requires Git Bash)
bash ./dev/build.sh
```

See [docs/howto-build.md](docs/howto-build.md) for full build instructions.

## <a id="why"></a>Why Does This Exist

Microsoft's VS Code source is open-source under the MIT license, but their pre-built binaries are released under a proprietary license with telemetry and tracking enabled by default.

Lucid IDE provides:
- **No telemetry or tracking** — all Microsoft telemetry is removed at build time
- **Open extension gallery** — uses [Open VSX Registry](https://open-vsx.org) by default
- **Local AI support** — built-in model download, management, and offline chat powered by local Ollama models (e.g., DeepSeek R1, Qwen Coder, Llama)
- **No proprietary branding** — fully MIT-licensed binaries

## <a id="more-info"></a>More Info

- [Documentation](docs/index.md)
- [Licensing](LICENSE)
- [Contributing](CONTRIBUTING.md)
- [Releases](https://github.com/yigit-guven/Lucid-IDE/releases)

## <a id="supported-platforms"></a>Supported Platforms

| Platform | Architectures |
|----------|--------------|
| Linux | x64, arm64, armhf, ppc64le, riscv64, loong64, s390x |
| Windows | x64, arm64, ia32 |
| macOS | x64, arm64 |
| Alpine | x64, arm64 |

## License

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026-present The Lucid IDE contributors  
Copyright (c) 2018-present The VSCodium contributors  
Copyright (c) 2015-present Microsoft Corporation