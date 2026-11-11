<#
Deploys the Palam web app to GitHub Pages.

What it does:
  1. npx expo export --platform web   -> builds the static bundle into dist/
  2. Adds Pages plumbing to dist/:
       CNAME      app.palamapp.com (custom domain)
       .nojekyll  (Pages must serve _expo/* folders verbatim)
       404.html   copy of index.html - SPA fallback so deep links like
                  /expert/<id> load the app shell and expo-router recovers
                  the route client-side
  3. Force-pushes dist/ as a fresh single-commit `main` to ChatHi-eng/palam-web
     (creates the public repo with gh if it doesn't exist - built output only,
     no history worth keeping)
  4. Enables GitHub Pages on that repo via the API (prints the one manual
     step if the token can't)

Run from anywhere:  powershell -ExecutionPolicy Bypass -File scripts\deploy-web.ps1
#>

$ErrorActionPreference = 'Stop'

$Repo = 'ChatHi-eng/palam-web'
$Domain = 'app.palamapp.com'

# Node is installed at C:\Program Files\nodejs on this machine but not on PATH.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $env:Path = "C:\Program Files\nodejs;$env:Path"
}
$ghCmd = Get-Command gh -ErrorAction SilentlyContinue
if ($ghCmd) { $gh = $ghCmd.Source } else { $gh = 'C:\Program Files\GitHub CLI\gh.exe' }
if (-not (Test-Path $gh)) { throw 'GitHub CLI (gh) not found - install it or fix the path in this script.' }

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "==> Building web bundle (expo export)"
npx expo export --platform web
if ($LASTEXITCODE -ne 0) { throw 'expo export failed' }

$dist = Join-Path $root 'dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) { throw "No index.html in $dist - export produced nothing?" }

Write-Host "==> Adding CNAME / .nojekyll / 404.html"
Set-Content -Path (Join-Path $dist 'CNAME') -Value $Domain -Encoding ascii
New-Item -ItemType File -Path (Join-Path $dist '.nojekyll') -Force | Out-Null
Copy-Item (Join-Path $dist 'index.html') (Join-Path $dist '404.html') -Force

Write-Host "==> Ensuring repo $Repo exists"
& $gh repo view $Repo --json name | Out-Null
if ($LASTEXITCODE -ne 0) {
  & $gh repo create $Repo --public --description 'Palam web app (app.palamapp.com) - built output published by scripts/deploy-web.ps1 in ChatHi-eng/human-intelligence'
  if ($LASTEXITCODE -ne 0) { throw 'gh repo create failed' }
}

Write-Host "==> Publishing dist/ to $Repo (force push, fresh history)"
Push-Location $dist
try {
  if (Test-Path '.git') { Remove-Item -Recurse -Force '.git' }
  git init -b main | Out-Null
  git add -A
  git -c user.name='Palam Deploy' -c user.email='info@palamapp.com' commit -m "deploy $(Get-Date -Format s)" | Out-Null
  git push -f "https://github.com/$Repo.git" main
  if ($LASTEXITCODE -ne 0) { throw 'git push failed' }
} finally {
  if (Test-Path '.git') { Remove-Item -Recurse -Force '.git' }
  Pop-Location
}

Write-Host "==> Enabling GitHub Pages (branch main, root)"
& $gh api -X POST "repos/$Repo/pages" -f 'source[branch]=main' -f 'source[path]=/'
if ($LASTEXITCODE -ne 0) {
  # Already enabled - make sure the branch/domain are right.
  & $gh api -X PUT "repos/$Repo/pages" -f "cname=$Domain" -f 'source[branch]=main' -f 'source[path]=/'
  if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'Could not configure Pages via the API. One manual step:'
    Write-Host "  Open https://github.com/$Repo/settings/pages and set Source to 'Deploy from a branch', branch 'main', folder '/ (root)'."
  }
}

Write-Host ''
Write-Host "Deployed. Pages serves https://$Domain once the DNS CNAME exists:"
Write-Host "  app.palamapp.com  CNAME  chathi-eng.github.io"
Write-Host "(Until then the github.io URL redirects to the custom domain and won't resolve.)"
