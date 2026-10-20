FROM alpine:3.23.3

RUN apk update && apk upgrade && \
  apk add --no-cache nodejs npm  \
  git py3-pip bash curl vim make rsync \
  gcc libc-dev g++ binutils autoconf automake libtool pkgconfig check-dev file patch jq \
  libxml2-utils groff tidyhtml yq zip \
  sqlite util-linux
RUN addgroup builder \
  && adduser -D -G builder -h /builder builder

RUN apk add alpine-conf tzdata
RUN setup-timezone -z 'Europe/London'

USER builder
WORKDIR /builder
RUN mkdir -p /builder/.local/bin
RUN npm config set prefix '~/.local/'
RUN npm config set fund false
ENV PATH=/builder/.local/bin/:$PATH
ENV NODE_OPTIONS="--experimental-vm-modules --disable-warning=ExperimentalWarning"
RUN python3 -m venv /builder/pyenv && \
  source /builder/pyenv/bin/activate && \
  pip install --upgrade pip
RUN echo 'OLDPS=$PS1' >> /builder/.bashrc
RUN echo "source /builder/pyenv/bin/activate" >> /builder/.bashrc
RUN echo "alias python=python3" >> /builder/.bashrc
RUN echo "alias pip=pip3" >> /builder/.bashrc
RUN echo 'export PS1=$OLDPS' >> /builder/.bashrc
RUN echo 'export "PATH=$PROJECT/workspace/node_modules/.bin/:$PATH"' >> /builder/.bashrc
RUN echo 'export NODE_OPTIONS="' $NODE_OPTIONS '"' >> /builder/.bashrc
RUN echo 'git config --global --add  safe.directory $PROJECT' >> /builder/.bashrc
ENTRYPOINT /bin/bash
