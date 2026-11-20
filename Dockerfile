FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=npm_ca,target=/tmp/npm-ca.pem \
    if [ -f /tmp/npm-ca.pem ]; then NODE_EXTRA_CA_CERTS=/tmp/npm-ca.pem npm ci; else npm ci; fi
COPY --chown=node:node . .
RUN npm run build && chmod -R a+rX dist && mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production PORT=8787 TEAM_STATE_PATH=/app/data/teams.sqlite
EXPOSE 8787
VOLUME /app/data
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/teams/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/index.ts"]
