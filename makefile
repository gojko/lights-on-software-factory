comma := ,
MAKEFILE_DIR:=$(dir $(abspath $(lastword $(MAKEFILE_LIST))))
PROJECT=$(abspath $(MAKEFILE_DIR))
CONTAINER_PORT ?= 8080
LOCAL_PORT ?= 8080
HOST_ARCH := $(shell uname -m)
DOCKER_ARCH := $(if $(filter x86_64 amd64,$(HOST_ARCH)),amd64,$(if $(filter aarch64 arm64,$(HOST_ARCH)),arm64,$(HOST_ARCH)))
DOCKER_PLATFORM ?= linux/$(DOCKER_ARCH)
DOCKER_IMAGE_DIR ?= vm
DOCKER_IMAGE_NAME ?= software-factory
CLAUDE_HOME := $(PROJECT)/.claude-home

docker-image: vm/Dockerfile
	docker build --platform $(DOCKER_PLATFORM) -t $(DOCKER_IMAGE_NAME) $(DOCKER_IMAGE_DIR)

DOCKER_CMD=docker run --rm \
		--platform $(DOCKER_PLATFORM) \
		-v $(PROJECT):$(PROJECT) \
		-ePROJECT="$(PROJECT)" \
		-v $(CLAUDE_HOME):/builder/.claude \
		-eCLAUDE_CONFIG_DIR=/builder/.claude \
		--shm-size=4gb \
		-w "$(PROJECT)/workspace"

$(CLAUDE_HOME):
	mkdir -p $@

shell: | $(CLAUDE_HOME)
	$(DOCKER_CMD) \
	-p $(CONTAINER_PORT):$(LOCAL_PORT)/tcp \
	-e CONTAINER_PORT=$(CONTAINER_PORT) \
	-e PS1="($(DOCKER_IMAGE_NAME)) [\t] \w/ $$ " \
	-it $(DOCKER_IMAGE_NAME)

claude: | $(CLAUDE_HOME)
	$(DOCKER_CMD) \
	-e ANTHROPIC_API_KEY \
	--entrypoint /bin/bash \
	-it $(DOCKER_IMAGE_NAME) -ic claude

root:
	docker run \
		-u 0 \
		--platform $(DOCKER_PLATFORM) \
		-it $(DOCKER_IMAGE_NAME)

init test lint: docker-image | $(CLAUDE_HOME)
	$(DOCKER_CMD) --entrypoint /usr/bin/make -t $(DOCKER_IMAGE_NAME) $@

.PHONY: init test lint shell claude root docker-image
