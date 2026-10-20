# Faheem College of Science, Sanawan — backend container
# Used by free Docker hosts (no-card hosts) to run the backend in backend/.
# The server reads its port from the PORT environment variable set by the host.
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN cd backend && npm install --omit=dev
EXPOSE 3000
CMD ["node", "backend/server.js"]
