# Las recetas necesitan bash. Si make se invoca desde PowerShell o cmd, "bash" no
# está en el PATH y make caería a cmd.exe, que falla al parsear las recetas.
# Se usan rutas 8.3 (PROGRA~1) porque make no tolera espacios en SHELL.
ifeq ($(OS),Windows_NT)
	GIT_BASH := $(firstword $(wildcard C:/PROGRA~1/Git/bin/bash.exe) $(wildcard C:/PROGRA~2/Git/bin/bash.exe))
	ifeq ($(GIT_BASH),)
		SHELL := bash
	else
		SHELL := $(GIT_BASH)
	endif
else
	SHELL := /usr/bin/env bash
endif

BACKEND_DIR := backend
FRONTEND_DIR := frontend

BACKEND_PORT := 8000
FRONTEND_PORT := 5173
BACKEND_LOG := $(BACKEND_DIR)/uvicorn.log
STORY_GRAPH := docs/story-graph.html

# En Windows venv crea Scripts/ y no bin/
ifeq ($(OS),Windows_NT)
	VENV_BIN := $(BACKEND_DIR)/.venv/Scripts
	PYTHON := python
	# En netstat de Windows la última columna es el PID
	LIST_PORT_PIDS = netstat -ano 2>/dev/null | grep "LISTENING" | grep ":$$port " | awk '{print $$NF}' | sort -u
	KILL_TREE = taskkill //PID $$pid //T //F >/dev/null 2>&1
else
	VENV_BIN := $(BACKEND_DIR)/.venv/bin
	PYTHON := python3
	LIST_PORT_PIDS = lsof -ti tcp:$$port -s TCP:LISTEN 2>/dev/null | sort -u
	KILL_TREE = kill -9 $$pid 2>/dev/null
endif

.PHONY: all help install-backend install-frontend run-backend run-frontend run stop logs story-graph

all: run

help:
	@echo "Available targets:"
	@echo "  make install-backend   - create backend venv and install Python dependencies"
	@echo "  make install-frontend  - install frontend npm dependencies"
	@echo "  make run-backend       - start FastAPI backend on port $(BACKEND_PORT)"
	@echo "  make run-frontend      - start Vite frontend on port $(FRONTEND_PORT)"
	@echo "  make run               - install dependencies and start both servers"
	@echo "  make stop              - stop leftover servers on ports $(BACKEND_PORT)/$(FRONTEND_PORT)"
	@echo "  make logs              - tail the background backend log"
	@echo "  make story-graph       - build the HU dependency graph into $(STORY_GRAPH)"

install-backend:
	@if [ ! -x "$(VENV_BIN)/python" ] && [ ! -x "$(VENV_BIN)/python.exe" ]; then \
		echo "Creating venv in $(BACKEND_DIR)/.venv..."; \
		$(PYTHON) -m venv $(BACKEND_DIR)/.venv; \
	fi
	@"$(VENV_BIN)/python" -m pip install -q -r $(BACKEND_DIR)/requirements.txt

install-frontend:
	cd $(FRONTEND_DIR) && npm install

run-backend: install-backend
	"$(VENV_BIN)/uvicorn" app.main:app --reload --port $(BACKEND_PORT) --app-dir $(BACKEND_DIR)

run-frontend: install-frontend
	cd $(FRONTEND_DIR) && npm run dev -- --host 0.0.0.0

# El backend corre en segundo plano; el trap lo mata al cortar el frontend con Ctrl+C.
# Si no, el puerto queda ocupado y el siguiente `make run` fallaba en silencio.
run: install-backend install-frontend
	@if netstat -an 2>/dev/null | grep -Eq "LISTEN(ING)?" && netstat -an 2>/dev/null | grep -Eq ":$(BACKEND_PORT) +[^ ]+ +LISTEN"; then \
		echo "ERROR: el puerto $(BACKEND_PORT) ya está ocupado. Corre 'make stop' primero."; \
		exit 1; \
	fi
	@echo "Starting backend in the background (logs: $(BACKEND_LOG))..."
	@"$(VENV_BIN)/uvicorn" app.main:app --reload --port $(BACKEND_PORT) --app-dir $(BACKEND_DIR) > $(BACKEND_LOG) 2>&1 & \
	backend_pid=$$!; \
	trap 'taskkill //PID $$backend_pid //T //F >/dev/null 2>&1 || kill $$backend_pid 2>/dev/null' EXIT INT TERM; \
	sleep 3; \
	if ! kill -0 $$backend_pid 2>/dev/null; then \
		echo "ERROR: el backend no arrancó:"; cat $(BACKEND_LOG); exit 1; \
	fi; \
	echo "Backend listo en http://127.0.0.1:$(BACKEND_PORT)"; \
	cd $(FRONTEND_DIR) && npm run dev -- --host 0.0.0.0

stop:
	@for port in $(BACKEND_PORT) $(FRONTEND_PORT); do \
		pids=$$($(LIST_PORT_PIDS)); \
		if [ -n "$$pids" ]; then \
			for pid in $$pids; do \
				echo "Stopping PID $$pid on port $$port"; \
				$(KILL_TREE); \
			done; \
		else \
			echo "Nothing listening on port $$port"; \
		fi; \
	done

logs:
	@tail -f $(BACKEND_LOG)

# El HTML es autocontenido y queda fuera de git: se comparte como archivo suelto.
story-graph:
	@node scripts/build-story-graph.js
