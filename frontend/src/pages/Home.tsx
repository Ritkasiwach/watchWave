import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';
import { Users, Video, ArrowRight, Tv2, Wifi, WifiOff } from 'lucide-react';

interface JoinAck {
  ok: boolean;
  roomId?: string;
  code?: string;
  message?: string;
}

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { socket, isConnected, roomData, leaveRoom } = useSocket();

  // Coming back to the home page (e.g. browser Back) means leaving any room we were in.
  useEffect(() => {
    if (roomData) leaveRoom();
    // Mount-only on purpose: re-running when roomData changes would leave the room we just created.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [createUsername, setCreateUsername] = useState('');
  const [joinUsername, setJoinUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');

  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);

  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');

  const handleCreate = () => {
    if (!createUsername.trim()) {
      setCreateError('Please enter a username.');
      return;
    }
    if (!socket || !isConnected) {
      setCreateError('Not connected to server. Please wait…');
      return;
    }
    setCreateError('');
    setCreateLoading(true);

    socket.emit('create_room', { username: createUsername.trim() }, (res: JoinAck) => {
      setCreateLoading(false);
      if (res?.ok && res.roomId) {
        navigate(`/room/${res.roomId}`);
      } else {
        setCreateError(res?.message || 'Could not create the room.');
      }
    });
  };

  const handleJoin = () => {
    if (!joinUsername.trim()) {
      setJoinError('Please enter a username.');
      return;
    }
    if (!roomCode.trim()) {
      setJoinError('Please enter a room code.');
      return;
    }
    if (!socket || !isConnected) {
      setJoinError('Not connected to server. Please wait…');
      return;
    }
    setJoinError('');
    setJoinLoading(true);

    socket.emit(
      'join_room',
      { roomId: roomCode.trim().toUpperCase(), username: joinUsername.trim() },
      (res: JoinAck) => {
        setJoinLoading(false);
        if (res?.ok && res.roomId) {
          navigate(`/room/${res.roomId}`);
        } else {
          setJoinError(res?.message || 'Could not join the room.');
        }
      }
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute', top: '-200px', left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '400px',
        background: 'radial-gradient(ellipse, rgba(229,25,58,0.12) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '48px', position: 'relative' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '12px',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          padding: '10px 20px', borderRadius: '100px', marginBottom: '24px'
        }}>
          <Tv2 size={18} color="var(--accent)" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            YouTube Watch Party
          </span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '11px', fontWeight: 600,
            color: isConnected ? 'var(--green)' : 'var(--accent)'
          }}>
            {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {isConnected ? 'Connected' : 'Connecting…'}
          </div>
        </div>

        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800,
          letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '16px'
        }}>
          Watch YouTube<br />
          <span style={{ color: 'var(--accent)' }}>Together</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px', lineHeight: 1.6, maxWidth: '420px' }}>
          Sync playback in real time. Host controls the room.<br />
          Moderators help. Participants watch.
        </p>
        <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span>Made with ❤️ by <strong>Ritika Siwach</strong></span>
          <span>|</span>
          <a href="https://github.com/Ritkasiwach" target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>GitHub</a>
          <span>|</span>
          <a href="https://www.linkedin.com/in/ritikasiwach0202" target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>LinkedIn</a>
        </div>
      </div>

      {/* Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))',
        gap: '24px', width: '100%', maxWidth: '760px', position: 'relative'
      }}>

        {/* Create */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Video size={18} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Create a Party</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>You'll be the Host</div>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Your Name</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. Alice"
              value={createUsername}
              onChange={e => setCreateUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              maxLength={20}
            />
            {createError && <div className="error-text">{createError}</div>}
          </div>

          <button
            className="btn btn-primary btn-lg"
            onClick={handleCreate}
            disabled={createLoading || !isConnected}
          >
            {createLoading ? <><div className="spinner" /> Creating…</> : <>Create Room <ArrowRight size={16} /></>}
          </button>
        </div>

        {/* Join */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Users size={18} color="#8b5cf6" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Join a Party</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Enter the room code</div>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Your Name</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. Bob"
              value={joinUsername}
              onChange={e => setJoinUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              maxLength={20}
            />
          </div>

          <div className="form-group">
            <label className="label">Room Code</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. ABC123"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              maxLength={6}
              style={{ fontFamily: 'monospace', letterSpacing: '0.15em', fontSize: '16px', textTransform: 'uppercase' }}
            />
            {joinError && <div className="error-text">{joinError}</div>}
          </div>

          <button
            className="btn btn-primary btn-lg"
            style={{ background: '#8b5cf6' }}
            onClick={handleJoin}
            disabled={joinLoading || !isConnected}
          >
            {joinLoading ? <><div className="spinner" /> Joining…</> : <>Join Room <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>

      <p style={{ marginTop: '32px', color: 'var(--text-muted)', fontSize: '12px' }}>
        No account required. Rooms exist in memory.
      </p>
    </div>
  );
};

export default Home;
