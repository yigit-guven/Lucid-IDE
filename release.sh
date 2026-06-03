#!/usr/bin/env bash
# shellcheck disable=SC1091

set -ex

if [[ -z "${GH_TOKEN}" ]] && [[ -z "${GITHUB_TOKEN}" ]] && [[ -z "${GH_ENTERPRISE_TOKEN}" ]] && [[ -z "${GITHUB_ENTERPRISE_TOKEN}" ]]; then
  echo "Will not release because no GITHUB_TOKEN defined"
  exit
fi

REPOSITORY_OWNER="${ASSETS_REPOSITORY/\/*/}"
REPOSITORY_NAME="${ASSETS_REPOSITORY/*\//}"

npm install -g github-release-cli

if [[ $( gh release view "${RELEASE_VERSION}" --repo "${ASSETS_REPOSITORY}" 2>&1 ) =~ "release not found" ]]; then
  echo "Creating release '${RELEASE_VERSION}'"

  . ./utils.sh

  APP_NAME_LC="$( echo "${APP_NAME}" | awk '{print tolower($0)}' )"
  VERSION="${RELEASE_VERSION%-insider}"

  if [[ "${VSCODE_QUALITY}" == "insider" ]]; then
    NOTES="update vscode to [${MS_COMMIT}](https://github.com/microsoft/vscode/tree/${MS_COMMIT})"

    replace "s|@@APP_NAME@@|${APP_NAME}|g" release_notes.md
    replace "s|@@APP_NAME_LC@@|${APP_NAME_LC}|g" release_notes.md
    replace "s|@@APP_NAME_QUALITY@@|${APP_NAME}-Insiders|g" release_notes.md
    replace "s|@@ASSETS_REPOSITORY@@|${ASSETS_REPOSITORY}|g" release_notes.md
    replace "s|@@BINARY_NAME@@|${BINARY_NAME}|g" release_notes.md
    replace "s|@@MS_TAG@@|${MS_COMMIT}|g" release_notes.md
    replace "s|@@MS_URL@@|https://github.com/microsoft/vscode/tree/${MS_COMMIT}|g" release_notes.md
    replace "s|@@QUALITY@@|-insider|g" release_notes.md
    replace "s|@@RELEASE_NOTES@@||g" release_notes.md
    replace "s|@@VERSION@@|${VERSION}|g" release_notes.md

    gh release create "${RELEASE_VERSION}" --repo "${ASSETS_REPOSITORY}" --title "${RELEASE_VERSION}" --notes-file release_notes.md
  else
    gh release create "${RELEASE_VERSION}" --repo "${ASSETS_REPOSITORY}" --title "${RELEASE_VERSION}" --generate-notes

    RELEASE_NOTES=$( gh release view "${RELEASE_VERSION}" --repo "${ASSETS_REPOSITORY}" --json "body" --jq ".body" )

    replace "s|@@APP_NAME@@|${APP_NAME}|g" release_notes.md
    replace "s|@@APP_NAME_LC@@|${APP_NAME_LC}|g" release_notes.md
    replace "s|@@APP_NAME_QUALITY@@|${APP_NAME}|g" release_notes.md
    replace "s|@@ASSETS_REPOSITORY@@|${ASSETS_REPOSITORY}|g" release_notes.md
    replace "s|@@BINARY_NAME@@|${BINARY_NAME}|g" release_notes.md
    replace "s|@@MS_TAG@@|${MS_TAG}|g" release_notes.md
    replace "s|@@MS_URL@@|https://code.visualstudio.com/updates/v$( echo "${MS_TAG//./_}" | cut -d'_' -f 1,2 )|g" release_notes.md
    replace "s|@@QUALITY@@||g" release_notes.md
    replace "s|@@RELEASE_NOTES@@|${RELEASE_NOTES//$'\n'/\\n}|g" release_notes.md
    replace "s|@@VERSION@@|${VERSION}|g" release_notes.md

    gh release edit "${RELEASE_VERSION}" --repo "${ASSETS_REPOSITORY}" --notes-file release_notes.md
  fi
fi

# Update announcements-extra.json
if [[ -n "${RELEASE_VERSION}" ]] && [[ -n "${ASSETS_REPOSITORY}" ]]; then
  echo "Updating announcements-extra.json for release ${RELEASE_VERSION}..."

  NEW_ENTRY=$(jq -n \
    --arg id "${RELEASE_VERSION}" \
    --arg title "Lucid IDE ${RELEASE_VERSION} released!" \
    --arg url "https://github.com/${ASSETS_REPOSITORY}/releases/tag/${RELEASE_VERSION}" \
    '{id: $id, title: $title, url: $url}')

  if [[ ! -f "announcements-extra.json" ]] || [[ ! -s "announcements-extra.json" ]]; then
    echo "[]" > announcements-extra.json
  fi

  jq --argjson new "$NEW_ENTRY" \
     'if any(.[]; .id == $new.id) then . else [$new] + . end' \
     announcements-extra.json > announcements-extra.json.tmp && mv announcements-extra.json.tmp announcements-extra.json

  if [[ -n "${GITHUB_TOKEN}" ]]; then
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${ASSETS_REPOSITORY}.git"
    git add announcements-extra.json
    git commit -m "Update announcements-extra.json for release ${RELEASE_VERSION} [skip ci]" || echo "No changes to announcements-extra.json"

    # Push with retry
    for i in {1..5}; do
      if git push origin HEAD; then
        break
      fi
      git pull --rebase origin HEAD
    done
  else
    echo "Skipping push because GITHUB_TOKEN is not defined"
  fi
fi

cd assets

set +e

for FILE in *; do
  if [[ -f "${FILE}" ]] && [[ "${FILE}" != *.sha1 ]] && [[ "${FILE}" != *.sha256 ]]; then
    echo "::group::Uploading '${FILE}' at $( date "+%T" )"
    gh release upload --repo "${ASSETS_REPOSITORY}" "${RELEASE_VERSION}" "${FILE}" "${FILE}.sha1" "${FILE}.sha256"

    EXIT_STATUS=$?
    echo "exit: ${EXIT_STATUS}"

    if (( "${EXIT_STATUS}" )); then
      for (( i=0; i<10; i++ )); do
        github-release delete --owner "${REPOSITORY_OWNER}" --repo "${REPOSITORY_NAME}" --tag "${RELEASE_VERSION}" "${FILE}" "${FILE}.sha1" "${FILE}.sha256"

        sleep $(( 15 * (i + 1)))

        echo "RE-Uploading '${FILE}' at $( date "+%T" )"
        gh release upload --repo "${ASSETS_REPOSITORY}" "${RELEASE_VERSION}" "${FILE}" "${FILE}.sha1" "${FILE}.sha256"

        EXIT_STATUS=$?
        echo "exit: ${EXIT_STATUS}"

        if ! (( "${EXIT_STATUS}" )); then
          break
        fi
      done
      echo "exit: ${EXIT_STATUS}"

      if (( "${EXIT_STATUS}" )); then
        echo "'${FILE}' hasn't been uploaded!"

        github-release delete --owner "${REPOSITORY_OWNER}" --repo "${REPOSITORY_NAME}" --tag "${RELEASE_VERSION}" "${FILE}" "${FILE}.sha1" "${FILE}.sha256"

        exit 1
      fi
    fi

    echo "::endgroup::"
  fi
done

cd ..
