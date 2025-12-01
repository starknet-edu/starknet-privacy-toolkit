FROM ubuntu:22.04

RUN apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash
ENV PATH="/root/.bb:${PATH}"

RUN bbup --version 0.67.0

WORKDIR /app

