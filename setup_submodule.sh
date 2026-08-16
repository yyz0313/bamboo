#!/bin/bash
# Setup git submodule for dsh vendor
# Run this AFTER pushing to GitHub

cd "$(dirname "$0")"

# Remove vendor/devdeepseek-harness from current tracking
git rm -r --cached vendor/deepseek-harness 2>/dev/null

# Initialize submodule
git submodule add https://github.com/deepseek-ai/deepseek-harness vendor/deepseek-harness

# Update .gitignore to not track files but allow submodule
# (submodule is already tracked by git, not by file content)

# Commit the change
git add .gitmodules vendor/deepseek-harness .gitignore
git commit -m "feat: add deepseek-harness as git submodule

- Enables proper upstream updates via git submodule update --remote
- .gitignore excludes built artifacts (lib/, dist/, etc.)
- bridge/cordis.yml stays as reference file"

# Push to main branch
git push origin main

echo "✅ Submodule configured!"
echo "Next: git submodule update --init --recursive"