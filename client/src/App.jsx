// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { fetchMessages } from "./api/messageApi";

/**
 * App.jsx
 * - username-based login
 * - presence sidebar
 * - loads recent messages via REST (pagination)
 * - real-time messages via socket.io
 * - typing indicator, optimistic UI for sending
 */

export default function App() {
  const [user, setUser] = useState(null);
  const [presence, setPresence] = useState([]); // [{ username, isOnline }]
  const [messages, setMessages] = useState([]); // message objects from server
  const [text, setText] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [page, setPage] = useState(1);
  const [typingUsers, setTypingUsers] = useState({});
  const listRef = useRef(null);
  const oldestRef = useRef(null);

  // connect socket once
  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      console.log("socket connected:", socket.id);
    });

    // presence
    socket.on("presence:update", (users) => {
      setPresence(users || []);
    });

    // new message from server
    socket.on("message:new", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    // react/update/read events
    socket.on("reaction:update", ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, reactions } : m))
      );
    });

    socket.on("message:read", ({ messageId, user: reader }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? {
                ...m,
                readBy: Array.from(new Set([...(m.readBy || []), reader])),
              }
            : m
        )
      );
    });

    socket.on("typing", ({ user: u, isTyping }) => {
      setTypingUsers((prev) => ({ ...prev, [u]: isTyping }));
      // auto-clear after a short period
      setTimeout(() => setTypingUsers((p) => ({ ...p, [u]: false })), 1500);
    });

    return () => {
      socket.off();
      socket.disconnect();
    };
  }, []);

  // load initial messages (page 1)
  useEffect(() => {
    (async () => {
      try {
        const msgs = await fetchMessages(1);
        setMessages(msgs || []);
        if (msgs && msgs.length) oldestRef.current = msgs[0].createdAt;
        setPage(1);
      } catch (err) {
        console.error("fetchMessages error", err);
      }
    })();
  }, []);

  // auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // login (username-based)
  const login = (username) => {
    if (!username || !username.trim()) return alert("Enter a username");
    socket.emit("auth:login", { username: username.trim() }, (res) => {
      if (res?.ok) {
        setUser(res.user);
        // join global room
        socket.emit("join:room", { roomId: "global" });
      } else {
        alert(res?.error || "Login failed");
      }
    });
  };

  // send message (socket event -> server persists & broadcasts)
  const sendMessage = () => {
    if (!text.trim() || !user) return;
    const payload = {
      roomId: "global",
      from: { id: user.username, name: user.username },
      text: text.trim(),
      attachments: [],
    };

    // optimistic UI: push temporary message
    const temp = {
      ...payload,
      _id: `temp-${Date.now()}`,
      createdAt: new Date().toISOString(),
      pending: true,
      readBy: [],
    };
    setMessages((p) => [...p, temp]);
    setText("");

    socket.emit("message:send", payload, (ack) => {
      if (!ack?.ok) {
        // mark as failed if ack failed
        setMessages((prev) =>
          prev.map((m) => (m._id === temp._id ? { ...m, failed: true } : m))
        );
      }
      // otherwise server will emit message:new and the real message will be appended.
    });
  };

  // load older messages (pagination)
  const loadOlder = async () => {
    if (!oldestRef.current) return;
    setLoadingOlder(true);
    try {
      const nextPage = page + 1;
      const older = await fetchMessages(nextPage);
      if (older && older.length) {
        setMessages((prev) => [...older, ...prev]);
        oldestRef.current = older[0].createdAt;
        setPage(nextPage);
      }
    } catch (err) {
      console.error("loadOlder error", err);
    }
    setLoadingOlder(false);
  };

  // typing indicator emit
  let typingTimeout = useRef(null);
  const handleTyping = (val) => {
    setText(val);
    socket.emit("typing", {
      roomId: "global",
      user: user?.username,
      isTyping: true,
    });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit("typing", {
        roomId: "global",
        user: user?.username,
        isTyping: false,
      });
    }, 700);
  };

  // mark message read (e.g., when message visible) - simple example marking last message read
  const markLastRead = () => {
    const last = messages[messages.length - 1];
    if (last && !last.readBy?.includes(user.username)) {
      socket.emit("message:read", { messageId: last._id, user: user.username });
    }
  };

  // simple reaction emitter
  const addReaction = (messageId, emoji = "👍") => {
    socket.emit("reaction:add", {
      roomId: "global",
      messageId,
      emoji,
      user: user.username,
    });
  };

  if (!user) return <Login onLogin={login} />;

  return (
    <div className="chat-container" onMouseEnter={markLastRead}>
      <div className="chat-header">Global Chat</div>

      <div style={{ display: "flex", height: "calc(100% - 120px)" }}>
        <aside
          style={{ width: 240, borderRight: "1px solid #e5e7eb", padding: 12 }}
        >
          <h4>Users</h4>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {presence.map((p) => (
              <li key={p.username} style={{ padding: "6px 0" }}>
                {p.username} {p.isOnline ? "🟢" : "⚪"}
              </li>
            ))}
          </ul>
        </aside>

        <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              padding: 8,
              borderBottom: "1px solid #eee",
              textAlign: "center",
            }}
          >
            <button onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? "..." : "Load older messages"}
            </button>
          </div>

          <div className="messages" ref={listRef} style={{ flex: 1 }}>
            <MessageList
              messages={messages}
              me={user.username}
              onReact={addReaction}
            />
          </div>

          <div
            style={{
              padding: 12,
              borderTop: "1px solid #e5e7eb",
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="msg-input"
                placeholder="Type a message..."
                value={text}
                onChange={(e) => handleTyping(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
              />
              <button className="send-btn" onClick={sendMessage}>
                Send
              </button>
            </div>

            <div style={{ marginTop: 6, color: "#6b7280", minHeight: 18 }}>
              {Object.entries(typingUsers)
                .filter(([_, v]) => v)
                .map(([u]) => u)
                .join(", ")
                ? `${Object.entries(typingUsers)
                    .filter(([_, v]) => v)
                    .map(([u]) => u)
                    .join(", ")} is typing...`
                : ""}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function Login({ onLogin }) {
  const [name, setName] = useState("");
  console.log("Name:", name);

  return (
    <div style={{ width: 360, margin: "120px auto", textAlign: "center" }}>
      <h2>Join the chat</h2>
      <input
        placeholder="Enter username"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: 10, width: "100%", marginBottom: 8 }}
      />
      <button style={{ padding: "10px 16px" }} onClick={() => onLogin(name)}>
        Join
      </button>
      <p style={{ color: "#6b7280", marginTop: 12 }}>
        No password — this is a demo username-based auth.
      </p>
    </div>
  );
}

function MessageList({ messages = [], me, onReact }) {
  return (
    <>
      {messages.map((m) => (
        <MessageBubble
          key={m._id || m.id || `${m.from?.name}-${m.createdAt}`}
          m={m}
          me={me}
          onReact={onReact}
        />
      ))}
    </>
  );
}

function MessageBubble({ m, me, onReact }) {
  const isMe = m.from?.name === me;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isMe ? "flex-end" : "flex-start",
        padding: 8,
      }}
    >
      <div
        className={`msg ${isMe ? "me" : "other"}`}
        style={{ maxWidth: "72%" }}
      >
        <div style={{ fontSize: 12, fontWeight: 600 }}>{m.from?.name}</div>
        <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{m.text}</div>

        {m.attachments && m.attachments.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {m.attachments.map((a, i) => (
              <div key={i}>
                <a href={a.url} target="_blank" rel="noreferrer">
                  {a.filename || a.url}
                </a>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 8,
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            {new Date(m.createdAt).toLocaleTimeString()}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* simple reaction UI */}
            <button
              onClick={() => onReact(m._id || m.id || "")}
              style={{
                cursor: "pointer",
                border: "none",
                background: "transparent",
              }}
            >
              👍{" "}
              {m.reactions
                ? Object.values(m.reactions).reduce(
                    (acc, arr) => acc + (arr?.length || 0),
                    0
                  )
                : ""}
            </button>

            {/* read count */}
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              {m.readBy ? `${m.readBy.length} read` : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
