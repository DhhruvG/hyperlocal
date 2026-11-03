import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/lang';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sparkles, Send, X, Trash2, Image as ImageIcon, Loader2,
  ThumbsUp, ThumbsDown, ArrowRight, Mic, MicOff, Volume2, VolumeX,
  Play, Pause, RotateCcw, Square, RefreshCw, AlertTriangle, Flag, Globe
} from 'lucide-react';
import { toast } from 'sonner';

const SESSION_KEY = 'lp_ai_session_id';

function newSessionId() {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(SESSION_KEY, id);
  return id;
}
function currentSession() {
  return localStorage.getItem(SESSION_KEY) || newSessionId();
}

const QUICK_PROMPTS = {
  consumer: [
    'Where can I find the cheapest nearby seller?',
    'आलू सबसे सस्ता कहाँ मिलेगा?',
    'Show nearby verified shops',
    'How do I file a grievance?',
  ],
  vendor: [
    'आज मेरी दुकान की बिक्री कितनी हुई?',
    'Which products are out of stock?',
    'How do I update inventory using voice?',
    'Main apne shop ki sales kaise check kar sakta hoon?',
  ],
  mobile_vendor: [
    'आज मेरी बिक्री कितनी हुई?',
    'How do I go live with my cart location?',
    'Which products are out of stock?',
    'How do I add products by voice?',
  ],
  admin: [
    'Show me the AI usage and performance report.',
    'How many grievances are open?',
    'Summarize today\'s marketplace sales',
    'Open AI Control Center',
  ],
  guest: [
    'What is LocalPrice?',
    'How do vendors join?',
    'Is it free for shoppers?',
    'What cities do you serve?',
  ],
};

