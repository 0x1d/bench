FROM golang:1.24-alpine AS builder
RUN apk add --no-cache ca-certificates
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /bench-api ./cmd/server

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /bench-api /usr/local/bin/bench-api
WORKDIR /
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/bench-api"]
