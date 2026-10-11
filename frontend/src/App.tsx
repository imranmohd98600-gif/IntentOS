
import { useState, useEffect } from 'react';
import {
  Activity,
  Play,
  Square,
  Pause,
  AlertTriangle,
  Monitor,
  Mic,
  Hand,
  Search
} from 'lucide-react';

const HEALTH_URL = 'https://intentos-1-whlm.onrender.com/api/status';
const LOCAL_API = 'http://localhost:8000';

export default function App() {
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

  const isLocal =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  useEffect(() => {
    let active = true;

    // Hosted health check: used for the dashboard indicator.
    const checkHealth = () => {
      fetch(HEALTH_URL)
        .then(res => {
          if (!res.ok) throw new Error('Health check failed');
          return res.json();
        })
        .then(data => {
          if (active) setConnected(data.status === 'connected');
        })
        .catch(() => {
          if (active) setConnected(false);
        });
    };

    checkHealth();
    const healthInterval = window.setInterval(checkHealth, 30000);

    // Full PC-control features run only with the local backend.
    if (!isLocal) {
      return () => {
        active = false;
        window.clearInterval(healthInterval);
      };
    }

    fetch(`${LOCAL_API}/api/status`)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        setStatus(
          data.paused ? 'paused' :
          data.running ? 'running' : 'stopped'
        );
        if (data.voice_engine === 'ready') setVoiceListening(true);
        if (data.zoom_enabled !== undefined) {
          setZoomEnabled(data.zoom_enabled);
        }
      })
      .catch(console.error);

    fetch(`${LOCAL_API}/api/tts/voices`)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        setTtsVoices(data.voices || []);
        if (data.current_id) setTtsSelectedVoice(data.current_id);
      })
      .catch(console.error);

    const ws = new WebSocket('ws://localhost:8000/ws/events');

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
      // Do not overwrite the hosted health indicator here.
      // The health check independently determines hosted connectivity.
    };

    ws.onerror = error => console.error('WebSocket error:', error);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        fetch(`${LOCAL_API}/api/control/stop`, { method: 'POST' })
          .catch(console.error);
        setStatus('stopped');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      active = false;
      window.clearInterval(healthInterval);
      ws.close();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLocal]);

  const handleAction = async (action: string) => {
    if (!isLocal) {
      console.info('PC control requires the local IntentOS backend.');
      return;
    }

    try {
      const res = await fetch(`${LOCAL_API}/api/control/${action}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error(`Control request failed: ${res.status}`);
    } catch (error) {
      console.error(error);
    }
  };

  const updateTtsSettings = (settings: Record<string, unknown>) => {
    if (!isLocal) return;

    fetch(`${LOCAL_API}/api/tts/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    }).catch(console.error);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <header className="sticky top-0 z-50 mb-8 flex flex-col md:flex-row justify-between items-center bg-gray-950/90 backdrop-blur p-4 border-b border-gray-800">
        <div className="mb-4 md:mb-0">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            IntentOS
          </h1>
          <p className="text-gray-400 text-sm">
            Interact Naturally. Control Intelligently.
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-300 hidden md:inline">
              Backend {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

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

      {!isLocal && (
        <div className="mb-8 rounded-xl border border-yellow-800 bg-yellow-900/20 p-4 text-yellow-200 text-sm">
          Online demo mode: backend health is checked remotely. Webcam,
          voice, and PC-control functions require the local IntentOS backend.
        </div>
      )}

      {isLocal && (status === 'running' || status === 'paused') && (
        <div className="mb-8 bg-gray-900 p-4 rounded-xl border border-gray-800 flex justify-center">
          <img
            src={`${LOCAL_API}/api/video_feed`}
            alt="Webcam Feed"
            className="rounded-lg shadow-lg max-h-96 object-cover"
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Hand size={20} /> Gestures
            </h2>
            <span className="text-blue-400 text-sm">
              {isLocal ? 'Active' : 'Local only'}
            </span>
          </div>
          <p className="text-3xl font-mono">{lastGesture}</p>
        </div>

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
              disabled={!isLocal}
              onClick={() => handleAction(zoomEnabled ? 'zoom_disable' : 'zoom_enable')}
              className={`py-1 px-3 mt-2 rounded text-sm font-semibold transition-colors ${zoomEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-40`}
            >
              {zoomEnabled ? 'Disable Zoom' : 'Enable Zoom'}
            </button>
          </div>
        </div>

        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Monitor size={20} /> System
            </h2>
            <span className={`text-sm ${status === 'running' ? 'text-green-400' : 'text-yellow-400'}`}>
              {isLocal ? status.toUpperCase() : 'LOCAL ONLY'}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!isLocal}
              onClick={() => handleAction(status === 'paused' ? 'resume' : 'start')}
              className="p-2 bg-green-600 hover:bg-green-700 rounded disabled:opacity-40"
              title={status === 'paused' ? 'Resume' : 'Start'}
            >
              <Play size={20} />
            </button>
            <button
              disabled={!isLocal}
              onClick={() => handleAction('pause')}
              className="p-2 bg-yellow-600 hover:bg-yellow-700 rounded disabled:opacity-40"
              title="Pause"
            >
              <Pause size={20} />
            </button>
            <button
              disabled={!isLocal}
              onClick={() => handleAction('stop')}
              className="p-2 bg-red-600 hover:bg-red-700 rounded disabled:opacity-40"
              title="Stop"
            >
              <Square size={20} />
            </button>
          </div>
        </div>
      </div>

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
            {isLocal ? voiceState : 'Local only'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-950 rounded-lg p-4 h-64 overflow-y-auto border border-gray-800">
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              Command History
            </h3>
            {voiceHistory.length === 0 ? (
              <p className="text-gray-600 italic">No commands recognized yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {voiceHistory.map((item, idx) => (
                  <div key={idx} className={`p-3 rounded-md border ${item.success ? 'bg-green-900/10 border-green-900/30' : 'bg-red-900/10 border-red-900/30'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-medium text-gray-200">"{item.text}"</p>
                      <span className="text-xs text-gray-500">{item.time}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {item.actions?.map((act: any, i: number) => (
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
                {isLocal
                  ? (voiceListening ? 'Microphone is active' : 'Microphone is off')
                  : 'Microphone control is local only'}
              </span>
              <button
                disabled={!isLocal}
                onClick={() => handleAction('stop')}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-semibold rounded transition-colors text-sm disabled:opacity-40"
              >
                Force Stop Listening
              </button>
            </div>
          </div>
        </div>
      </div>

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
              {isLocal ? ttsStatus : 'Local only'}
            </span>
            <button
              disabled={!isLocal}
              onClick={() => {
                const newMuted = !ttsMuted;
                setTtsMuted(newMuted);
                updateTtsSettings({ muted: newMuted });
              }}
              className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${ttsMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'} disabled:opacity-40`}
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
                disabled={!isLocal}
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
                disabled={!isLocal}
                type="range" min="50" max="300" step="10"
                value={ttsRate}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  setTtsRate(val);
                  updateTtsSettings({ rate: val });
                }}
                className="w-full disabled:opacity-40"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-1">
                Volume ({Math.round(ttsVolume * 100)}%)
              </label>
              <input
                disabled={!isLocal}
                type="range" min="0" max="1" step="0.1"
                value={ttsVolume}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setTtsVolume(val);
                  updateTtsSettings({ volume: val });
                }}
                className="w-full disabled:opacity-40"
              />
            </div>

            <div className="flex gap-2 mt-2">
              <button
                disabled={!isLocal}
                onClick={() => {
                  fetch(`${LOCAL_API}/api/tts/speak`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: 'Hello, this is a voice test.' })
                  }).catch(console.error);
                }}
                className="flex-1 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 font-semibold rounded transition-colors text-sm disabled:opacity-40"
              >
                Test Voice
              </button>
              <button
                disabled={!isLocal}
                onClick={() => {
                  fetch(`${LOCAL_API}/api/tts/stop`, { method: 'POST' })
                    .catch(console.error);
                }}
                className="flex-1 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-semibold rounded transition-colors text-sm disabled:opacity-40"
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

      <div className="bg-gray-900 p-6 rounded-xl border border-red-900/50">
        <h2 className="text-xl font-bold text-red-500 flex items-center gap-2 mb-4">
          <AlertTriangle /> Emergency Stop
        </h2>
        <button
          onClick={() => handleAction('stop')}
          disabled={!isLocal}
          className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-lg text-xl font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
        >
          STOP ALL CONTROLS
        </button>
      </div>
    </div>
  );
}
