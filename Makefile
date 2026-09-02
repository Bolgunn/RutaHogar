SHELL := /usr/bin/env bash

BACKEND_DIR := backend
FRONTEND_DIR := frontend

# Un venv de Windows pone los ejecutables en Scripts/ y uno POSIX en bin/.
# El Makefile mezclaba las dos convenciones: `run-backend` usaba Scripts/ y
# `run` e `install-backend` seguian usando bin/, asi que `make run` fallaba en
# Windows y `make run-backend` fallaba en macOS/Linux. Se resuelve una sola vez
# aca en vez de parchear cada receta.
ifeq ($(OS),Windows_NT)
VENV_BIN := .venv/Scripts
# En Windows `python3` suele ser el alias de la Microsoft Store, que abre la
# tienda en vez de crear el venv.
PYTHON := python
else
VENV_BIN := .venv/bin
PYTHON := python3
endif

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
	$(PYTHON) -m venv $(BACKEND_DIR)/.venv
	$(BACKEND_DIR)/$(VENV_BIN)/python -m pip install -r $(BACKEND_DIR)/requirements.txt

install-frontend:
	cd $(FRONTEND_DIR) && npm install

run-backend:
	cd $(BACKEND_DIR) && $(VENV_BIN)/uvicorn app.main:app --reload --port 8000

run-frontend:
	cd $(FRONTEND_DIR) && npm run dev -- --host 0.0.0.0

run: install-backend install-frontend
	@echo "Starting backend in the background..."
	(cd $(BACKEND_DIR) && $(VENV_BIN)/uvicorn app.main:app --reload --port 8000 >/dev/null 2>&1 &) ; cd $(FRONTEND_DIR) && npm run dev -- --host 0.0.0.0
