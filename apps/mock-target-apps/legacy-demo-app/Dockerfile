FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY apps/mock-target-apps/legacy-demo-app/package.json apps/mock-target-apps/legacy-demo-app/package.json
RUN npm install --workspace=@launchpad/legacy-demo-app
COPY apps/mock-target-apps/legacy-demo-app apps/mock-target-apps/legacy-demo-app
WORKDIR /app/apps/mock-target-apps/legacy-demo-app
EXPOSE 4003
CMD ["npm", "run", "start"]
