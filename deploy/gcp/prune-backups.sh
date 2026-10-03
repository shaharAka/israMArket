#!/usr/bin/env bash
# Sourced by backup.sh after a successful upload. Expire generated snapshot directories
# by age; apply the copy-count cap only to completed backups. Leave unrelated files alone.
prune_local_backups() {
  local backup_root=${1%/} backup_prefix=$2 expiry_stamp=$3 keep_copies=$4
  local backup_path backup_name backup_stamp
  local completed_names=()
  [[ -n "$backup_root" && -d "$backup_root" && ! -L "$backup_root" ]] || return 2
  [[ "$backup_prefix" =~ ^[A-Za-z0-9_-]+$ ]] || return 2
  [[ "$expiry_stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || return 2
  [[ "$keep_copies" =~ ^[1-9][0-9]*$ ]] || return 2

  while IFS= read -r -d '' backup_path; do
    backup_name=${backup_path##*/}
    [[ "$backup_name" =~ ^[A-Za-z0-9_-]+-([0-9]{8}T[0-9]{6}Z)$ ]] || continue
    backup_stamp=${BASH_REMATCH[1]}
    [[ ! -L "$backup_path/SHA256SUMS" ]] || continue
    [[ ( -f "$backup_path/isramarket.db.gz" && ! -L "$backup_path/isramarket.db.gz" ) ||
       ( -f "$backup_path/isramarket.db" && ! -L "$backup_path/isramarket.db" ) ]] || continue
    if [[ "$backup_stamp" < "$expiry_stamp" || "$backup_stamp" == "$expiry_stamp" ]]; then
      rm -rf -- "$backup_path"
    elif [[ "$backup_name" == "$backup_prefix-"* && -f "$backup_path/SHA256SUMS" &&
            -f "$backup_path/isramarket.db.gz" && ! -L "$backup_path/isramarket.db.gz" ]]; then
      completed_names+=("$backup_name")
    fi
  done < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -print0)

  if [[ ${#completed_names[@]} -gt "$keep_copies" ]]; then
    # Names above contain only safe ASCII characters, so newline sorting is sufficient.
    printf '%s\n' "${completed_names[@]}" | LC_ALL=C sort -r | tail -n +$((keep_copies + 1)) |
      while IFS= read -r backup_name; do
        rm -rf -- "$backup_root/$backup_name"
      done
  fi
}
