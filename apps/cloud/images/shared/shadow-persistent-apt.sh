#!/bin/sh
set -eu

system_apt="${SHADOWOB_SYSTEM_APT_GET:-/usr/bin/apt-get}"
system_dpkg_deb="${SHADOWOB_SYSTEM_DPKG_DEB:-dpkg-deb}"
cmd="${1:-}"

if { [ "$(id -u)" = "0" ] && [ "${SHADOWOB_PERSISTENT_APT_FORCE_USER:-0}" != "1" ]; } || \
  [ "${SHADOWOB_PERSISTENT_APT_DISABLE:-0}" = "1" ]; then
  exec "$system_apt" "$@"
fi

apt_root="${SHADOWOB_PERSISTENT_APT_ROOT:-${HOME:-/home/shadow}/.shadow-tools/apt}"
state_dir="$apt_root/state"
cache_dir="$apt_root/cache"
rootfs_dir="$apt_root/root"
bin_dir="${HOME:-/home/shadow}/.local/bin"

apt_opts="
  -o Dir::State=$state_dir
  -o Dir::State::status=$state_dir/status
  -o Dir::State::Lists=$state_dir/lists
  -o Dir::Cache=$cache_dir
  -o Dir::Cache::archives=$cache_dir/archives
  -o Dir::Etc::sourcelist=/etc/apt/sources.list
  -o Dir::Etc::sourceparts=/etc/apt/sources.list.d
  -o Dir::Etc::trusted=/etc/apt/trusted.gpg
  -o Dir::Etc::trustedparts=/etc/apt/trusted.gpg.d
"

prepare_dirs() {
  mkdir -p "$state_dir/lists/partial" "$cache_dir/archives/partial" "$rootfs_dir" "$bin_dir"
  touch "$state_dir/status"
}

apt_update() {
  prepare_dirs
  # shellcheck disable=SC2086
  "$system_apt" $apt_opts update
}

write_wrapper() {
  src="$1"
  name="$(basename "$src")"
  case "$name" in
    apt | apt-get | dpkg | dpkg-deb)
      return 0
      ;;
  esac

  cat >"$bin_dir/$name" <<EOF
#!/bin/sh
apt_root="\${SHADOWOB_PERSISTENT_APT_ROOT:-\${HOME:-/home/shadow}/.shadow-tools/apt}"
rootfs="\$apt_root/root"
lib_path=""
for dir in "\$rootfs"/usr/lib/* "\$rootfs"/lib/* "\$rootfs"/usr/lib "\$rootfs"/lib; do
  if [ -d "\$dir" ]; then
    if [ -n "\$lib_path" ]; then
      lib_path="\$lib_path:\$dir"
    else
      lib_path="\$dir"
    fi
  fi
done
if [ -n "\$lib_path" ]; then
  export LD_LIBRARY_PATH="\$lib_path\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
fi
export PATH="\$rootfs/usr/bin:\$rootfs/usr/sbin:\$rootfs/bin:\$rootfs/sbin:\$PATH"
exec "$src" "\$@"
EOF
  chmod +x "$bin_dir/$name"
}

link_binaries() {
  for dir in "$rootfs_dir/usr/bin" "$rootfs_dir/usr/sbin" "$rootfs_dir/bin" "$rootfs_dir/sbin"; do
    [ -d "$dir" ] || continue
    for src in "$dir"/*; do
      [ -f "$src" ] && [ -x "$src" ] || continue
      write_wrapper "$src"
    done
  done
}

persistent_install() {
  shift
  prepare_dirs
  apt_update
  # shellcheck disable=SC2086
  "$system_apt" $apt_opts -y --no-install-recommends --download-only install "$@"
  for deb in "$cache_dir"/archives/*.deb; do
    [ -f "$deb" ] || continue
    "$system_dpkg_deb" -x "$deb" "$rootfs_dir"
  done
  link_binaries
  echo "[shadow-apt] installed into $rootfs_dir"
  echo "[shadow-apt] command wrappers are available in $bin_dir"
}

case "$cmd" in
  update)
    shift
    apt_update "$@"
    ;;
  install)
    persistent_install "$@"
    ;;
  "")
    echo "shadow persistent apt: supported commands are update and install" >&2
    exit 2
    ;;
  *)
    echo "shadow persistent apt: non-root apt supports update/install only; use a custom image for full system package management" >&2
    exit 126
    ;;
esac
