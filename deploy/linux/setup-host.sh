#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID} -ne 0 || ${FLOWNIX_HOST_APPROVED:-} != yes ]]; then
  echo 'Run with sudo only on an explicitly approved existing host.' >&2; exit 1
fi
. /etc/os-release
case $(uname -m) in aarch64|x86_64) ;; *) echo 'ARM64 or AMD64 is required.' >&2; exit 1 ;; esac
if [[ ${ID} != ubuntu ]]; then echo 'This host installer supports Ubuntu.' >&2; exit 1; fi
if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --silent --show-error --location https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  flownix_arch=$(dpkg --print-architecture)
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "${UBUNTU_CODENAME:-$VERSION_CODENAME}" "$flownix_arch" > /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
fi
systemctl enable --now docker
install -d -m 0700 /etc/flownix
install -d -m 0755 /opt/flownix/releases
printf 'Host ready: %s\n' "$(uname -m)"
# No cloud resources, firewall changes, listening ports or PostgreSQL server.
