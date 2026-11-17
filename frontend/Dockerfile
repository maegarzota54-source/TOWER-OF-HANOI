FROM swipl:latest

WORKDIR /app
COPY . .

# Render sets PORT itself; this is only a default
ENV PORT=10000
EXPOSE 10000

# Load the server, then keep the process alive
CMD ["swipl", "-g", "thread_get_message(_)", "backend/server.pl"]