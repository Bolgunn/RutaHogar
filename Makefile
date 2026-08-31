SHELL := /usr/bin/env bash

BACKEND_DIR := backend
FRONTEND_DIR := frontend

.PHONY: all help install-backend install-frontend run-backend run-frontend run

all: run

help:
	@echo "Available targets:"
	@echo "  make install-backend   - create backend venv and install Python dependencies"
	@echo "  make install-frontend  - install frontend npm dependencies"
	@echo "  make run-backend       - start FastAPI backend on port 8000"
	@echo "  make run-frontend      - start Vite frontend on port 5173"
	@echo "  make run               - install dependencies and start both servers"

install-backend:
	python3 -m venv $(BACKEND_DIR)/.venv
	$(BACKEND_DIR)/.venv/bin/python -m pip install -r $(BACKEND_DIR)/requirements.txt

install-frontend:
	cd $(FRONTEND_DIR) && npm install

run-backend:
	cd $(BACKEND_DIR) && .venv/Scripts/uvicorn app.main:app --reload --port 8000

run-frontend:
	cd $(FRONTEND_DIR) && npm run dev -- --host 0.0.0.0

run: install-backend install-frontend
	@echo "Starting backend in the background..."
	(cd $(BACKEND_DIR) && .venv/bin/uvicorn app.main:app --reload --port 8000 >/dev/null 2>&1 &) ; cd $(FRONTEND_DIR) && npm run dev -- --host 0.0.0.0
