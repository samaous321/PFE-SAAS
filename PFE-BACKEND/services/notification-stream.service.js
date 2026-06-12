const userStreams = new Map();

const writeEvent = (response, event, payload) => {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
};

export const registerNotificationStream = (userId, response) => {
  const key = String(userId);
  const streams = userStreams.get(key) || new Set();
  streams.add(response);
  userStreams.set(key, streams);
};

export const unregisterNotificationStream = (userId, response) => {
  const key = String(userId);
  const streams = userStreams.get(key);

  if (!streams) {
    return;
  }

  streams.delete(response);

  if (streams.size === 0) {
    userStreams.delete(key);
  }
};

export const emitNotificationEvent = (userId, notification) => {
  const streams = userStreams.get(String(userId));

  if (!streams || streams.size === 0) {
    return;
  }

  for (const response of streams) {
    writeEvent(response, "notification", notification);
  }
};

export const emitNotificationHeartbeat = (userId) => {
  const streams = userStreams.get(String(userId));

  if (!streams || streams.size === 0) {
    return;
  }

  const payload = { timestamp: new Date().toISOString() };
  for (const response of streams) {
    writeEvent(response, "ping", payload);
  }
};

export const sendNotificationStreamReady = (response) => {
  writeEvent(response, "connected", {
    connectedAt: new Date().toISOString()
  });
};
