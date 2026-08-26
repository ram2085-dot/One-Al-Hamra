FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY apps/mock-target-apps/demo-app-a/package.json apps/mock-target-apps/demo-app-a/package.json
RUN npm install --workspace=@launchpad/demo-app-a
COPY apps/mock-target-apps/demo-app-a apps/mock-target-apps/demo-app-a
WORKDIR /app/apps/mock-target-apps/demo-app-a
EXPOSE 4001
CMD ["npm", "run", "start"]
