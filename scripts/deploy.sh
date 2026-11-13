#!/bin/sh
# Build the game and publish dist/ to the gh-pages branch (served by GitHub Pages).
set -e
cd "$(dirname "$0")/.."
remote=$(git remote get-url origin)
npm run build
cd dist
touch .nojekyll
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy $(git -C .. rev-parse --short HEAD)"
git push -f -q "$remote" gh-pages
rm -rf .git
echo "Deployed to gh-pages"
