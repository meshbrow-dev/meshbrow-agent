FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o meshbrow-agent ./cmd/agent

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/meshbrow-agent /usr/local/bin/meshbrow-agent

ENTRYPOINT ["meshbrow-agent"]
