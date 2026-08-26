FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY apps/mock-target-apps/demo-app-b/package.json apps/mock-target-apps/demo-app-b/package.json
RUN npm install --workspace=@launchpad/demo-app-b
COPY apps/mock-target-apps/demo-app-b apps/mock-target-apps/demo-app-b
WORKDIR /app/apps/mock-target-apps/demo-app-b
EXPOSE 4002
CMD ["npm", "run", "start"]
