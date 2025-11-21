// src/api/messageApi.js
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Fetch messages from server (supports pagination)
export const fetchMessages = async (page = 1) => {
  const res = await api.get(`/messages?page=${page}`);
  return res.data;
};

// Send message via REST API (optional, socket.io preferred)
export const sendMessageToServer = async (message) => {
  const res = await api.post("/messages", message);
  return res.data;
};
