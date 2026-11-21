.PHONY: start dev build install backend typecheck

# Build and run the production server (frontend + realtime backend on one port).
start: install build
	npm start

dev: install
	npm run dev

build: install
	npm run build

install: node_modules

node_modules: package.json
	npm install

backend: install
	npm run backend

typecheck: install
	npm run typecheck
