#!/bin/bash
cd ~/Hydro

echo "🔨 构建欢迎消息插件..."
cd packages/welcome-message
npx tsc
cd ../..

echo "🚀 启动 HydroOJ..."
yarn build:client
yarn build:server
yarn start
