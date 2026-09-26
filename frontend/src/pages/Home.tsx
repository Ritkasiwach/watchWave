import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../contexts/SocketContext';


interface JoinAck {
  ok: boolean;
  roomId?: string;
  code?: string;
  message?: string;
}

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { socket, isConnected, roomData, leaveRoom } = useSocket();

  // make sure we leave any existing room when landing on the home page
  useEffect(() => {
    if (roomData) leaveRoom();
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
    if (!createUsername.trim()) return setCreateError('Please enter a username.');
    if (!socket || !isConnected) return setCreateError('Not connected to server.');
    setCreateError('');
    setCreateLoading(true);
    socket.emit('create_room', { username: createUsername.trim() }, (res: JoinAck) => {
      setCreateLoading(false);
      if (res?.ok && res.roomId) navigate(`/room/${res.roomId}`);
      else setCreateError(res?.message || 'Could not create the room.');
    });
  };

  const handleJoin = () => {
    if (!joinUsername.trim()) return setJoinError('Please enter a username.');
    if (!roomCode.trim()) return setJoinError('Please enter a room code.');
    if (!socket || !isConnected) return setJoinError('Not connected to server.');
    setJoinError('');
    setJoinLoading(true);
    socket.emit('join_room', { roomId: roomCode.trim().toUpperCase(), username: joinUsername.trim() }, (res: JoinAck) => {
      setJoinLoading(false);
      if (res?.ok && res.roomId) navigate(`/room/${res.roomId}`);
      else setJoinError(res?.message || 'Room does not exist.');
    });
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
      {/* Top Navigation */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/favicon.png" alt="WatchWave" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>WatchWave</span>
        </div>

        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: '12px',
          background: 'transparent', border: '1px solid var(--border)',
          padding: '8px 16px', borderRadius: '100px'
        }}>
          <img src="/favicon.png" alt="Icon" style={{ width: '16px', height: '16px' }} />
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            YouTube Watch Party
          </span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', fontWeight: 500,
            color: isConnected ? 'var(--green)' : 'var(--accent)'
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isConnected ? 'var(--green)' : 'var(--accent)' }} />
            {isConnected ? 'Connected' : 'Connecting…'}
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '48px', position: 'relative', marginTop: '60px' }}>
        <h1 style={{
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', fontWeight: 800,
          letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '16px'
        }}>
          Different places<br />
          <span style={{ color: 'var(--accent)' }}>One shared moment</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px', lineHeight: 1.6, maxWidth: '420px', margin: '0 auto' }}>
          Sync playback in real time. Host controls the room.<br />
          Moderators help. Participants watch.
        </p>
        <div style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
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
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', overflow: 'hidden' }}>
          {/* Wave Background Graphic */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '150px',
            background: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 1440 320\'%3E%3Cpath fill=\'%23112240\' fill-opacity=\'0.5\' d=\'M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,160C672,160,768,192,864,197.3C960,203,1056,181,1152,149.3C1248,117,1344,75,1392,53.3L1440,32L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z\'%3E%3C/path%3E%3C/svg%3E") no-repeat bottom',
            backgroundSize: 'cover', zIndex: 0, pointerEvents: 'none'
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative', zIndex: 1 }}>
            <img src="/favicon.png" alt="Wave" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '18px' }}>Create a Party</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>You'll be the Host</div>
            </div>
          </div>

          <div className="form-group" style={{ position: 'relative', zIndex: 1, flex: 1, justifyContent: 'center' }}>
            <label className="label">YOUR NAME</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. ritika"
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
            style={{ position: 'relative', zIndex: 1, marginTop: 'auto' }}
          >
            {createLoading ? <><div className="spinner" /> Creating…</> : <>Create Room &rarr;</>}
          </button>
        </div>

        {/* Join */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', overflow: 'hidden' }}>
          {/* Wave Background Graphic */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '150px',
            background: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 1440 320\'%3E%3Cpath fill=\'%23112240\' fill-opacity=\'0.5\' d=\'M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,160C672,160,768,192,864,197.3C960,203,1056,181,1152,149.3C1248,117,1344,75,1392,53.3L1440,32L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z\'%3E%3C/path%3E%3C/svg%3E") no-repeat bottom',
            backgroundSize: 'cover', zIndex: 0, pointerEvents: 'none', transform: 'scaleX(-1)'
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative', zIndex: 1 }}>
            <img src="/favicon.png" alt="Wave" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '18px' }}>Join a Party</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Enter the room code</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', zIndex: 1, flex: 1, justifyContent: 'center' }}>
            <div className="form-group">
              <label className="label">YOUR NAME</label>
              <input
                className="input"
                type="text"
                placeholder="e.g. Ankit"
                value={joinUsername}
                onChange={e => setJoinUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                maxLength={20}
              />
            </div>

            <div className="form-group">
              <label className="label">ROOM CODE</label>
              <input
                className="input"
                type="text"
                placeholder="E.G. ABC123"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                maxLength={6}
                style={{ fontFamily: 'monospace', letterSpacing: '0.15em', fontSize: '16px', textTransform: 'uppercase' }}
              />
              {joinError && <div className="error-text" style={{ color: '#d10a0a' }}>{joinError}</div>}
            </div>
          </div>

          <button
            className="btn btn-lg"
            style={{ position: 'relative', zIndex: 1, marginTop: 'auto', background: '#ffffff', color: 'var(--accent)', fontWeight: 700 }}
            onClick={handleJoin}
            disabled={joinLoading || !isConnected}
          >
            {joinLoading ? <><div className="spinner" style={{ borderTopColor: 'var(--accent)' }} /> Joining…</> : <>Join Room &rarr;</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home;
