# nx remote cache: append /r/<repo> to the server URL so the cache server can attribute requests per repo
# (Nx keeps a path in NX_SELF_HOSTED_REMOTE_CACHE_SERVER). Repo = folder of the main checkout, so worktrees
# count for their repo. Outside git → base URL (metrics label repo="none"). Needs NX_CACHE_BASE_URL.
_nx_cache_repo_url() {
  [[ -n $NX_CACHE_BASE_URL ]] || return 0
  local common repo
  common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  if [[ -z $common ]]; then
    export NX_SELF_HOSTED_REMOTE_CACHE_SERVER=$NX_CACHE_BASE_URL
    return 0
  fi
  if [[ ${common:t} == .git ]]; then repo=${common:h:t}; else repo=${${common:t}%.git}; fi
  repo=${repo//[^A-Za-z0-9._-]/-}
  export NX_SELF_HOSTED_REMOTE_CACHE_SERVER="$NX_CACHE_BASE_URL/r/${repo[1,100]}"
}
_nx_cache_repo_url
autoload -Uz add-zsh-hook && add-zsh-hook chpwd _nx_cache_repo_url
