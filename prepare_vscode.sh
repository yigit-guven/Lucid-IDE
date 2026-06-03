#!/usr/bin/env bash
# shellcheck disable=SC1091,2154

set -e

if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
  cp -rp src/insider/* vscode/
else
  cp -rp src/stable/* vscode/
fi

cp -f LICENSE vscode/LICENSE.txt

cd vscode || { echo "'vscode' dir not found"; exit 1; }

# rm -rf extensions/copilot

{ set +x; } 2>/dev/null

# {{{ product.json
cp product.json{,.bak}

setpath() {
  local jsonTmp
  { set +x; } 2>/dev/null
  jsonTmp=$( jq --arg 'value' "${3}" "setpath(path(.${2}); \$value)" "${1}.json" )
  echo "${jsonTmp}" > "${1}.json"
  set -x
}

setpath_json() {
  local jsonTmp
  { set +x; } 2>/dev/null
  jsonTmp=$( jq --argjson 'value' "${3}" "setpath(path(.${2}); \$value)" "${1}.json" )
  echo "${jsonTmp}" > "${1}.json"
  set -x
}

setpath "product" "checksumFailMoreInfoUrl" "https://go.microsoft.com/fwlink/?LinkId=828886"
setpath "product" "documentationUrl" "https://go.microsoft.com/fwlink/?LinkID=533484#vscode"
setpath_json "product" "extensionsGallery" '{"serviceUrl": "https://open-vsx.org/vscode/gallery", "itemUrl": "https://open-vsx.org/vscode/item", "latestUrlTemplate": "https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest", "controlUrl": "https://raw.githubusercontent.com/EclipseFdn/publish-extensions/refs/heads/master/extension-control/extensions.json"}'

setpath "product" "introductoryVideosUrl" "https://go.microsoft.com/fwlink/?linkid=832146"
setpath "product" "keyboardShortcutsUrlLinux" "https://go.microsoft.com/fwlink/?linkid=832144"
setpath "product" "keyboardShortcutsUrlMac" "https://go.microsoft.com/fwlink/?linkid=832143"
setpath "product" "keyboardShortcutsUrlWin" "https://go.microsoft.com/fwlink/?linkid=832145"
setpath "product" "licenseUrl" "https://github.com/yigit-guven/Lucid-IDE/blob/main/LICENSE"
setpath_json "product" "linkProtectionTrustedDomains" '["https://open-vsx.org"]'
setpath "product" "releaseNotesUrl" "https://github.com/yigit-guven/Lucid-IDE/releases"
setpath "product" "reportIssueUrl" "https://github.com/yigit-guven/Lucid-IDE/issues/new"
setpath "product" "requestFeatureUrl" "https://go.microsoft.com/fwlink/?LinkID=533482"
setpath "product" "tipsAndTricksUrl" "https://go.microsoft.com/fwlink/?linkid=852118"
setpath "product" "twitterUrl" "https://go.microsoft.com/fwlink/?LinkID=533687"

if [[ "${DISABLE_UPDATE}" != "yes" ]]; then
  setpath "product" "updateUrl" "https://raw.githubusercontent.com/yigit-guven/Lucid-IDE/refs/heads/main/versions"

  if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
    setpath "product" "downloadUrl" "https://github.com/yigit-guven/Lucid-IDE/releases"
  else
    setpath "product" "downloadUrl" "https://github.com/yigit-guven/Lucid-IDE/releases"
  fi

  # if [[ "${OS_NAME}" == "windows" ]]; then
  #   setpath_json "product" "win32VersionedUpdate" "true"
  # fi
fi

if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
  setpath "product" "nameShort" "Lucid IDE - Insiders"
  setpath "product" "nameLong" "Lucid IDE - Insiders"
  setpath "product" "applicationName" "lucid-insiders"
  setpath "product" "dataFolderName" ".lucidide-insiders"
  setpath "product" "linuxIconName" "lucidide-insiders"
  setpath "product" "quality" "insider"
  setpath "product" "urlProtocol" "lucidide-insiders"
  setpath "product" "serverApplicationName" "lucid-server-insiders"
  setpath "product" "serverDataFolderName" ".lucidide-server-insiders"
  setpath "product" "darwinBundleIdentifier" "dev.lucidide.LucidIDEInsiders"
  setpath "product" "win32AppUserModelId" "LucidIDE.LucidIDEInsiders"
  setpath "product" "win32DirName" "Lucid IDE Insiders"
  setpath "product" "win32MutexName" "lucidideinsiders"
  setpath "product" "win32NameVersion" "Lucid IDE Insiders"
  setpath "product" "win32RegValueName" "LucidIDEInsiders"
  setpath "product" "win32ShellNameShort" "Lucid IDE Insiders"
  setpath "product" "win32AppId" "{{8A793C6D-A41D-429F-A8AD-D75AE922E32A}"
  setpath "product" "win32x64AppId" "{{8DEC8B4F-AFF5-4BF5-9D81-9CE4FFCDBF4C}"
  setpath "product" "win32arm64AppId" "{{057A2D35-80A7-4E27-B660-BAECE180FBE8}"
  setpath "product" "win32UserAppId" "{{CCBCE74A-A7A3-4B5D-88F6-B397B2075B27}"
  setpath "product" "win32x64UserAppId" "{{72F398EB-F717-45DA-A148-FBD2015FF83A}"
  setpath "product" "win32arm64UserAppId" "{{EE0084CD-D063-41EC-93C8-64F95EF2AC59}"
  setpath "product" "tunnelApplicationName" "lucid-insiders-tunnel"
  setpath "product" "win32TunnelServiceMutex" "lucidideinsiders-tunnelservice"
  setpath "product" "win32TunnelMutex" "lucidideinsiders-tunnel"
  setpath "product" "win32ContextMenu.x64.clsid" "5E7D03BC-0167-4073-B05E-3434C9531424"
  setpath "product" "win32ContextMenu.arm64.clsid" "2C75873B-3DF3-4780-B281-BF1E0AEAC11E"
else
  setpath "product" "nameShort" "Lucid IDE"
  setpath "product" "nameLong" "Lucid IDE"
  setpath "product" "applicationName" "lucid"
  setpath "product" "linuxIconName" "lucidide"
  setpath "product" "quality" "stable"
  setpath "product" "urlProtocol" "lucidide"
  setpath "product" "serverApplicationName" "lucid-server"
  setpath "product" "serverDataFolderName" ".lucidide-server"
  setpath "product" "darwinBundleIdentifier" "dev.lucidide"
  setpath "product" "win32AppUserModelId" "LucidIDE.LucidIDE"
  setpath "product" "win32DirName" "Lucid IDE"
  setpath "product" "win32MutexName" "lucidide"
  setpath "product" "win32NameVersion" "Lucid IDE"
  setpath "product" "win32RegValueName" "LucidIDE"
  setpath "product" "win32ShellNameShort" "Lucid IDE"
  setpath "product" "win32AppId" "{{FA823687-B7E4-4D2A-857C-AEA3DB37B9B4}"
  setpath "product" "win32x64AppId" "{{A5CCBE31-C02B-4AD2-B393-6FBD7FE48265}"
  setpath "product" "win32arm64AppId" "{{217638D7-5659-4FAE-AEE7-47C589A07620}"
  setpath "product" "win32UserAppId" "{{083AC19E-52A4-4362-902F-3F22C12C888F}"
  setpath "product" "win32x64UserAppId" "{{3DC64769-FFFF-4109-996E-EB54F8621607}"
  setpath "product" "win32arm64UserAppId" "{{8E8E8EAD-6DED-4773-A3EE-8DE833719569}"
  setpath "product" "tunnelApplicationName" "lucid-tunnel"
  setpath "product" "win32TunnelServiceMutex" "lucidide-tunnelservice"
  setpath "product" "win32TunnelMutex" "lucidide-tunnel"
  setpath "product" "win32ContextMenu.x64.clsid" "8F112F8A-2566-416E-A1FA-5B171AE9439A"
  setpath "product" "win32ContextMenu.arm64.clsid" "92CFE6D8-CF10-4C36-995A-CAE792944E21"
fi

setpath_json "product" "tunnelApplicationConfig" '{}'

jsonTmp=$( jq -s '.[0] * .[1]' product.json ../product.json )
echo "${jsonTmp}" > product.json && unset jsonTmp

cat product.json
# }}}

# include common functions
. ../utils.sh

# {{{ apply patches

echo "APP_NAME=\"${APP_NAME}\""
echo "APP_NAME_LC=\"${APP_NAME_LC}\""
echo "ASSETS_REPOSITORY=\"${ASSETS_REPOSITORY}\""
echo "BINARY_NAME=\"${BINARY_NAME}\""
echo "GH_REPO_PATH=\"${GH_REPO_PATH}\""
echo "GLOBAL_DIRNAME=\"${GLOBAL_DIRNAME}\""
echo "ORG_NAME=\"${ORG_NAME}\""
echo "TUNNEL_APP_NAME=\"${TUNNEL_APP_NAME}\""

if [[ "${DISABLE_UPDATE}" == "yes" ]]; then
  mv ../patches/00-update-disable.patch.yet ../patches/00-update-disable.patch
fi

for file in ../patches/*.json; do
  if [[ -f "${file}" ]]; then
    apply_actions "${file}"
  fi
done

for file in ../patches/*.patch; do
  if [[ -f "${file}" ]]; then
    apply_patch "${file}"
  fi
done

if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
  for file in ../patches/insider/*.patch; do
    if [[ -f "${file}" ]]; then
      apply_patch "${file}"
    fi
  done
fi

if [[ -d "../patches/${OS_NAME}/" ]]; then
  for file in "../patches/${OS_NAME}/"*.patch; do
    if [[ -f "${file}" ]]; then
      apply_patch "${file}"
    fi
  done
fi

for file in ../patches/user/*.patch; do
  if [[ -f "${file}" ]]; then
    apply_patch "${file}"
  fi
done
# }}}

set -x

# {{{ install dependencies
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

if [[ "${OS_NAME}" == "linux" ]]; then
  export VSCODE_SKIP_NODE_VERSION_CHECK=1

   if [[ "${npm_config_arch}" == "arm" ]]; then
    export npm_config_arm_version=7
  fi
elif [[ "${OS_NAME}" == "windows" ]]; then
  if [[ "${npm_config_arch}" == "arm" ]]; then
    export npm_config_arm_version=7
  fi
else
  if [[ "${CI_BUILD}" != "no" ]]; then
    clang++ --version
  fi
fi

node build/npm/preinstall.ts

echo '<Project>
  <PropertyGroup Label="Configuration">
    <SpectreMitigation>false</SpectreMitigation>
  </PropertyGroup>
  <PropertyGroup>
    <ForceImportAfterCppProps>$(MSBuildThisFileDirectory)..\DisableSpectre.props</ForceImportAfterCppProps>
  </PropertyGroup>
</Project>' > Directory.Build.props

mv .npmrc .npmrc.bak
cp ../npmrc .npmrc

for i in {1..5}; do # try 5 times
  if [[ "${CI_BUILD}" != "no" && "${OS_NAME}" == "osx" ]]; then
    CXX=clang++ npm install --no-audit --no-fund && break
  else
    npm install --no-audit --no-fund && break
  fi

  if [[ $i == 5 ]]; then
    echo "Npm install failed too many times" >&2
    exit 1
  fi
  echo "Npm install failed $i, trying again..."

  sleep $(( 15 * (i + 1)))
done

mv .npmrc.bak .npmrc
# }}}

# package.json
cp package.json{,.bak}

setpath "package" "version" "${RELEASE_VERSION%-insider}"

replace 's|Microsoft Corporation|Lucid IDE contributors|' package.json

cp resources/server/manifest.json{,.bak}

if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
  setpath "resources/server/manifest" "name" "Lucid IDE - Insiders"
  setpath "resources/server/manifest" "short_name" "Lucid IDE - Insiders"
else
  setpath "resources/server/manifest" "name" "Lucid IDE"
  setpath "resources/server/manifest" "short_name" "Lucid IDE"
fi

# announcements
replace "s|\\[\\/\\* BUILTIN_ANNOUNCEMENTS \\*\\/\\]|$( tr -d '\n' < ../announcements-builtin.json )|" src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts

../undo_telemetry.sh

replace 's|Microsoft Corporation|Lucid IDE contributors|' build/lib/electron.ts
replace 's|([0-9]) Microsoft|\1 Lucid IDE|' build/lib/electron.ts

if [[ "${OS_NAME}" == "linux" ]]; then
  # microsoft adds their apt repo to sources
  # unless the app name is code-oss
  # as we are renaming the application to vscodium
  # we need to edit a line in the post install template
  if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
    sed -i "s/code-oss/lucid-insiders/" resources/linux/debian/postinst.template
  else
    sed -i "s/code-oss/lucid/" resources/linux/debian/postinst.template
  fi

  # fix the packages metadata
  # code.appdata.xml
  sed -i 's|Visual Studio Code|Lucid IDE|g' resources/linux/code.appdata.xml
  sed -i 's|https://code.visualstudio.com/docs/setup/linux|https://github.com/yigit-guven/Lucid-IDE#download-install|' resources/linux/code.appdata.xml
  sed -i 's|https://code.visualstudio.com/home/home-screenshot-linux-lg.png|https://lucidide.dev/img/lucidide.png|' resources/linux/code.appdata.xml
  sed -i 's|https://code.visualstudio.com|https://lucidide.dev|' resources/linux/code.appdata.xml

  # control.template
  sed -i 's|Microsoft Corporation <vscode-linux@microsoft.com>|Lucid IDE contributors https://github.com/yigit-guven/Lucid-IDE/graphs/contributors|'  resources/linux/debian/control.template
  sed -i 's|Visual Studio Code|Lucid IDE|g' resources/linux/debian/control.template
  sed -i 's|https://code.visualstudio.com/docs/setup/linux|https://github.com/yigit-guven/Lucid-IDE#download-install|' resources/linux/debian/control.template
  sed -i 's|https://code.visualstudio.com|https://lucidide.dev|' resources/linux/debian/control.template

  # code.spec.template
  sed -i 's|Microsoft Corporation|Lucid IDE contributors|' resources/linux/rpm/code.spec.template
  sed -i 's|Visual Studio Code Team <vscode-linux@microsoft.com>|Lucid IDE contributors https://github.com/yigit-guven/Lucid-IDE/graphs/contributors|' resources/linux/rpm/code.spec.template
  sed -i 's|Visual Studio Code|Lucid IDE|' resources/linux/rpm/code.spec.template
  sed -i 's|https://code.visualstudio.com/docs/setup/linux|https://github.com/yigit-guven/Lucid-IDE#download-install|' resources/linux/rpm/code.spec.template
  sed -i 's|https://code.visualstudio.com|https://lucidide.dev|' resources/linux/rpm/code.spec.template

  # snapcraft.yaml
  sed -i 's|Visual Studio Code|Lucid IDE|' resources/linux/rpm/code.spec.template
elif [[ "${OS_NAME}" == "windows" ]]; then
  # code.iss
  sed -i 's|https://code.visualstudio.com|https://lucidide.dev|' build/win32/code.iss
  sed -i 's|Microsoft Corporation|Lucid IDE contributors|' build/win32/code.iss

  # patch gulpfile for rcedit robustness
  node ../dev/patch_gulpfile.js
fi

replace 's/build_from_source="true"/build_from_source="false"/' remote/.npmrc
replace 's/build_from_source="true"/build_from_source="false"/' build/.npmrc

cd ..
