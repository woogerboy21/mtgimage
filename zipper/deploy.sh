#!/bin/bash

ssh sandbox "mkdir -p /srv/mtgimage-zipper/node_modules"
scp package.json zip.sh zipSymbols.js zipImages.js sandbox:/srv/mtgimage-zipper
scp ../shared/C.js sandbox:/srv/mtgimage-zipper
#ssh sandbox "cd /srv/mtgimage-zipper ; npm install"
