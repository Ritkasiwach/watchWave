import React, { useEffect, useMemo, useRef, useState } from 'react';
import YouTube from 'react-youtube';
import type { YouTubeProps, YouTubePlayer as Player } from 'react-youtube';
import { useSocket } from '../contexts/SocketContext';
import { extractVideoId, formatTime, describeRequest } from '../utils/video';
import { Play, Pause, SkipForward, Hourglass, Subtitles, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';

// Ignore tiny differences so remote events don't cause audible stutter.
const DRIFT_TOLERANCE_SECONDS = 0.75;

const YouTubePlayer: React.FC = () => {
  const { socket, roomData, playback, requests } = useSocket();
  const playerRef = useRef<Player | null>(null);
  const playbackRef = useRef(playback);
  // Which video the embedded player currently has loaded/cued
  const loadedVideoRef = useRef(playback.videoId);
  const [videoId, setVideoId] = useState(playback.videoId);

  const [inputUrl, setInputUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubbing = useRef(false);

  const [captionsOn, setCaptionsOn] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const currentUser = roomData?.participants.find(p => p.id === socket?.id);
  const canControl = currentUser?.role === 'Host' || currentUser?.role === 'Moderator';
  const myPending = requests.filter(r => r.userId === socket?.id);

  /** Make the embedded player match the server-authoritative state. */
  const applyPlayback = () => {
    const player = playerRef.current;
    const pb = playbackRef.current;
    if (!player || loadedVideoRef.current !== pb.videoId) return;

    const target =
      pb.playState === 'playing' ? pb.currentTime + (Date.now() - pb.receivedAt) / 1000 : pb.currentTime;
    const current = player.getCurrentTime?.() ?? 0;
    if (Math.abs(current - target) > DRIFT_TOLERANCE_SECONDS) {
      player.seekTo(target, true);
    }
    if (pb.playState === 'playing') player.playVideo();
    else player.pauseVideo();
  };

  // Keep the ref current before the sync effect below runs (effects run in order).
  useEffect(() => {
    playbackRef.current = playback;
  });

  // React to every server playback event (play / pause / seek / change_video / sync_state).
  useEffect(() => {
    if (playback.videoId !== loadedVideoRef.current) {
      // New video: react-youtube cues it (paused at 0), which matches the server state.
      loadedVideoRef.current = playback.videoId;
      setVideoId(playback.videoId);
      setDuration(0);
      setCurrentTime(0);
      return;
    }
    applyPlayback();
    // applyPlayback only reads refs, so it is intentionally not a dependency.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.seq, playback.videoId]);

  // Poll the player for the progress bar
  useEffect(() => {
    const interval = setInterval(() => {
      const p = playerRef.current;
      if (!p || scrubbing.current) return;
      setCurrentTime(p.getCurrentTime?.() || 0);
      const d = p.getDuration?.() || 0;
      setDuration(prev => (prev !== d ? d : prev));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const opts = useMemo<YouTubeProps['opts']>(
    () => ({
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        controls: 0, // playback is driven only by the room's shared controls
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
    }),
    []
  );

  const onReady: YouTubeProps['onReady'] = event => {
    playerRef.current = event.target;
    setDuration(event.target.getDuration());
    if (captionsOn) {
      (event.target as any).loadModule('captions');
      (event.target as any).setOption('captions', 'track', {});
    }
    applyPlayback();
  };

  const onError: YouTubeProps['onError'] = () => {
    toast.error('This video cannot be played (it may be private or not embeddable).', { duration: 4000 });
  };

  // ---- Actions: Host/Moderator act directly, Participants send a request ----

  const doPlay = () => {
    if (!socket) return;
    if (canControl) socket.emit('play', { time: playerRef.current?.getCurrentTime() ?? playback.currentTime });
    else socket.emit('request_action', { type: 'play' });
  };

  const doPause = () => {
    if (!socket) return;
    if (canControl) socket.emit('pause', { time: playerRef.current?.getCurrentTime() ?? playback.currentTime });
    else socket.emit('request_action', { type: 'pause' });
  };

  const commitSeek = () => {
    const time = scrubTime;
    scrubbing.current = false;
    setScrubTime(null);
    if (time === null || !socket) return;
    if (canControl) socket.emit('seek', { time });
    else socket.emit('request_action', { type: 'seek', time });
  };

  const doChangeVideo = () => {
    const id = extractVideoId(inputUrl);
    if (!id) {
      setUrlError('Invalid YouTube URL. Try: https://youtube.com/watch?v=...');
      return;
    }
    if (!socket) return;
    setUrlError('');
    if (canControl) socket.emit('change_video', { videoId: id });
    else socket.emit('request_action', { type: 'change_video', videoId: id });
    setInputUrl('');
  };

  const toggleCaptions = () => {
    const p = playerRef.current as any;
    if (!p) return;
    if (captionsOn) {
      p.unloadModule('captions');
      setCaptionsOn(false);
    } else {
      p.loadModule('captions');
      p.setOption('captions', 'track', {});
      setCaptionsOn(true);
    }
  };

  const doSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
      const res = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (res.ok) {
        setSearchResults(data.results || []);
      } else {
        toast.error(data.error || 'Search failed');
      }
    } catch (err) {
      toast.error('Search error');
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (id: string) => {
    if (!socket) return;
    if (canControl) socket.emit('change_video', { videoId: id });
    else socket.emit('request_action', { type: 'change_video', videoId: id });
    setShowSearch(false);
  };

  const shownTime = scrubTime ?? currentTime;
  const progress = duration > 0 ? Math.min(100, (shownTime / duration) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Player Container */}
      <div style={{
        position: 'relative',
        paddingBottom: '56.25%', // 16:9
        background: '#000',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        boxShadow: '0 0 40px rgba(0,0,0,0.5)'
      }}>
        <YouTube
          videoId={videoId}
          opts={opts}
          onReady={onReady}
          onError={onError}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        />
        {/* Nobody clicks the raw player: all control goes through the shared, permission-checked controls */}
        <div className="player-overlay" style={{ cursor: 'default' }} />
      </div>

      {/* Controls */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        {!canControl && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Hourglass size={13} />
            You're a Participant — changes are sent as requests for the Host or a Moderator to approve.
          </div>
        )}

        {/* Seek bar + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '36px', textAlign: 'right' }}>
            {formatTime(shownTime)}
          </span>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{
              position: 'absolute', top: '50%', left: 0, transform: 'translateY(-50%)',
              height: '4px', width: `${progress}%`, background: 'var(--accent)',
              borderRadius: '2px', pointerEvents: 'none', zIndex: 0
            }} />
            <input
              type="range"
              aria-label={canControl ? 'Seek' : 'Request seek'}
              min="0"
              max={duration || 100}
              step="0.5"
              value={shownTime}
              onPointerDown={() => { scrubbing.current = true; }}
              onChange={e => { scrubbing.current = true; setScrubTime(parseFloat(e.target.value)); }}
              onPointerUp={commitSeek}
              onKeyUp={commitSeek}
              onBlur={() => { if (scrubbing.current) commitSeek(); }}
              style={{ width: '100%', position: 'relative', zIndex: 1 }}
            />
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '36px' }}>
            {formatTime(duration)}
          </span>
        </div>

        {/* Play/Pause */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={doPlay} style={{ gap: '6px' }}>
            <Play size={14} fill="currentColor" />
            {canControl ? 'Play' : 'Request Play'}
          </button>
          <button className="btn btn-secondary" onClick={doPause} style={{ gap: '6px' }}>
            <Pause size={14} fill="currentColor" />
            {canControl ? 'Pause' : 'Request Pause'}
          </button>
          <button 
            className={`btn ${captionsOn ? 'btn-primary' : 'btn-secondary'}`} 
            onClick={toggleCaptions} 
            style={{ gap: '6px', padding: '0 12px' }}
            title="Toggle YouTube Captions"
          >
            <Subtitles size={14} />
            CC {captionsOn ? 'ON' : 'OFF'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
            {playback.playState === 'playing' ? '▶ Playing' : '⏸ Paused'}
          </span>
        </div>

        {/* Change Video */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowSearch(!showSearch)}
              style={{ padding: '0 10px' }}
              title="Search YouTube"
            >
              <Search size={16} />
            </button>
            <input
              className="input"
              type="text"
              placeholder="Paste YouTube URL…"
              value={inputUrl}
              onChange={e => { setInputUrl(e.target.value); setUrlError(''); }}
              onKeyDown={e => e.key === 'Enter' && doChangeVideo()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" onClick={doChangeVideo} style={{ gap: '6px', whiteSpace: 'nowrap' }}>
              <SkipForward size={14} />
              {canControl ? 'Change' : 'Request'}
            </button>
          </div>
          {urlError && <div className="error-text">{urlError}</div>}
          
          {/* Search Panel */}
          {showSearch && (
            <div style={{
              width: '100%',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginTop: '4px'
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="input"
                  type="text"
                  placeholder="Search YouTube..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch()}
                  style={{ flex: 1, fontSize: '13px' }}
                  autoFocus
                />
                <button className="btn btn-primary" onClick={doSearch} disabled={isSearching} style={{ fontSize: '13px', padding: '0 16px' }}>
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
                <button className="btn btn-ghost" onClick={() => setShowSearch(false)} style={{ padding: '0 8px' }}>
                  <X size={16} />
                </button>
              </div>
              
              {searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                  {searchResults.map((res, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: '12px', padding: '8px', 
                      background: 'var(--bg-card)', borderRadius: '6px',
                      alignItems: 'center', border: '1px solid var(--border-subtle)'
                    }}>
                      <img src={res.thumbnail} alt={res.title} style={{ width: '100px', height: '56px', objectFit: 'cover', borderRadius: '4px' }} />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {res.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{res.channelTitle}</div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => selectSearchResult(res.videoId)}>
                        {canControl ? 'Play' : 'Request'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* A participant's own pending requests */}
        {!canControl && myPending.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {myPending.map(r => (
              <div key={r.id} style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Hourglass size={11} /> Waiting for approval to {describeRequest(r)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default YouTubePlayer;
