import { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Play,
  Square,
  Pause,
  AlertTriangle,
  Monitor,
  Mic,
  Hand,
  Search,
  Settings,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';

const DEFAULT_BACKEND_URL = 'http://localhost:8000';

export default function App() {
  const [backendUrl, setBackendUrl] = useState(() => {
    return localStorage.getItem('intentos_backend_url') || DEFAULT_BACKEND_URL;
  });
  const [showConfig, setShowConfig] = useState(false);
  const [inputUrl, setInputUrl] = useState(backendUrl);

  const [status, setStatus] = useState('stopped');
  const [connected, setConnected] = useState(false);
  const [lastGesture, setLastGesture] = useState('None');
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceState, setVoiceState] = useState('Idle');
  const [voiceHistory, setVoiceHistory] = useState<any[]>([]);
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [lastZoomAction, setLastZoomAction] = useState('None');

  const [ttsVoices, setTtsVoices] = useState<any[]>([]);
  const [ttsSelectedVoice, setTtsSelectedVoice] = useState('');
  const [ttsRate, setTtsRate] = useState(175);
  const [ttsVolume, setTtsVolume] = useState(1.0);
  const [ttsMuted, setTtsMuted] = useState(false);
  const [ttsStatus, setTtsStatus] = useState('Idle');
  const [ttsLastText, setTtsLastText] = useState('');

  const wsRef = useRef<WebSocket | null>(null);

  // Helper to construct WebSocket URL
  const getWsUrl = (httpUrl: string) => {
    const trimmed = httpUrl.replace(/\/+$/, '');
    if (trimmed.startsWith('https://')) {
      return trimmed.replace('https://', 'wss://') + '/ws/events';
    }
    return trimmed.replace('http://', 'ws://') + '/ws/events';
  };

  useEffect(() => {
    let active = true;

    const fetchStatus = () => {
      fetch(`${backendUrl}/api/status`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (!active) return;
          setConnected(true);
          setStatus(
            data.paused ? 'paused' :
            data.running ? 'running' : 'stopped'
          );
          if (data.voice_engine === 'ready') setVoiceListening(true);
          if (data.zoom_enabled !== undefined) {
            setZoomEnabled(data.zoom_enabled);
          }
        })
        .catch(() => {
          // If WS is also disconnected, mark connected as false
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            if (active) setConnected(false);
          }
        });
    };

    fetchStatus();
    const intervalId = window.setInterval(fetchStatus, 4000);

    // Fetch TTS voices
    fetch(`${backendUrl}/api/tts/voices`)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        setTtsVoices(data.voices || []);
        if (data.current_id) setTtsSelectedVoice(data.current_id);
      })
      .catch(() => {});

    // WebSocket connection
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(getWsUrl(backendUrl));
      wsRef.current = ws;

      ws.onopen = () => {
        if (active) setConnected(true);
      };

      ws.onmessage = event => {
        if (!active) return;
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'status_change') {
            setStatus(data.payload.status);
          }

          if (data.type === 'gesture') {
            setLastGesture(data.payload.name);
          }

          if (data.type === 'voice') {
            const item = {
              time: new Date().toLocaleTimeString(),
              text: data.payload.text,
              actions: data.payload.actions || [],
              reply: data.payload.reply,
              success: data.payload.success
            };
            setVoiceHistory(prev => [item, ...prev].slice(0, 5));
          }

          if (data.type === 'voice_status') {
            if (data.payload.listening !== undefined) {
              setVoiceListening(data.payload.listening);
            }
            if (data.payload.state !== undefined) {
              setVoiceState(data.payload.state);
            }
          }

          if (data.type === 'zoom_status') {
            if (data.payload.enabled !== undefined) {
              setZoomEnabled(data.payload.enabled);
            }
            if (data.payload.action && data.payload.action !== 'None') {
              setLastZoomAction(data.payload.action);
            }
          }

          if (data.type === 'tts_status') {
            if (data.payload.state) setTtsStatus(data.payload.state);
            if (data.payload.text) setTtsLastText(data.payload.text);
          }
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        if (active) {
          // If polling also failed, mark disconnected
        }
      };

      ws.onerror = () => {
        // WebSocket error
      };
    } catch (err) {
      console.warn('Could not connect WebSocket to', backendUrl, err);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        fetch(`${backendUrl}/api/control/stop`, { method: 'POST' }).catch(() => {});
        setStatus('stopped');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      if (ws) {
        ws.close();
      }
      wsRef.current = null;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [backendUrl]);

  const handleAction = async (action: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/control/${action}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error(`Control request failed: ${res.status}`);
      // Optimistic update
      if (action === 'start') setStatus('running');
      if (action === 'pause') setStatus('paused');
      if (action === 'resume') setStatus('running');
      if (action === 'stop') setStatus('stopped');
      if (action === 'zoom_enable') setZoomEnabled(true);
      if (action === 'zoom_disable') setZoomEnabled(false);
    } catch (error) {
      console.error(error);
      // Even if offline, update UI for testing/feedback
      if (action === 'stop') setStatus('stopped');
    }
  };

  const updateTtsSettings = (settings: Record<string, unknown>) => {
    fetch(`${backendUrl}/api/tts/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    }).catch(console.error);
  };

  const handleSaveBackendUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputUrl.trim().replace(/\/+$/, '');
    if (clean) {
      setBackendUrl(clean);
      localStorage.setItem('intentos_backend_url', clean);
      setShowConfig(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      {/* Header */}
      <header className="sticky top-0 z-50 mb-8 flex flex-col md:flex-row justify-between items-center bg-gray-950/90 backdrop-blur p-4 border-b border-gray-800">
        <div className="mb-4 md:mb-0">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            IntentOS
          </h1>
          <p className="text-gray-400 text-sm">
            Interact Naturally. Control Intelligently.
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* Backend Connection Status & Switcher */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm transition-colors"
            title="Click to configure backend URL"
          >
            <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-gray-300">
              {connected ? 'Backend Connected' : 'Backend Disconnected'}
            </span>
            <Settings size={14} className="text-gray-400 ml-1" />
          </button>

          <button
            onClick={() => handleAction('stop')}
            className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg uppercase tracking-wider transition-colors shadow-lg shadow-red-900/20"
            title="Emergency Stop (Esc)"
          >
            <AlertTriangle size={20} />
            STOP
          </button>
        </div>
      </header>

      {/* Backend URL Configuration Modal / Banner */}
      {showConfig && (
        <div className="mb-8 p-4 bg-gray-900 border border-blue-500/50 rounded-xl shadow-xl">
          <form onSubmit={handleSaveBackendUrl} className="flex flex-col md:flex-row items-center gap-3">
            <div className="flex-1 w-full">
              <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
                Backend Server URL
              </label>
              <input
                type="text"
                value={inputUrl}
                onChange={e => setInputUrl(e.target.value)}
                placeholder="http://localhost:8000 or http://192.168.1.X:8000"
                className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-5">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded text-sm transition-colors"
              >
                Save & Connect
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputUrl(DEFAULT_BACKEND_URL);
                  setBackendUrl(DEFAULT_BACKEND_URL);
                  localStorage.removeItem('intentos_backend_url');
                  setShowConfig(false);
                }}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors"
              >
                Reset Default
              </button>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors"
              >
                Close
              </button>
            </div>
          </form>
          <p className="text-xs text-gray-400 mt-2">
            Default is <code className="text-blue-400">http://localhost:8000</code>. If controlling another PC over LAN or tunnel, enter its IP/URL here.
          </p>
        </div>
      )}

      {/* Disconnected Assistant Helper Notice */}
      {!connected && !showConfig && (
        <div className="mb-6 p-4 rounded-xl border border-blue-900/40 bg-blue-950/20 flex flex-col md:flex-row justify-between items-center gap-3 text-sm">
          <div className="flex items-center gap-3 text-blue-300">
            <WifiOff size={20} className="text-blue-400 shrink-0" />
            <span>
              Targeting <strong className="text-white">{backendUrl}</strong>. If backend is not started, launch it locally with <code className="bg-gray-900 px-1.5 py-0.5 rounded text-blue-200">uvicorn main:app --reload</code>.
            </span>
          </div>
          <button
            onClick={() => setShowConfig(true)}
            className="text-xs bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 px-3 py-1.5 rounded-lg border border-blue-500/30 font-medium transition-colors shrink-0"
          >
            Change Backend URL
          </button>
        </div>
      )}

      {/* Webcam Feed */}
      {(status === 'running' || status === 'paused') && (
        <div className="mb-8 bg-gray-900 p-4 rounded-xl border border-gray-800 flex flex-col items-center justify-center">
          <img
            src={`${backendUrl}/api/video_feed`}
            alt="Webcam Feed"
            className="rounded-lg shadow-lg max-h-96 object-cover"
            onError={e => {
              // Hide image or show fallback if video stream cannot be reached
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Grid: Gestures, Zoom, System */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Gestures Card */}
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Hand size={20} /> Gestures
            </h2>
            <span className="text-blue-400 text-sm">Active</span>
          </div>
          <p className="text-3xl font-mono">{lastGesture}</p>
        </div>

        {/* Zoom Card */}
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Search size={20} /> Zoom
            </h2>
            <span className={`text-sm ${zoomEnabled ? 'text-green-400' : 'text-gray-500'}`}>
              {zoomEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xl font-mono truncate">{lastZoomAction}</p>
            <button
              onClick={() => handleAction(zoomEnabled ? 'zoom_disable' : 'zoom_enable')}
              className={`py-1 px-3 mt-2 rounded text-sm font-semibold transition-colors ${
                zoomEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {zoomEnabled ? 'Disable Zoom' : 'Enable Zoom'}
            </button>
          </div>
        </div>

        {/* System Card */}
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Monitor size={20} /> System
            </h2>
            <span className={`text-sm ${status === 'running' ? 'text-green-400' : 'text-yellow-400'}`}>
              {status.toUpperCase()}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleAction(status === 'paused' ? 'resume' : 'start')}
              className="p-2 bg-green-600 hover:bg-green-700 rounded transition-colors"
              title={status === 'paused' ? 'Resume' : 'Start'}
            >
              <Play size={20} />
            </button>
            <button
              onClick={() => handleAction('pause')}
              className="p-2 bg-yellow-600 hover:bg-yellow-700 rounded transition-colors"
              title="Pause"
            >
              <Pause size={20} />
            </button>
            <button
              onClick={() => handleAction('stop')}
              className="p-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
              title="Stop"
            >
              <Square size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Voice Control Panel */}
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Mic className={voiceListening ? 'text-purple-400 animate-pulse' : 'text-gray-500'} />
            Voice Control
          </h2>
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
            voiceState === 'listening' ? 'bg-purple-900/50 text-purple-400' :
            voiceState === 'processing' ? 'bg-blue-900/50 text-blue-400' :
            voiceState === 'executing' ? 'bg-green-900/50 text-green-400' :
            voiceState === 'failed' ? 'bg-red-900/50 text-red-400' :
            'bg-gray-800 text-gray-400'
          }`}>
            {voiceState}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* History */}
          <div className="bg-gray-950 rounded-lg p-4 h-64 overflow-y-auto border border-gray-800">
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              Command History
            </h3>
            {voiceHistory.length === 0 ? (
              <p className="text-gray-600 italic">No commands recognized yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {voiceHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-md border ${
                      item.success ? 'bg-green-900/10 border-green-900/30' : 'bg-red-900/10 border-red-900/30'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-medium text-gray-200">"{item.text}"</p>
                      <span className="text-xs text-gray-500">{item.time}</span>
                    </div>
                    {item.reply && (
                      <p className="text-xs text-blue-300 italic mb-1">
                        Assistant: "{item.reply}"
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {item.actions && item.actions.map((act: any, i: number) => (
                        <div key={i} className="flex gap-2 items-center bg-gray-900/50 px-2 py-1 rounded border border-gray-800">
                          <span className={`text-xs ${item.success ? 'text-green-300' : 'text-red-300'}`}>
                            {act.intent}
                          </span>
                          {act.params && Object.keys(act.params).length > 0 && (
                            <span className="text-xs text-gray-500 font-mono">
                              {JSON.stringify(act.params)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Reference */}
          <div className="flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
                Supported Commands
              </h3>
              <ul className="text-sm text-gray-300 space-y-2 mb-4">
                <li>• <span className="text-blue-400">Browser:</span> "Open Google and search birds", "Close tab"</li>
                <li>• <span className="text-blue-400">Mouse:</span> "Move cursor up", "Scroll down", "Double click"</li>
                <li>• <span className="text-blue-400">Keyboard:</span> "Type hello", "Press Enter", "Copy", "Paste"</li>
                <li>• <span className="text-blue-400">Windows:</span> "Maximize window", "Switch window"</li>
                <li>• <span className="text-blue-400">System:</span> "Pause control", "Enable zoom"</li>
              </ul>
            </div>

            <div className="bg-gray-800/50 p-4 rounded-lg flex justify-between items-center border border-gray-700/50">
              <span className="text-sm font-medium text-gray-300">
                {voiceListening ? 'Microphone is active' : 'Microphone is off'}
              </span>
              <button
                onClick={() => handleAction('stop')}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-semibold rounded transition-colors text-sm"
              >
                Force Stop
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Assistant / TTS Panel */}
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Play className={ttsStatus === 'speaking' ? 'text-green-400 animate-pulse' : 'text-gray-500'} />
            Assistant Voice
          </h2>
          <div className="flex items-center gap-4">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
              ttsStatus === 'speaking' ? 'bg-green-900/50 text-green-400' :
              ttsStatus === 'queued' ? 'bg-blue-900/50 text-blue-400' :
              ttsStatus === 'error' ? 'bg-red-900/50 text-red-400' :
              'bg-gray-800 text-gray-400'
            }`}>
              {ttsStatus}
            </span>
            <button
              onClick={() => {
                const newMuted = !ttsMuted;
                setTtsMuted(newMuted);
                updateTtsSettings({ muted: newMuted });
              }}
              className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                ttsMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {ttsMuted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-1">
                Voice Selection
              </label>
              <select
                className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-gray-200"
                value={ttsSelectedVoice}
                onChange={e => {
                  setTtsSelectedVoice(e.target.value);
                  updateTtsSettings({ voice_id: e.target.value });
                }}
              >
                {ttsVoices.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-1">
                Speed ({ttsRate})
              </label>
              <input
                type="range"
                min="50"
                max="300"
                step="10"
                value={ttsRate}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  setTtsRate(val);
                  updateTtsSettings({ rate: val });
                }}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-1">
                Volume ({Math.round(ttsVolume * 100)}%)
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={ttsVolume}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setTtsVolume(val);
                  updateTtsSettings({ volume: val });
                }}
                className="w-full"
              />
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  fetch(`${backendUrl}/api/tts/speak`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: 'Hello, this is a voice test from IntentOS.' })
                  }).catch(console.error);
                }}
                className="flex-1 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 font-semibold rounded transition-colors text-sm"
              >
                Test Voice
              </button>
              <button
                onClick={() => {
                  fetch(`${backendUrl}/api/tts/stop`, { method: 'POST' }).catch(console.error);
                }}
                className="flex-1 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-semibold rounded transition-colors text-sm"
              >
                Stop Speaking
              </button>
            </div>
          </div>

          <div className="bg-gray-950 rounded-lg p-4 border border-gray-800 flex flex-col">
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              Assistant Says:
            </h3>
            <p className="text-xl font-medium text-gray-200 italic flex-1 whitespace-pre-wrap">
              {ttsLastText || 'Waiting for interaction...'}
            </p>
          </div>
        </div>
      </div>

      {/* Emergency Stop Bottom Card */}
      <div className="bg-gray-900 p-6 rounded-xl border border-red-900/50">
        <h2 className="text-xl font-bold text-red-500 flex items-center gap-2 mb-4">
          <AlertTriangle /> Emergency Stop
        </h2>
        <button
          onClick={() => handleAction('stop')}
          className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-lg text-xl font-bold uppercase tracking-wider transition-colors"
        >
          STOP ALL CONTROLS
        </button>
      </div>
    </div>
  );
}
