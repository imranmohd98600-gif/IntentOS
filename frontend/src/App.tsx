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
  WifiOff,
  Volume2,
  VolumeX,
  CheckCircle2
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

  const [toast, setToast] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.clearTimeout((window as any)._toastTimeout);
    (window as any)._toastTimeout = window.setTimeout(() => {
      setToast(null);
    }, 2500);
  };

  // Helper to construct WebSocket URL
  const getWsUrl = (httpUrl: string) => {
    const trimmed = httpUrl.replace(/\/+$/, '');
    if (trimmed.startsWith('https://')) {
      return trimmed.replace('https://', 'wss://') + '/ws/events';
    }
    return trimmed.replace('http://', 'ws://') + '/ws/events';
  };

  // Populate browser voices if available
  useEffect(() => {
    if ('speechSynthesis' in window) {
      const loadSysVoices = () => {
        const v = window.speechSynthesis.getVoices();
        if (v.length > 0 && ttsVoices.length === 0) {
          setTtsVoices(v.map(voice => ({ id: voice.name, name: voice.name })));
          if (!ttsSelectedVoice) setTtsSelectedVoice(v[0].name);
        }
      };
      loadSysVoices();
      window.speechSynthesis.onvoiceschanged = loadSysVoices;
    }
  }, [ttsVoices.length, ttsSelectedVoice]);

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
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            if (active) setConnected(false);
          }
        });
    };

    fetchStatus();
    const intervalId = window.setInterval(fetchStatus, 3000);

    // Fetch TTS voices from backend
    fetch(`${backendUrl}/api/tts/voices`)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        if (data.voices && data.voices.length > 0) {
          setTtsVoices(data.voices);
          if (data.current_id) setTtsSelectedVoice(data.current_id);
        }
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
          if (data.type === 'status_change') setStatus(data.payload.status);
          if (data.type === 'gesture') setLastGesture(data.payload.name);
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
            if (data.payload.listening !== undefined) setVoiceListening(data.payload.listening);
            if (data.payload.state !== undefined) setVoiceState(data.payload.state);
          }
          if (data.type === 'zoom_status') {
            if (data.payload.enabled !== undefined) setZoomEnabled(data.payload.enabled);
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
        // WS closed
      };
    } catch (_) {}

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleAction('stop');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      if (ws) ws.close();
      wsRef.current = null;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [backendUrl]);

  // Execute controls immediately (optimistic update) and forward to backend
  const handleAction = async (action: string) => {
    // 1. Instant optimistic UI state update
    if (action === 'start') {
      setStatus('running');
      setVoiceListening(true);
      setVoiceState('listening');
      showToast('System Started (Live Control Active)');
    } else if (action === 'pause') {
      setStatus('paused');
      setVoiceState('Idle');
      showToast('System Paused');
    } else if (action === 'resume') {
      setStatus('running');
      setVoiceListening(true);
      setVoiceState('listening');
      showToast('System Resumed');
    } else if (action === 'stop') {
      setStatus('stopped');
      setVoiceListening(false);
      setVoiceState('Idle');
      setLastGesture('None');
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setTtsStatus('Idle');
      showToast('Emergency Stop Triggered');
    } else if (action === 'zoom_enable') {
      setZoomEnabled(true);
      showToast('Gesture Zoom Enabled');
    } else if (action === 'zoom_disable') {
      setZoomEnabled(false);
      showToast('Gesture Zoom Disabled');
    }

    // 2. Transmit to backend
    try {
      await fetch(`${backendUrl}/api/control/${action}`, { method: 'POST' });
    } catch (err) {
      console.warn(`Backend call for ${action} deferred:`, err);
    }
  };

  const handleTestVoice = () => {
    const text = 'Hello, this is a voice test from IntentOS.';
    setTtsStatus('speaking');
    setTtsLastText(text);
    showToast('Testing Voice Speech...');

    // Play immediately via browser audio
    if ('speechSynthesis' in window && !ttsMuted) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.max(0.5, Math.min(2.0, ttsRate / 175));
      utterance.volume = ttsVolume;
      utterance.onend = () => setTtsStatus('Idle');
      utterance.onerror = () => setTtsStatus('Idle');
      window.speechSynthesis.speak(utterance);
    }

    // Forward to backend
    fetch(`${backendUrl}/api/tts/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }).catch(() => {});
  };

  const handleStopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setTtsStatus('Idle');
    showToast('Voice Output Stopped');
    fetch(`${backendUrl}/api/tts/stop`, { method: 'POST' }).catch(() => {});
  };

  const handleToggleMute = () => {
    const next = !ttsMuted;
    setTtsMuted(next);
    showToast(next ? 'Assistant Muted' : 'Assistant Unmuted');
    fetch(`${backendUrl}/api/tts/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muted: next })
    }).catch(() => {});
  };

  const handleSaveBackendUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputUrl.trim().replace(/\/+$/, '');
    if (clean) {
      setBackendUrl(clean);
      localStorage.setItem('intentos_backend_url', clean);
      setShowConfig(false);
      showToast(`Backend set to: ${clean}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8 relative">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-blue-600 border border-blue-400 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 size={18} className="text-blue-200" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 mb-8 flex flex-col md:flex-row justify-between items-center bg-gray-950/90 backdrop-blur p-4 border-b border-gray-800 rounded-xl">
        <div className="mb-4 md:mb-0">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            IntentOS
          </h1>
          <p className="text-gray-400 text-sm">
            AI-Powered Hand Gesture and Voice-Based PC Control
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Backend Connection Status */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm transition-colors cursor-pointer"
            title="Click to configure backend URL"
          >
            <div className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-gray-300 text-xs md:text-sm">
              {connected ? 'Backend Connected' : 'Backend Offline'}
            </span>
            <Settings size={14} className="text-gray-400 ml-1" />
          </button>

          {/* Emergency Stop Header Button */}
          <button
            onClick={() => handleAction('stop')}
            className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-lg uppercase tracking-wider transition-all shadow-lg shadow-red-900/30 text-sm cursor-pointer"
            title="Emergency Stop (Esc)"
          >
            <AlertTriangle size={18} />
            STOP
          </button>
        </div>
      </header>

      {/* Backend URL Configuration Modal */}
      {showConfig && (
        <div className="mb-8 p-5 bg-gray-900 border border-blue-500/50 rounded-xl shadow-xl">
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Settings size={16} className="text-blue-400" />
            Backend Connection Settings
          </h3>
          <form onSubmit={handleSaveBackendUrl} className="flex flex-col md:flex-row items-center gap-3">
            <div className="flex-1 w-full">
              <input
                type="text"
                value={inputUrl}
                onChange={e => setInputUrl(e.target.value)}
                placeholder="http://localhost:8000 or https://xyz.loca.lt"
                className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded text-sm transition-colors cursor-pointer"
              >
                Connect
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputUrl(DEFAULT_BACKEND_URL);
                  setBackendUrl(DEFAULT_BACKEND_URL);
                  localStorage.removeItem('intentos_backend_url');
                  setShowConfig(false);
                  showToast('Reset to default: http://localhost:8000');
                }}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors cursor-pointer"
              >
                Reset Default
              </button>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </form>
          <div className="mt-3 p-3 bg-gray-950/60 rounded-lg text-xs text-gray-400 space-y-1">
            <p>• <strong>Local machine:</strong> <code className="text-blue-400">http://localhost:8000</code></p>
            <p>• <strong>To connect across computers:</strong> run <code className="text-blue-400">npx localtunnel --port 8000</code> in terminal and paste the https URL here.</p>
          </div>
        </div>
      )}

      {/* Webcam Feed Section */}
      {(status === 'running' || status === 'paused') && (
        <div className="mb-8 bg-gray-900 p-4 rounded-xl border border-gray-800 flex flex-col items-center justify-center">
          <img
            src={`${backendUrl}/api/video_feed`}
            alt="MediaPipe Webcam Feed"
            className="rounded-lg shadow-lg max-h-96 object-cover border border-gray-700"
            onError={e => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <p className="text-xs text-gray-400 mt-2">
            Live OpenCV + MediaPipe hand tracking stream with landmark skeleton overlay.
          </p>
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
            <span className={`text-sm ${status === 'running' ? 'text-green-400 font-bold' : 'text-gray-400'}`}>
              {status === 'running' ? 'Active' : 'Standby'}
            </span>
          </div>
          <p className="text-3xl font-mono text-blue-400">{lastGesture}</p>
          <p className="text-xs text-gray-400 mt-2">
            Index Extended: Move cursor | Pinch: Click | Two Fingers: Scroll
          </p>
        </div>

        {/* Zoom Card */}
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Search size={20} /> Zoom Control
            </h2>
            <span className={`text-sm font-semibold ${zoomEnabled ? 'text-green-400' : 'text-gray-500'}`}>
              {zoomEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xl font-mono truncate text-gray-300">{lastZoomAction}</p>
            <button
              onClick={() => handleAction(zoomEnabled ? 'zoom_disable' : 'zoom_enable')}
              className={`py-2 px-3 mt-2 rounded-lg text-sm font-semibold transition-all cursor-pointer active:scale-95 ${
                zoomEnabled ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
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
              <Monitor size={20} /> System State
            </h2>
            <span className={`text-sm font-bold ${status === 'running' ? 'text-green-400' : 'text-yellow-400'}`}>
              {status.toUpperCase()}
            </span>
          </div>
          <div className="flex gap-2">
            {/* Start / Resume */}
            <button
              onClick={() => handleAction(status === 'paused' ? 'resume' : 'start')}
              className="flex-1 py-2.5 px-3 bg-green-600 hover:bg-green-700 active:scale-95 rounded-lg transition-all text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-green-900/20"
              title={status === 'paused' ? 'Resume' : 'Start'}
            >
              <Play size={18} />
              <span>{status === 'paused' ? 'Resume' : 'Start'}</span>
            </button>
            {/* Pause */}
            <button
              onClick={() => handleAction('pause')}
              className="flex-1 py-2.5 px-3 bg-yellow-600 hover:bg-yellow-700 active:scale-95 rounded-lg transition-all text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-yellow-900/20"
              title="Pause"
            >
              <Pause size={18} />
              <span>Pause</span>
            </button>
            {/* Stop */}
            <button
              onClick={() => handleAction('stop')}
              className="flex-1 py-2.5 px-3 bg-red-600 hover:bg-red-700 active:scale-95 rounded-lg transition-all text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-red-900/20"
              title="Stop"
            >
              <Square size={18} />
              <span>Stop</span>
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
                Supported Voice Commands
              </h3>
              <ul className="text-sm text-gray-300 space-y-2 mb-4">
                <li>• <span className="text-blue-400">Navigation:</span> "Open Google", "Scroll down", "Scroll up"</li>
                <li>• <span className="text-blue-400">Zoom:</span> "Zoom in", "Zoom out"</li>
                <li>• <span className="text-blue-400">Controls:</span> "Pause", "Resume", "Stop"</li>
                <li>• <span className="text-blue-400">Keyboard:</span> "Type hello", "Press enter"</li>
              </ul>
            </div>

            <div className="bg-gray-800/50 p-4 rounded-lg flex justify-between items-center border border-gray-700/50">
              <span className="text-sm font-medium text-gray-300">
                {voiceListening ? 'Microphone is active' : 'Microphone is off'}
              </span>
              <button
                onClick={() => handleAction('stop')}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-semibold rounded transition-colors text-sm cursor-pointer"
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
            Assistant Voice Responses
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
              onClick={handleToggleMute}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                ttsMuted ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              {ttsMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              <span>{ttsMuted ? 'Unmute' : 'Mute'}</span>
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
                  showToast(`Selected voice: ${e.target.value}`);
                  fetch(`${backendUrl}/api/tts/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voice_id: e.target.value })
                  }).catch(() => {});
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
                  fetch(`${backendUrl}/api/tts/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rate: val })
                  }).catch(() => {});
                }}
                className="w-full cursor-pointer"
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
                  fetch(`${backendUrl}/api/tts/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ volume: val })
                  }).catch(() => {});
                }}
                className="w-full cursor-pointer"
              />
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={handleTestVoice}
                className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold rounded-lg transition-all text-sm cursor-pointer shadow-md shadow-blue-900/20"
              >
                Test Voice
              </button>
              <button
                onClick={handleStopSpeaking}
                className="flex-1 py-2 px-4 bg-red-600/20 hover:bg-red-600/40 active:scale-95 text-red-400 font-semibold rounded-lg transition-all text-sm cursor-pointer border border-red-500/20"
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
          className="w-full py-4 bg-red-600 hover:bg-red-700 active:scale-[0.99] rounded-lg text-xl font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xl shadow-red-900/40"
        >
          STOP ALL CONTROLS
        </button>
      </div>
    </div>
  );
}
