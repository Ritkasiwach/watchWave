import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { Send, MessageSquare } from 'lucide-react';

const ChatPanel: React.FC = () => {
  const { chatMessages, sendChat, socket } = useSocket();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendChat(inputText);
      setInputText('');
    }
  };

  const getRoleColor = (role: string) => {
    if (role === 'Host') return '#fbbf24';
    if (role === 'Moderator') return '#c4b5fd';
    return 'var(--text-secondary)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-secondary)' }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)'
      }}>
        <MessageSquare size={14} color="var(--text-secondary)" />
        <span style={{ fontWeight: 700, fontSize: '13px' }}>Room Chat</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {chatMessages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', marginTop: '20px' }}>
            No messages yet. Say hi!
          </div>
        ) : (
          chatMessages.map(msg => {
            const isSelf = msg.userId === socket?.id;
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isSelf ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px', display: 'flex', gap: '6px' }}>
                  {!isSelf && <span style={{ color: getRoleColor(msg.role), fontWeight: 600 }}>{msg.username}</span>}
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {isSelf && <span style={{ color: getRoleColor(msg.role), fontWeight: 600 }}>You</span>}
                </div>
                <div style={{
                  background: isSelf ? 'var(--accent)' : 'var(--bg-card)',
                  color: isSelf ? '#fff' : 'var(--text-primary)',
                  padding: '8px 12px',
                  borderRadius: isSelf ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  fontSize: '13px',
                  maxWidth: '90%',
                  wordBreak: 'break-word',
                  border: isSelf ? 'none' : '1px solid var(--border)'
                }}>
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '12px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder="Type a message..."
          style={{
            flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-primary)',
            fontSize: '13px', outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          style={{
            background: inputText.trim() ? 'var(--accent)' : 'var(--bg-hover)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: inputText.trim() ? 'pointer' : 'not-allowed', color: '#fff',
            transition: 'background 0.2s'
          }}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;
