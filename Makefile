.PHONY: start dev build install typecheck

# Build and run the production app (needs ABLY_API_KEY in .env.local).
start: install build
	npm start

dev: install
	npm run dev

build: install
	npm run build

install: node_modules

node_modules: package.json
	npm install

typecheck: install
	npm run typecheck