function formatMessageText(text) {
  if (!text) return '';
  const parts = String(text).split(/(\*\*.*?\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-semibold text-stone-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function stripMarkdownForSpeech(text) {
  if (!text) return '';
  return String(text)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[•▪▸►]/g, ', ')
    .replace(/₹\s*(\d+)/g, '$1 rupees ')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function AIAssistant() {
  const { user } = useAuth();
  const { lang } = useLang();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(currentSession());
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageB64, setImageB64] = useState(null);
  const [imageName, setImageName] = useState(null);
  const [ratedMessages, setRatedMessages] = useState({});
  const [expandedFeedbackMsg, setExpandedFeedbackMsg] = useState(null);

  // Runtime Config from Admin Control Center
  const [runtimeConfig, setRuntimeConfig] = useState({
    ai_enabled: true,
    text_chat_enabled: true,
    voice_input_enabled: true,
    spoken_output_enabled: true,
    supported_languages: ['en', 'hi', 'hinglish'],
    default_language: 'en',
    speaking_speed: 1.0,
    auto_play_voice_queries: true,
    playback_controls_enabled: true,
  });

  // Language & Audio Preferences
  const [preferredLang, setPreferredLang] = useState('auto'); // 'auto' | 'en' | 'hi' | 'hinglish'
  const [autoPlayAudio, setAutoPlayAudio] = useState(false);

  // Voice Input (STT) States
  const [isRecording, setIsRecording] = useState(false);
  const [transcribingAudio, setTranscribingAudio] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [detectedVoiceLang, setDetectedVoiceLang] = useState('');
  const [micError, setMicError] = useState('');
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const liveTranscriptRef = useRef('');
  const lastInputWasVoiceRef = useRef(false);
  const timerRef = useRef(null);

  // Spoken Output (TTS) Player States
  const [activeAudioMsgId, setActiveAudioMsgId] = useState(null);
  const [audioPlayState, setAudioPlayState] = useState('idle'); // 'idle' | 'playing' | 'paused' | 'loading' | 'error'
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [retryingAudioId, setRetryingAudioId] = useState(null);
  const htmlAudioRef = useRef(null);
  const utteranceRef = useRef(null);

  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  const isSuperAdmin = user?.email === 'dgstartup2026@gmail.com' || user?.role === 'admin' || pathname.startsWith('/admin');
  const role = isSuperAdmin ? 'admin' : (user?.vendor_mode === 'mobile' ? 'mobile_vendor' : (user?.role || 'guest'));
  const prompts = QUICK_PROMPTS[role] || QUICK_PROMPTS.guest;

  const fetchRuntimeConfig = useCallback(() => {
    api.get('/ai/runtime-config')
      .then((res) => {
        if (res.data) {
          setRuntimeConfig((prev) => ({ ...prev, ...res.data }));
          if (res.data.speaking_speed) setPlaybackSpeed(Number(res.data.speaking_speed) || 1.0);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      fetchRuntimeConfig();
    }
  }, [open, user, fetchRuntimeConfig]);

  // Listen for custom 'open_ai_copilot' window event from anywhere in the app
  useEffect(() => {
    const handler = (e) => {
      setOpen(true);
      const detail = e.detail || {};
      if (detail.voice) {
        setVoiceModeOpen(true);
      }
      if (detail.prompt) {
        setText(detail.prompt);
      }
    };
    window.addEventListener('open_ai_copilot', handler);
    return () => window.removeEventListener('open_ai_copilot', handler);
  }, []);

  useEffect(() => {
    if (!open || !user) return;
    api.get('/ai/history', { params: { session_id: session } })
      .then((r) => {
        setMessages((r.data || []).map((m) => ({
          id: m.id || m._id || String(Math.random()),
          role: m.sender_type,
          text: m.message,
          actions: m.actions || [],
          intent: m.intent,
          language: m.language || 'en',
          audio: m.audio || {
            status: 'ready',
            speech_text: stripMarkdownForSpeech(m.message),
            voice_locale: /[\u0900-\u097F]/.test(m.message || '') ? 'hi-IN' : 'en-IN',
            speaking_speed: 1.0,
          },
        })));
      })
      .catch(() => {});
  }, [open, session, user]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, voiceModeOpen]);

  // Cleanup speech & recording on unmount
  useEffect(() => {
    return () => {
      stopAllAudio();
      stopVoiceRecording();
    };
  }, []);

  // ---------- TTS SPOKEN OUTPUT ENGINE ----------
  const stopAllAudio = useCallback(() => {
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (e) {}
    try {
      if (htmlAudioRef.current) {
        htmlAudioRef.current.pause();
        htmlAudioRef.current.currentTime = 0;
        htmlAudioRef.current = null;
      }
    } catch (e) {}
    setAudioPlayState('idle');
    setActiveAudioMsgId(null);
  }, []);

  const playMessageAudio = useCallback((msg, speedOverride) => {
    if (!msg || !msg.text) return;
    const speed = speedOverride || playbackSpeed || 1.0;
    const speechText = msg.audio?.speech_text || stripMarkdownForSpeech(msg.text);
    const hasDevanagari = /[\u0900-\u097F]/.test(speechText);
    const targetLocale = msg.audio?.voice_locale || (hasDevanagari ? 'hi-IN' : 'en-IN');

    stopAllAudio();
    setActiveAudioMsgId(msg.id);

    // Prefer Web Speech API SpeechSynthesis for instant Hindi/English voice + pause/resume/speed controls
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(speechText);
        utter.lang = targetLocale;
        utter.rate = speed;
        utter.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices?.() || [];
        if (voices.length > 0) {
          const langPrefix = hasDevanagari ? 'hi' : 'en';
          const matchedVoice =
            voices.find((v) => v.lang?.toLowerCase() === targetLocale.toLowerCase()) ||
            voices.find((v) => v.lang?.toLowerCase().startsWith(langPrefix) && v.lang?.toLowerCase().includes('in')) ||
            voices.find((v) => v.lang?.toLowerCase().startsWith(langPrefix));
          if (matchedVoice) utter.voice = matchedVoice;
        }

        utter.onstart = () => setAudioPlayState('playing');
        utter.onend = () => {
          setAudioPlayState('idle');
          setActiveAudioMsgId(null);
        };
        utter.onerror = () => {
          // Fallback to backend audio_data_url if available
          if (msg.audio?.audio_data_url) {
            playHtmlAudioFallback(msg.id, msg.audio.audio_data_url, speed);
          } else {
            setAudioPlayState('error');
          }
        };

        utteranceRef.current = utter;
        setAudioPlayState('playing');
        window.speechSynthesis.speak(utter);
        return;
      } catch (e) {
        // Fallback below
      }
    }

    if (msg.audio?.audio_data_url) {
      playHtmlAudioFallback(msg.id, msg.audio.audio_data_url, speed);
    } else {
      setAudioPlayState('error');
      toast.error('Audio playback is not supported in this browser.');
    }
  }, [playbackSpeed, stopAllAudio]);

  const playHtmlAudioFallback = (msgId, dataUrl, speed) => {
    try {
      const audio = new Audio(dataUrl);
      audio.playbackRate = speed || 1.0;
      htmlAudioRef.current = audio;
      setActiveAudioMsgId(msgId);
      setAudioPlayState('playing');
      audio.onended = () => {
        setAudioPlayState('idle');
        setActiveAudioMsgId(null);
      };
      audio.onerror = () => {
        setAudioPlayState('error');
      };
      audio.play().catch(() => {
        setAudioPlayState('idle');
      });
    } catch (e) {
      setAudioPlayState('error');
    }
  };

  const pauseMessageAudio = () => {
    try {
      if (window.speechSynthesis && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        setAudioPlayState('paused');
        return;
      }
      if (htmlAudioRef.current && !htmlAudioRef.current.paused) {
        htmlAudioRef.current.pause();
        setAudioPlayState('paused');
      }
    } catch (e) {}
  };

  const resumeMessageAudio = (msg) => {
    try {
      if (window.speechSynthesis && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setAudioPlayState('playing');
        return;
      }
      if (htmlAudioRef.current && htmlAudioRef.current.paused) {
        htmlAudioRef.current.play();
        setAudioPlayState('playing');
        return;
      }
      playMessageAudio(msg);
    } catch (e) {
      playMessageAudio(msg);
    }
  };

  const replayMessageAudio = (msg) => {
    playMessageAudio(msg, playbackSpeed);
  };

  const changeSpeed = (newSpeed, msg) => {
    setPlaybackSpeed(newSpeed);
    if (activeAudioMsgId === msg.id && (audioPlayState === 'playing' || audioPlayState === 'paused')) {
      playMessageAudio(msg, newSpeed);
    }
  };

  const retryAudioGeneration = async (msg) => {
    setRetryingAudioId(msg.id);
    try {
      const { data } = await api.post('/ai/tts', {
        text: msg.text,
        language: msg.language || (preferredLang === 'auto' ? lang : preferredLang),
        speed: playbackSpeed,
      });
      setMessages((prev) =>
        prev.map((item) => (item.id === msg.id ? { ...item, audio: data } : item))
      );
      toast.success('Audio regenerated ready to play');
      playMessageAudio({ ...msg, audio: data }, playbackSpeed);
    } catch (err) {
      toast.error('Audio generation failed. Written answer remains available.');
    } finally {
      setRetryingAudioId(null);
    }
  };

  // ---------- VOICE INPUT (STT) ENGINE (DUAL: WEB SPEECH + MEDIARECORDER AI STT) ----------
  const updateRecognizedText = (newText) => {
    const cleaned = (newText || '').trim();
    liveTranscriptRef.current = cleaned;
    setVoiceTranscript(cleaned);
    setText(cleaned);
    lastInputWasVoiceRef.current = true;
    if (/[\u0900-\u097F]/.test(cleaned)) {
      setDetectedVoiceLang('Hindi (हिन्दी)');
    } else if (/\b(kya|kaise|kitna|kitni|meri|dukan|bikri|sasta|kahan|milega|chahiye|tamatar|aloo|pyaaz)\b/i.test(cleaned)) {
      setDetectedVoiceLang('Hinglish');
    } else if (cleaned) {
      setDetectedVoiceLang('English');
    }
  };

  const transcribeRecordedAudioBlob = async (blob, targetLangCode) => {
    if (!blob || blob.size < 200) return;
    setTranscribingAudio(true);
    try {
      const base64Audio = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const { data } = await api.post('/ai/stt', {
        audio_base64: base64Audio,
        mime_type: blob.type || 'audio/webm',
        language: targetLangCode || preferredLang || 'auto',
      });
      if (data?.transcript && data.transcript.trim()) {
        updateRecognizedText(data.transcript.trim());
        toast.success('Voice transcribed into input box');
      } else if (!liveTranscriptRef.current) {
        setMicError('No clear speech detected. Please speak closer to the microphone or type your question below.');
      }
    } catch (e) {
      if (!liveTranscriptRef.current) {
        setMicError('Could not transcribe audio automatically. You can type or edit your question directly in the box below.');
      }
    } finally {
      setTranscribingAudio(false);
    }
  };

  const startVoiceRecording = async () => {
    setMicError('');
    setVoiceModeOpen(true);
    liveTranscriptRef.current = '';
    audioChunksRef.current = [];

    const targetLang =
      preferredLang === 'hi'
        ? 'hi-IN'
        : preferredLang === 'en'
        ? 'en-IN'
        : lang === 'hi'
        ? 'hi-IN'
        : 'en-IN';

    setIsRecording(true);
    setRecordingSec(0);
    setDetectedVoiceLang(targetLang === 'hi-IN' ? 'Hindi / Hinglish (hi-IN)' : 'English / Hinglish (en-IN)');
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRecordingSec((s) => s + 1);
    }, 1000);

    // 1. Start MediaRecorder on real microphone stream so we always capture audio even if Web Speech API fails
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const mimeType =
          typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('audio/webm')
            ? 'audio/webm'
            : '';
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            audioChunksRef.current.push(ev.data);
          }
        };
        recorder.onstop = () => {
          const chunks = audioChunksRef.current;
          try {
            stream.getTracks().forEach((tr) => tr.stop());
          } catch (e) {}
          mediaStreamRef.current = null;
          // If browser SpeechRecognition didn't write text yet, transcribe recorded audio via backend AI STT!
          if (!liveTranscriptRef.current && chunks.length > 0) {
            const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            transcribeRecordedAudioBlob(audioBlob, targetLang);
          }
        };
        mediaRecorderRef.current = recorder;
        recorder.start(250);
      } catch (permErr) {
        setIsRecording(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setMicError('Microphone permission denied or no microphone found. Please allow microphone access in your browser.');
        return;
      }
    }

    // 2. Also run Browser SpeechRecognition in parallel for instant live word-by-word streaming into the input box
    const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.lang = targetLang;
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          let finalStr = '';
          let interimStr = '';
          for (let i = 0; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalStr += t + ' ';
            } else {
              interimStr += t;
            }
          }
          const combined = (finalStr + interimStr).trim();
          if (combined) {
            updateRecognizedText(combined);
          }
        };

        recognition.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'permission-denied') {
            setMicError('Microphone permission denied. Please allow microphone access in your browser.');
            stopVoiceRecording();
          }
          // For 'network' or 'no-speech', do NOT kill MediaRecorder — MediaRecorder will transcribe via /api/ai/stt on stop!
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err) {
        // MediaRecorder is still running and will transcribe via /api/ai/stt when stopped
      }
    }
  };

  const stopVoiceRecording = () => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    } catch (e) {}
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    } catch (e) {}
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  const submitVoiceQuestion = () => {
    stopVoiceRecording();
    const q = (text || voiceTranscript).trim();
    if (!q) {
      toast.error('Please speak or enter a question first');
      return;
    }
    setVoiceModeOpen(false);
    setVoiceTranscript('');
    send(q, 'voice');
  };

  // ---------- SEND MESSAGE (TEXT OR VOICE) ----------
  const send = async (overrideText, inputMode = 'text') => {
    const body = (overrideText ?? text).trim();
    if (!body || busy) return;
    if (!user) {
      toast.info('Sign in to chat with LocalPrice AI');
      return;
    }

    const msgId = `user_${Date.now()}`;
    const userMsg = { id: msgId, role: 'user', text: body, inputMode };
    setMessages((m) => [...m, userMsg]);
    if (!overrideText) setText('');
    setBusy(true);

    try {
      const resolvedPrefLang = preferredLang === 'auto' ? null : preferredLang;
      const { data } = await api.post('/ai/chat-simple', {
        session_id: session,
        message: body,
        page: pathname,
        context: {
          lat: user?.lat,
          lng: user?.lng,
          page: pathname,
        },
        image_base64: imageB64 || null,
        input_mode: inputMode,
        preferred_language: resolvedPrefLang,
        generate_audio: runtimeConfig.spoken_output_enabled !== false,
      });

      const replyId = data.message_id || `ai_${Date.now()}`;
      const newAssistantMsg = {
        id: replyId,
        role: 'assistant',
        text: data.reply,
        actions: data.actions || [],
        intent: data.intent,
        language: data.language || 'en',
        inputMode,
        audio: data.audio || {
          status: 'ready',
          speech_text: stripMarkdownForSpeech(data.reply),
          voice_locale: /[\u0900-\u097F]/.test(data.reply || '') ? 'hi-IN' : 'en-IN',
          speaking_speed: playbackSpeed,
        },
      };

      setMessages((m) => [...m, newAssistantMsg]);
      setImageB64(null);
      setImageName(null);

      // Auto-play audio ONLY if user explicitly enabled auto-play or asked via voice when auto_play_voice_queries is permitted
      if (
        runtimeConfig.spoken_output_enabled !== false &&
        (autoPlayAudio || (inputMode === 'voice' && runtimeConfig.auto_play_voice_queries))
      ) {
        setTimeout(() => {
          playMessageAudio(newAssistantMsg, playbackSpeed);
        }, 150);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          text: 'LocalPrice AI encountered a temporary connection issue. You can still search products, browse vendors, and check prices directly across the app.',
          audio: { status: 'failed' },
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const handleAction = async (action) => {
    if (!action) return;
    if (action.action === 'navigate' && action.payload) {
      navigate(action.payload);
      if (window.innerWidth < 768) setOpen(false);
    } else if (action.action === 'send_message' && action.payload) {
      send(action.payload, 'text');
    } else if (action.action === 'draft_grievance' && action.payload) {
      try {
        setBusy(true);
        const res = await api.post('/grievances', action.payload);
        toast.success(`Grievance ${res.data.grievance_number || ''} submitted successfully!`);
        setMessages((m) => [
          ...m,
          {
            id: `grv_${Date.now()}`,
            role: 'assistant',
            text: `✅ Grievance ticket **${res.data.grievance_number}** has been officially filed. Our administrative team will review this case under the 24-48 hour resolution SLA.`,
            actions: [
              { label: 'View Grievance Status', action: 'navigate', payload: `/grievances/${res.data.id}` },
            ],
          },
        ]);
      } catch (err) {
        toast.error('Could not submit grievance. Please verify details in the Grievance tab.');
      } finally {
        setBusy(false);
      }
    }
  };

  const handleDetailedFeedback = async (msgId, feedbackType, rating) => {
    setRatedMessages((prev) => ({ ...prev, [msgId]: feedbackType }));
    setExpandedFeedbackMsg(null);
    try {
      await api.post('/ai/feedback-detailed', {
        message_id: msgId,
        session_id: session,
        rating,
        feedback_type: feedbackType,
      });
      toast.success(`Feedback (${feedbackType.replace('_', ' ')}) recorded.`);
    } catch (e) {
      toast.success('Feedback recorded.');
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Image too large (max 5MB)');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      toast.error('JPEG/PNG/WebP only');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      const b64 = s.slice(s.indexOf(',') + 1);
      setImageB64(b64);
      setImageName(f.name);
    };
    reader.readAsDataURL(f);
  };

  const clearChat = async () => {
    stopAllAudio();
    await api.delete('/ai/history', { params: { session_id: session } }).catch(() => {});
    const newId = newSessionId();
    setSession(newId);
    setMessages([]);
    setRatedMessages({});
  };

  // Hide only on auth/login screens
  if (pathname.startsWith('/admin/login') || pathname.startsWith('/auth/')) return null;

  return (
    <>
      {/* Floating button */}
      <button
        data-testid="ai-open"
        onClick={() => setOpen(true)}
        className={`fixed z-40 bottom-20 right-4 md:bottom-6 md:right-6 rounded-full shadow-2xl w-14 h-14 md:w-16 md:h-16
          bg-gradient-to-br from-[#0A6E3B] via-emerald-600 to-emerald-500 text-white grid place-items-center
          hover:scale-105 transition-transform ${open ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        aria-label="Open Universal AI Copilot"
        title="Ask LocalPrice AI Copilot (Voice & Text)"
      >
        <Sparkles size={22} />
        <span className="absolute -top-1 -right-1 rounded-full bg-amber-400 text-amber-950 text-[9px] font-bold px-1.5 py-0.5 shadow">
          🎙 AI
        </span>
      </button>

      {/* Main Copilot Panel */}
      <div
        className={`fixed z-50 inset-x-0 bottom-0 md:inset-auto md:bottom-6 md:right-6 md:w-[440px] md:h-[650px]
          bg-white rounded-t-2xl md:rounded-2xl shadow-2xl border border-stone-200 flex flex-col
          transition-transform ${open ? 'translate-y-0' : 'translate-y-full md:translate-y-[120%]'}`}
        style={{ maxHeight: '92vh' }}
        role="dialog"
        data-testid="ai-copilot-panel"
      >
        {/* Header */}
        <div className="p-3.5 border-b border-stone-100 bg-gradient-to-r from-emerald-950 via-[#0A6E3B] to-emerald-700 text-white rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-white/15 backdrop-blur grid place-items-center text-white shrink-0">
              <Sparkles size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-sm flex items-center gap-1.5">
                <span>HyperLocal AI Copilot</span>
                <span className="text-[10px] bg-emerald-300 text-emerald-950 font-bold px-1.5 py-0.5 rounded">
                  Voice + Text
                </span>
              </div>
              <div className="text-[10px] text-emerald-100 truncate">
                {user ? `${role.replace('_', ' ')} · Written & Spoken AI` : 'Sign in for personalized voice & text help'}
              </div>
            </div>

            {/* Auto-Play Spoken Output Toggle */}
            {runtimeConfig.spoken_output_enabled !== false && (
              <button
                type="button"
                onClick={() => {
                  const next = !autoPlayAudio;
                  setAutoPlayAudio(next);
                  if (!next) stopAllAudio();
                  toast.info(next ? 'Spoken audio auto-play enabled' : 'Spoken audio set to manual play');
                }}
                className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                  autoPlayAudio ? 'bg-amber-400 text-amber-950 font-semibold' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                title={autoPlayAudio ? 'Auto-play spoken answers ON' : 'Auto-play spoken answers OFF (click Play on any message)'}
                data-testid="ai-autoplay-toggle"
              >
                {autoPlayAudio ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
            )}

            <button
              onClick={clearChat}
              className="p-1.5 text-emerald-100 hover:text-white"
              aria-label="New chat"
              title="Clear conversation"
            >
              <Trash2 size={15} />
            </button>
            <button
              data-testid="ai-close"
              onClick={() => {
                stopAllAudio();
                stopVoiceRecording();
                setOpen(false);
              }}
              className="p-1.5 text-emerald-100 hover:text-white"
            >
              <X size={17} />
            </button>
          </div>

          {/* Language Selector Bar */}
          <div className="flex items-center justify-between gap-1.5 mt-2.5 pt-2 border-t border-white/15 text-[11px]">
            <span className="flex items-center gap-1 text-emerald-100">
              <Globe size={11} /> Response Language:
            </span>
            <div className="flex items-center gap-1">
              {[
                { key: 'auto', label: 'Auto' },
                { key: 'en', label: 'English' },
                { key: 'hi', label: 'हिन्दी' },
                { key: 'hinglish', label: 'Hinglish' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPreferredLang(opt.key)}
                  data-testid={`ai-lang-${opt.key}`}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                    preferredLang === opt.key
                      ? 'bg-white text-[#0A6E3B] font-bold shadow-sm'
                      : 'bg-white/10 text-emerald-100 hover:bg-white/20'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-stone-50/60">
          {messages.length === 0 && !voiceModeOpen && (
            <div className="text-center text-stone-500 text-sm py-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 grid place-items-center mx-auto mb-2 text-[#0A6E3B]">
                <Sparkles size={20} />
              </div>
              <div className="font-display text-base text-stone-900 font-semibold">
                Ask by Voice or Text in Hindi, English & Hinglish
              </div>
              <div className="text-xs text-stone-500 mt-0.5">
                Grounded in live marketplace data · Role:{' '}
                <span className="font-semibold text-emerald-700 capitalize">{role.replace('_', ' ')}</span>
              </div>

              {/* Prominent Voice Question Entry Button */}
              {runtimeConfig.voice_input_enabled !== false && (
                <div className="mt-3">
                  <button
                    type="button"
                    data-testid="ai-voice-start-hero"
                    onClick={() => {
                      if (!user) {
                        toast.info('Sign in to use Voice AI Copilot');
                        return;
                      }
                      startVoiceRecording();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#0A6E3B] to-emerald-600 hover:from-[#075030] hover:to-emerald-700 text-white font-semibold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
                  >
                    <Mic size={15} />
                    <span>🎙 Speak Your Question (Hindi / English / Hinglish)</span>
                  </button>
                </div>
              )}

              <div className="mt-3 flex flex-col gap-1.5">
                {prompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => (user ? send(p, 'text') : window.location.assign('/auth/consumer'))}
                    className="text-left px-3 py-2 rounded-xl bg-white border border-stone-200 hover:border-[#0A6E3B] hover:text-[#0A6E3B] text-xs transition-all shadow-sm flex items-center justify-between"
                  >
                    <span>{p}</span>
                    <ArrowRight size={12} className="text-stone-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Voice Recording / Transcription Drawer */}
          {voiceModeOpen && (
            <div
              data-testid="ai-voice-drawer"
              className="rounded-2xl bg-white border-2 border-emerald-500 p-3.5 shadow-md space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isRecording ? 'bg-red-500 animate-ping' : 'bg-emerald-600'
                    }`}
                  />
                  <span className="text-xs font-bold text-stone-900">
                    {isRecording ? `Listening… (${recordingSec}s)` : 'Voice Question Ready'}
                  </span>
                </div>
                {detectedVoiceLang && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                    {detectedVoiceLang}
                  </span>
                )}
              </div>

              {/* Waveform visual indicator when recording */}
              {isRecording && (
                <div className="flex items-center justify-center gap-1 py-2 bg-emerald-50/70 rounded-xl">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => (
                    <span
                      key={bar}
                      className="w-1 bg-[#0A6E3B] rounded-full animate-pulse"
                      style={{
                        height: `${10 + ((bar * 7) % 18)}px`,
                        animationDelay: `${bar * 0.1}s`,
                      }}
                    />
                  ))}
                  <span className="ml-2 text-[11px] text-emerald-900 font-medium">
                    Speak naturally in Hindi, English, or Hinglish…
                  </span>
                </div>
              )}

              {micError && (
                <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-900 p-2 rounded-lg flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-600" />
                  <span>{micError}</span>
                </div>
              )}

              <div>
                <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                  Recognized Question (Editable before sending)
                </label>
                <textarea
                  data-testid="ai-voice-transcript"
                  rows={2}
                  value={voiceTranscript}
                  onChange={(e) => {
                    setVoiceTranscript(e.target.value);
                    setText(e.target.value);
                  }}
                  placeholder="E.g. आज मेरी दुकान की बिक्री कितनी हुई? / Where can I buy tomatoes?"
                  className="mt-1 w-full rounded-xl border border-stone-200 p-2 text-xs text-stone-900 focus:outline-none focus:border-[#0A6E3B]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {isRecording ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={stopVoiceRecording}
                    className="h-7 text-xs gap-1"
                    data-testid="ai-voice-stop"
                  >
                    <MicOff size={12} /> Stop Recording
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={startVoiceRecording}
                    className="h-7 text-xs gap-1 border-emerald-600 text-emerald-800"
                    data-testid="ai-voice-record-again"
                  >
                    <Mic size={12} /> {voiceTranscript ? 'Record Again' : 'Start Recording'}
                  </Button>
                )}

                <Button
                  type="button"
                  size="sm"
                  onClick={submitVoiceQuestion}
                  disabled={!(voiceTranscript.trim() || text.trim()) || busy || transcribingAudio}
                  className="h-7 text-xs bg-[#0A6E3B] hover:bg-[#075030] text-white gap-1"
                  data-testid="ai-voice-process"
                >
                  <Send size={11} /> Process Voice
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setVoiceTranscript('');
                    setText('');
                  }}
                  className="h-7 text-xs text-stone-500"
                >
                  Clear
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    stopVoiceRecording();
                    setVoiceModeOpen(false);
                  }}
                  className="h-7 text-xs text-stone-500 ml-auto"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Conversation Messages */}
          {messages.map((m, i) => {
            const isThisPlaying = activeAudioMsgId === m.id && audioPlayState === 'playing';
            const isThisPaused = activeAudioMsgId === m.id && audioPlayState === 'paused';
            const isThisError = activeAudioMsgId === m.id && audioPlayState === 'error';

            return (
              <div key={m.id || i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[90%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${
                    m.role === 'user'
                      ? 'bg-[#0A6E3B] text-white rounded-br-sm'
                      : 'bg-white border border-stone-200 text-stone-900 rounded-bl-sm'
                  }`}
                >
                  {m.role === 'user' && m.inputMode === 'voice' && (
                    <div className="text-[10px] text-emerald-200 flex items-center gap-1 mb-0.5 font-medium">
                      <Mic size={10} /> Spoken Question
                    </div>
                  )}
                  {m.role === 'user' ? m.text : formatMessageText(m.text)}

                  {/* Spoken Audio Player Bar inside Assistant Message */}
                  {m.role === 'assistant' && runtimeConfig.spoken_output_enabled !== false && (
                    <div
                      data-testid={`ai-audio-controls-${i}`}
                      className="mt-2.5 pt-2 border-t border-stone-100 flex flex-wrap items-center gap-1.5 text-[11px]"
                    >
                      {/* Play / Pause / Resume */}
                      {!isThisPlaying && !isThisPaused && (
                        <button
                          type="button"
                          onClick={() => playMessageAudio(m, playbackSpeed)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#0A6E3B] font-semibold border border-emerald-200 transition-colors"
                          title="Play spoken answer"
                          data-testid={`ai-audio-play-${i}`}
                        >
                          <Play size={11} /> Listen
                        </button>
                      )}

                      {isThisPlaying && (
                        <button
                          type="button"
                          onClick={pauseMessageAudio}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold border border-amber-300"
                          title="Pause spoken answer"
                          data-testid={`ai-audio-pause-${i}`}
                        >
                          <Pause size={11} /> Pause
                        </button>
                      )}

                      {isThisPaused && (
                        <button
                          type="button"
                          onClick={() => resumeMessageAudio(m)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-semibold border border-emerald-300"
                          title="Resume spoken answer"
                          data-testid={`ai-audio-resume-${i}`}
                        >
                          <Play size={11} /> Resume
                        </button>
                      )}

                      {/* Replay */}
                      <button
                        type="button"
                        onClick={() => replayMessageAudio(m)}
                        className="p-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700"
                        title="Replay from start"
                        data-testid={`ai-audio-replay-${i}`}
                      >
                        <RotateCcw size={11} />
                      </button>

                      {/* Stop */}
                      {(isThisPlaying || isThisPaused) && (
                        <button
                          type="button"
                          onClick={stopAllAudio}
                          className="p-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
                          title="Stop playback"
                          data-testid={`ai-audio-stop-${i}`}
                        >
                          <Square size={11} />
                        </button>
                      )}

                      {/* Playback Speed Selector */}
                      <select
                        aria-label="Playback speed"
                        value={playbackSpeed}
                        onChange={(e) => changeSpeed(Number(e.target.value), m)}
                        className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 text-[10px] font-medium border border-stone-200 focus:outline-none"
                        data-testid={`ai-audio-speed-${i}`}
                      >
                        <option value={0.75}>0.75x</option>
                        <option value={1}>1x</option>
                        <option value={1.25}>1.25x</option>
                        <option value={1.5}>1.5x</option>
                      </select>

                      {/* Audio Status & Retry */}
                      <span className="text-[10px] text-stone-400 ml-auto flex items-center gap-1">
                        {isThisPlaying
                          ? '🔊 Speaking…'
                          : isThisPaused
                          ? '⏸ Paused'
                          : isThisError || m.audio?.status === 'failed'
                          ? '⚠️ Audio issue'
                          : '🔊 Ready'}
                      </span>

                      <button
                        type="button"
                        onClick={() => retryAudioGeneration(m)}
                        disabled={retryingAudioId === m.id}
                        className="p-1 rounded hover:bg-stone-100 text-stone-500 hover:text-stone-800"
                        title="Regenerate / Retry Spoken Audio"
                        data-testid={`ai-audio-retry-${i}`}
                      >
                        <RefreshCw size={11} className={retryingAudioId === m.id ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Action Chips */}
                {m.role === 'assistant' && m.actions && m.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-[92%]">
                    {m.actions.map((act, actIdx) => (
                      <button
                        key={actIdx}
                        onClick={() => handleAction(act)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors"
                      >
                        <span>{act.label}</span>
                        <ArrowRight size={10} />
                      </button>
                    ))}
                  </div>
                )}

                {/* Feedback Controls (Helpful, Not helpful, Incorrect, Audio issue, Translation issue, Report) */}
                {m.role === 'assistant' && (
                  <div className="flex flex-col items-start mt-1 px-1 w-full">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDetailedFeedback(m.id, 'helpful', 1)}
                        className={`p-1 rounded hover:bg-stone-100 transition-colors ${
                          ratedMessages[m.id] === 'helpful' ? 'text-emerald-600 font-bold' : 'text-stone-400'
                        }`}
                        title="Helpful"
                      >
                        <ThumbsUp size={11} />
                      </button>
                      <button
                        onClick={() => handleDetailedFeedback(m.id, 'not_helpful', -1)}
                        className={`p-1 rounded hover:bg-stone-100 transition-colors ${
                          ratedMessages[m.id] === 'not_helpful' ? 'text-rose-600 font-bold' : 'text-stone-400'
                        }`}
                        title="Not helpful"
                      >
                        <ThumbsDown size={11} />
                      </button>
                      <button
                        onClick={() => setExpandedFeedbackMsg(expandedFeedbackMsg === m.id ? null : m.id)}
                        className="text-[10px] text-stone-400 hover:text-stone-600 px-1.5 py-0.5 rounded hover:bg-stone-100 flex items-center gap-0.5"
                        title="Report specific issue (Audio, Translation, Incorrect)"
                      >
                        <Flag size={10} />
                        <span>{ratedMessages[m.id] ? `Rated: ${ratedMessages[m.id].replace('_', ' ')}` : 'Report / More'}</span>
                      </button>
                    </div>

                    {expandedFeedbackMsg === m.id && (
                      <div className="mt-1 flex flex-wrap gap-1 bg-white border border-stone-200 rounded-xl p-1.5 shadow-sm text-[10px]">
                        {[
                          { key: 'incorrect', label: '⚠️ Incorrect' },
                          { key: 'audio_issue', label: '🔇 Audio issue' },
                          { key: 'translation_issue', label: '🌐 Translation issue' },
                          { key: 'report_response', label: '🚩 Report response' },
                        ].map((fb) => (
                          <button
                            key={fb.key}
                            type="button"
                            onClick={() => handleDetailedFeedback(m.id, fb.key, -1)}
                            className="px-2 py-0.5 rounded-lg bg-stone-50 hover:bg-rose-50 text-stone-700 hover:text-rose-700 border border-stone-200"
                          >
                            {fb.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {busy && (
            <div className="flex justify-start">
              <div className="px-3.5 py-2 rounded-2xl bg-white border border-stone-200 text-stone-500 inline-flex items-center gap-2 text-xs shadow-sm">
                <Loader2 size={13} className="animate-spin text-[#0A6E3B]" /> Understanding & generating written + spoken answer…
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="p-3 border-t border-stone-100 bg-white rounded-b-2xl">
          {/* Live Recording / Transcribing Status Bar right above Input */}
          {(isRecording || transcribingAudio || micError) && (
            <div className="mb-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {isRecording ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping shrink-0" />
                    <span className="font-semibold text-stone-900 truncate">
                      Listening ({recordingSec}s)… Speak now, then click Stop
                    </span>
                  </>
                ) : transcribingAudio ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-[#0A6E3B] shrink-0" />
                    <span className="font-semibold text-emerald-900 truncate">
                      Transcribing your voice into text…
                    </span>
                  </>
                ) : (
                  <span className="text-amber-800 text-[11px]">{micError}</span>
                )}
              </div>
              {isRecording && (
                <button
                  type="button"
                  onClick={stopVoiceRecording}
                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold shrink-0"
                >
                  Stop & Write
                </button>
              )}
            </div>
          )}

          {imageName && (
            <div className="flex items-center gap-2 mb-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
              <ImageIcon size={12} /> {imageName}
              <button
                onClick={() => {
                  setImageB64(null);
                  setImageName(null);
                }}
                className="ml-auto text-stone-500 hover:text-red-600"
              >
                <X size={12} />
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isRecording) stopVoiceRecording();
              const mode = lastInputWasVoiceRef.current ? 'voice' : 'text';
              lastInputWasVoiceRef.current = false;
              setVoiceModeOpen(false);
              send(undefined, mode);
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="file"
              ref={fileRef}
              accept="image/jpeg,image/png,image/webp"
              onChange={onFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="p-2 text-stone-500 hover:text-[#0A6E3B]"
              title="Attach screenshot"
            >
              <ImageIcon size={16} />
            </button>

            {/* Voice Input Microphone Button */}
            {runtimeConfig.voice_input_enabled !== false && (
              <button
                type="button"
                data-testid="ai-voice-btn"
                onClick={() => {
                  if (isRecording) {
                    stopVoiceRecording();
                  } else {
                    startVoiceRecording();
                  }
                }}
                className={`p-2 rounded-full transition-all shrink-0 ${
                  isRecording
                    ? 'bg-red-600 text-white animate-pulse shadow-md'
                    : 'bg-emerald-50 text-[#0A6E3B] hover:bg-emerald-100 border border-emerald-200'
                }`}
                title={isRecording ? 'Click to stop recording and write text' : 'Speak question in Hindi, English, or Hinglish'}
              >
                {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
            )}

            <Input
              data-testid="ai-input"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setVoiceTranscript(e.target.value);
              }}
              placeholder={
                isRecording
                  ? 'Listening… Speak now (or click mic to stop)'
                  : transcribingAudio
                  ? 'Transcribing your speech…'
                  : user
                  ? 'Ask in English, हिन्दी, or Hinglish…'
                  : 'Speak or type your question…'
              }
              disabled={busy}
              className="flex-1 text-xs md:text-sm"
            />
            <Button
              data-testid="ai-send"
              type="submit"
              disabled={busy || !text.trim()}
              size="icon"
              className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white shrink-0"
            >
              <Send size={14} />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
