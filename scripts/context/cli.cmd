@echo off
"%SystemRoot%\System32\where.exe" node >nul 2>nul
if errorlevel 1 goto missingNode

node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (!((major === 22 && minor >= 18) || major === 24 || major >= 26)) { console.error('Loom context: [LOOM_NODE_UNSUPPORTED] Node.js ' + process.versions.node + ' is unsupported. The agent should configure a supported Node.js (22.18+ in 22.x, 24.x, or 26+), verify node --version, and retry this command.'); process.exit(2); }"
if errorlevel 1 exit /b %errorlevel%

node "%~dp0cli.ts" %*
exit /b %errorlevel%

:missingNode
>&2 echo Loom context: [LOOM_NODE_MISSING] Node.js is not available on PATH. The agent should reuse an installed runtime or install a supported Node.js ^(22.18+ in 22.x, 24.x, or 26+^), verify node --version, and retry this command.
exit /b 2
