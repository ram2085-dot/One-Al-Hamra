FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY apps/mock-idp/package.json apps/mock-idp/package.json
RUN npm install --workspace=@launchpad/mock-idp
COPY apps/mock-idp apps/mock-idp
WORKDIR /app/apps/mock-idp
EXPOSE 4000
CMD ["npm", "run", "start"]
