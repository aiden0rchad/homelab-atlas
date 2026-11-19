FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY app ./app
ARG TARGETOS TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/atlas ./app

FROM alpine:3.22
LABEL org.opencontainers.image.source="https://github.com/aiden0rchad/homelab-atlas" \
      org.opencontainers.image.title="Homelab Atlas" \
      org.opencontainers.image.description="Local-first visual editor for clear homelab diagrams" \
      org.opencontainers.image.licenses="MIT"
RUN apk add --no-cache ca-certificates
COPY --from=build /out/atlas /usr/local/bin/atlas
COPY LICENSE docs/THIRD_PARTY_NOTICES.md /usr/share/licenses/homelab-atlas/
USER 10001:10001
EXPOSE 8080
ENV HOST=0.0.0.0 PORT=8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 CMD ["atlas","healthcheck"]
ENTRYPOINT ["atlas"]
