#!/bin/bash
cd /home/site/wwwroot
npm install
npx prisma generate
node dist/index.js
