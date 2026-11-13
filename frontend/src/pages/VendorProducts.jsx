import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PRODUCT_FORM } from '@/constants/testIds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Sparkles, Mic, MicOff, Volume2, RotateCcw,
  CheckCircle2, AlertTriangle, Languages, Search, History, Image as ImageIcon,
  Wand2, Layers, X, FileCheck2
} from 'lucide-react';

const empty = { name: '', category: '', price: '', unit: 'kg', description: '', in_stock: true, is_featured: false };

const CATEGORY_OPTIONS = [
  { key: 'vegetables', label: 'Vegetables (सब्ज़ियाँ)' },
  { key: 'fruits', label: 'Fruits (फल)' },
  { key: 'dairy', label: 'Dairy & Milk (डेयरी / दूध)' },
  { key: 'groceries', label: 'Groceries & Staples (किराना / अनाज)' },
  { key: 'bakery', label: 'Bakery & Snacks (बेकरी / स्नैक्स)' },
  { key: 'household', label: 'Household & Personal Care (घरेलू सामान)' },
  { key: 'pharmacy', label: 'Medicines & Wellness (दवाई)' },
  { key: 'stationery', label: 'Stationery (स्टेशनरी)' },
  { key: 'flowers', label: 'Flowers & Pooja (फूल)' },
  { key: 'clothing', label: 'Clothing (कपड़े)' },
  { key: 'hardware', label: 'Hardware (हार्डवेयर)' },
  { key: 'other', label: 'Other (अन्य)' },
];

const DEFAULT_UNITS = [
  { code: 'KG', label_en: 'Kilogram (kg)', label_hi: 'किलो (kg)' },
  { code: 'G', label_en: 'Gram (g)', label_hi: 'ग्राम (g)' },
  { code: 'L', label_en: 'Litre (L)', label_hi: 'लीटर (L)' },
  { code: 'ML', label_en: 'Millilitre (ml)', label_hi: 'मिलीलीटर (ml)' },
  { code: 'PIECE', label_en: 'Piece / Nag', label_hi: 'नग / पीस' },
  { code: 'PACKET', label_en: 'Packet / Pack', label_hi: 'पैकेट' },
  { code: 'DOZEN', label_en: 'Dozen (12 pcs)', label_hi: 'दर्जन' },
  { code: 'BOX', label_en: 'Box / Dabba', label_hi: 'बॉक्स / डब्बा' },
  { code: 'BOTTLE', label_en: 'Bottle', label_hi: 'बोतल' },
  { code: 'BUNDLE', label_en: 'Bundle / Gaddi', label_hi: 'गड्डी / गुच्छा' },
  { code: 'PAIR', label_en: 'Pair / Jodi', label_hi: 'जोड़ी' },
  { code: 'BAG', label_en: 'Bag / Bori', label_hi: 'बोरी / बैग' },
  { code: 'SACK', label_en: 'Sack / Katta', label_hi: 'कट्टा' },
  { code: 'CARTON', label_en: 'Carton / Peti', label_hi: 'पेटी / कार्टन' },
  { code: 'CRATE', label_en: 'Crate', label_hi: 'क्रेट' },
];

const SAMPLE_PROMPTS = [
  { lang: 'English', text: 'Add 5 kg potatoes at 30 rupees per kg.' },
  { lang: 'Hindi', text: 'दस किलो बासमती चावल पैंसठ रुपये किलो में डाल दो।' },
  { lang: 'Hinglish', text: 'Das kilo pyaaz 40 rupaye kilo.' },
  { lang: 'Mixed', text: 'Add 2 litre दूध at 60 rupees per litre.' },
  { lang: 'Packaged', text: 'Add 50 packets of Parle-G biscuits at 10 rupees each.' },
  { lang: 'Bulk (3 Items)', text: 'Add 5 kilo potatoes at 30 rupees per kilo, 3 kilo onions at 40 rupees per kilo, and 10 kilo tomatoes at 25 rupees per kilo.' },
  { lang: 'Voice Edit', text: 'Increase potato stock by 10 kilo' },
  { lang: 'Voice Search', text: 'Show all vegetables' },
];

export default function VendorProducts() {
  const { user, refresh } = useAuth();
  const [products, setProducts] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Voice Inventory State
  const [voiceConfig, setVoiceConfig] = useState({ enabled: true, supported_units: DEFAULT_UNITS });
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState('auto'); // 'auto' | 'add' | 'bulk' | 'edit' | 'search'
  const [speechLang, setSpeechLang] = useState('hi-IN'); // 'hi-IN' | 'en-IN'
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [micError, setMicError] = useState('');
  const [processingVoice, setProcessingVoice] = useState(false);

  // Voice Step: 'record' | 'verify_add' | 'verify_edit'
  const [voiceStep, setVoiceStep] = useState('record');
  const [voiceSessionId, setVoiceSessionId] = useState(null);
  const [detectedLanguage, setDetectedLanguage] = useState('');
  const [verifiedItems, setVerifiedItems] = useState([]);
  const [editProposal, setEditProposal] = useState(null);
  const [publishingVoice, setPublishingVoice] = useState(false);

  // Voice Inventory Filter (when vendor searches their inventory by voice)
  const [voiceFilterSummary, setVoiceFilterSummary] = useState(null);
  const [voiceFilteredIds, setVoiceFilteredIds] = useState(null);

  // Inventory History Drawer
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);

  // Point 2 & Point 3: Inventory Trust & Frictionless Inventory States
  const [onboarding, setOnboarding] = useState(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('name,price,unit,category,stock_quantity\nMaggi Masala 2-Minute,14,packet,groceries,25\nAmul Taaza Milk 500ml,27,packet,dairy,30');
  const [importingCsv, setImportingCsv] = useState(false);
  const [assistModalOpen, setAssistModalOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [invoiceTextInput, setInvoiceTextInput] = useState('10 packet Maggi 14 rupees\n20 Dairy Milk 20 rupees\nSurf Excel 1 kg 135 rupees');
  const [extractedAssistItems, setExtractedAssistItems] = useState([]);
  const [confirmingAll, setConfirmingAll] = useState(false);

  // Smart Product Entry & Non-Destructive Active Cap States (Part 3.4 & Part 4.6)
  const [templates, setTemplates] = useState([]);
  const [templateFilter, setTemplateFilter] = useState('');
  const [quickSelectedTemplate, setQuickSelectedTemplate] = useState(null);
  const [quickPrice, setQuickPrice] = useState('');
  const [quickUnit, setQuickUnit] = useState('kg');
  const [inlinePriceId, setInlinePriceId] = useState(null);
  const [inlinePriceVal, setInlinePriceVal] = useState('');
  const [selectActiveOpen, setSelectActiveOpen] = useState(false);
  const [selectedActiveIds, setSelectedActiveIds] = useState([]);
  const [savingActiveCap, setSavingActiveCap] = useState(false);

  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const liveTranscriptRef = useRef('');
  const timerRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get('/vendor/products');
      setProducts(data);
    } catch {
      // ignore
    }
    try {
      const { data } = await api.get('/vendor/onboarding-progress');
      setOnboarding(data);
    } catch {
      // ignore
    }
    try {
      const { data } = await api.get('/vendor/product-templates');
      setTemplates(data.templates || []);
    } catch {
      // ignore
    }
  };

  const handleQuickPublishTemplate = async (keepOpen = false) => {
    if (!quickSelectedTemplate || !quickPrice || parseFloat(quickPrice) <= 0) {
      toast.error('Please enter a valid price in ₹');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/vendor/products', {
        name: quickSelectedTemplate.name_en || quickSelectedTemplate.name,
        category: quickSelectedTemplate.category || 'vegetables',
        price: parseFloat(quickPrice),
        unit: quickUnit || quickSelectedTemplate.unit || 'kg',
        description: '',
        in_stock: true,
        is_featured: false,
      });
      setProducts([data, ...products]);
      toast.success(`Published ${data.name} at ₹${data.price}/${data.unit}!`);
      if (!keepOpen) {
        setQuickSelectedTemplate(null);
        setQuickPrice('');
      } else {
        setQuickPrice('');
      }
      refresh();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Failed to add product');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInlinePrice = async (p) => {
    const newPrice = parseFloat(inlinePriceVal);
    if (isNaN(newPrice) || newPrice <= 0) {
      toast.error('Enter a valid price');
      return;
    }
    try {
      const { data } = await api.patch(`/vendor/products/${p.id}`, { price: newPrice });
      setProducts(products.map((x) => (x.id === p.id ? { ...x, ...data } : x)));
      setInlinePriceId(null);
      toast.success(`Updated ${p.name} price to ₹${newPrice}`);
    } catch {
      toast.error('Could not update price');
    }
  };

  const handleDuplicateProduct = (p) => {
    setForm({
      name: `${p.name}`,
      category: p.category || '',
      price: p.price,
      unit: p.unit || 'kg',
      description: p.description || '',
      in_stock: true,
      is_featured: false,
    });
    setEditingId(null);
    setDialog(true);
  };

  const openSelectActiveCapModal = () => {
    const cap = user?.free_product_cap || (user?.vendor_type === 'cart_vendor' ? 20 : 30);
    const activeIds = products.filter((p) => p.in_stock).slice(0, cap).map((p) => p.id);
    setSelectedActiveIds(activeIds);
    setSelectActiveOpen(true);
  };

  const handleSaveActiveCapSelection = async () => {
    setSavingActiveCap(true);
    try {
      const { data } = await api.post('/vendor/products/select-active', {
        active_product_ids: selectedActiveIds,
      });
      toast.success(data.message || 'Active product selection updated!');
      setSelectActiveOpen(false);
      await load();
      refresh();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Could not update active listings');
    } finally {
      setSavingActiveCap(false);
    }
  };

  const handleConfirmAllUnchanged = async () => {
    setConfirmingAll(true);
    try {
      const { data } = await api.post('/vendor/inventory/confirm-all-unchanged');
      toast.success(`Confirmed ${data.confirmed_count || products.length} products as fresh (🟢)!`);
      await load();
    } catch (e) {
      toast.error('Failed to confirm inventory');
    } finally {
      setConfirmingAll(false);
    }
  };

  const handleConfirmSingleProduct = async (productId) => {
    try {
      await api.post('/vendor/inventory/confirm', { product_ids: [productId], still_available: true });
      toast.success('Product marked Confirmed Recently (🟢)');
      await load();
    } catch {
      toast.error('Could not confirm product');
    }
  };

  const handleCopyPreviousInventory = async () => {
    try {
      const { data } = await api.post('/vendor/inventory/copy-previous');
      toast.success(`Restored ${data.restored_count || 0} products & refreshed catalogue!`);
      await load();
    } catch {
      toast.error('Could not copy previous inventory');
    }
  };

  const handleImportCsv = async () => {
    if (!csvText.trim()) return;
    setImportingCsv(true);
    try {
      const { data } = await api.post('/vendor/inventory/import', { csv_text: csvText });
      toast.success(`Imported: ${data.created} created, ${data.updated} updated`);
      setCsvModalOpen(false);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'CSV import failed');
    } finally {
      setImportingCsv(false);
    }
  };

  const handleLookupBarcode = async () => {
    if (!barcodeInput.trim()) return;
    try {
      const { data } = await api.get(`/vendor/inventory/barcode/${encodeURIComponent(barcodeInput.trim())}`);
      if (data.found && data.item) {
        setExtractedAssistItems([
          ...extractedAssistItems,
          {
            name: data.item.name,
            price: data.item.suggested_price || 20,
            unit: data.item.unit || 'packet',
            category: data.item.category || 'groceries',
            stock_quantity: 10,
          },
        ]);
        toast.success(`Matched barcode: ${data.item.name}`);
      } else {
        toast.info(data.message || 'Barcode not in registry yet — enter details below');
      }
    } catch {
      toast.error('Barcode lookup failed');
    }
  };

  const handleExtractInvoice = async () => {
    if (!invoiceTextInput.trim()) return;
    try {
      const { data } = await api.post('/vendor/inventory/extract-invoice', { raw_text: invoiceTextInput });
      const mapped = (data.extracted_items || []).map((it) => ({
        name: it.product_name_en || it.raw_segment,
        price: it.selling_price || 20,
        unit: (it.stock_unit || 'packet').toLowerCase(),
        category: it.category || 'groceries',
        stock_quantity: it.stock_quantity || 10,
        confidence: it.extraction_confidence,
        requires_confirmation: it.requires_confirmation,
      }));
      setExtractedAssistItems(mapped);
      toast.success(`Extracted ${mapped.length} line items for review`);
    } catch {
      toast.error('Extraction failed');
    }
  };

  const handlePublishAssistItems = async () => {
    if (!extractedAssistItems.length) return;
    try {
      const { data } = await api.post('/vendor/inventory/import', { rows: extractedAssistItems });
      toast.success(`Published: ${data.created} created, ${data.updated} updated`);
      setExtractedAssistItems([]);
      setAssistModalOpen(false);
      await load();
    } catch {
      toast.error('Could not save extracted items');
    }
  };

  const loadVoiceConfig = async () => {
    try {
      const { data } = await api.get('/voice-inventory/config');
      setVoiceConfig(data);
    } catch {
      // fallback to default
    }
  };

  const loadHistory = async () => {
    try {
      const { data } = await api.get('/voice-inventory/history?limit=25');
      setHistoryItems(data.history || []);
    } catch {
      toast.error('Failed to load voice inventory history');
    }
  };

  useEffect(() => {
    load();
    loadVoiceConfig();
    return () => {
      stopMicrophone();
    };
  }, []);

  const openCreate = () => { setForm(empty); setEditingId(null); setDialog(true); };
  const openEdit = (p) => {
    setForm({
      name: p.name,
      category: p.category || '',
      price: p.price,
      unit: p.unit || '',
      description: p.description || '',
      in_stock: p.in_stock,
      is_featured: !!p.is_featured,
    });
    setEditingId(p.id);
    setDialog(true);
  };

  const save = async (e, keepOpen = false) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, price: parseFloat(form.price) };
      if (editingId) {
        const { data } = await api.patch(`/vendor/products/${editingId}`, payload);
        setProducts(products.map(p => p.id === editingId ? data : p));
        toast.success('Product updated');
        setDialog(false);
      } else {
        const { data } = await api.post('/vendor/products', payload);
        setProducts([data, ...products]);
        toast.success('Product added');
        if (keepOpen) {
          setForm({ ...empty, category: form.category, unit: form.unit });
        } else {
          setDialog(false);
        }
      }
      refresh();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally { setSaving(false); }
  };

  const toggleAvail = async (p) => {
    try {
      const { data } = await api.patch(`/vendor/products/${p.id}`, { in_stock: !p.in_stock });
      setProducts(products.map(x => x.id === p.id ? data : x));
    } catch (e) { toast.error('Failed to update'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    await api.delete(`/vendor/products/${id}`);
    setProducts(products.filter(p => p.id !== id));
    toast.success('Deleted');
  };

  // ---------- Microphone & Web Speech API + MediaRecorder AI STT Fallback ----------
  const startMicrophone = async () => {
    setMicError('');
    liveTranscriptRef.current = transcript || '';
    audioChunksRef.current = [];

    setIsRecording(true);
    setRecordingSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => {
        const maxSec = voiceConfig?.max_recording_seconds || 60;
        if (prev + 1 >= maxSec) {
          stopMicrophone();
          return maxSec;
        }
        return prev + 1;
      });
    }, 1000);

    // 1. Start MediaRecorder to guarantee audio capture even if browser WebSpeech is silent/offline
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType =
          typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.('audio/webm')
            ? 'audio/webm'
            : '';
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };
        recorder.onstop = async () => {
          const chunks = audioChunksRef.current;
          try {
            stream.getTracks().forEach((tr) => tr.stop());
          } catch {}
          if (!liveTranscriptRef.current.trim() && chunks.length > 0) {
            try {
              const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
              const base64Audio = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(String(reader.result || ''));
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              const { data } = await api.post('/ai/stt', {
                audio_base64: base64Audio,
                mime_type: blob.type || 'audio/webm',
                language: speechLang,
              });
              if (data?.transcript && data.transcript.trim()) {
                liveTranscriptRef.current = data.transcript.trim();
                setTranscript(data.transcript.trim());
                toast.success('Voice transcribed into product box');
              }
            } catch {}
          }
        };
        mediaRecorderRef.current = recorder;
        recorder.start(250);
      } catch (permErr) {
        setMicError('Microphone permission was denied. Please allow microphone access in your browser address bar, or type/select a spoken phrase below.');
        setIsRecording(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }
    }

    // 2. Also start Browser SpeechRecognition in parallel for instant live streaming
    const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = speechLang;
        recognition.continuous = true;
        recognition.interimResults = true;

        let finalTranscript = transcript ? transcript + ' ' : '';

        recognition.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + ' ';
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          const combined = (finalTranscript + interim).trim();
          if (combined) {
            liveTranscriptRef.current = combined;
            setTranscript(combined);
          }
        };

        recognition.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'permission-denied') {
            setMicError('Microphone permission was denied. Please allow microphone access in your browser address bar.');
            stopMicrophone();
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err) {
        // MediaRecorder is still running and will transcribe via /api/ai/stt on stop
      }
    }
  };

  const stopMicrophone = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  const openVoiceModal = (initialMode = 'auto') => {
    stopMicrophone();
    setVoiceMode(initialMode);
    setVoiceStep('record');
    setTranscript('');
    setMicError('');
    setVerifiedItems([]);
    setEditProposal(null);
    setVoiceModalOpen(true);
  };

  const handleProcessVoice = async () => {
    stopMicrophone();
    if (!transcript.trim()) {
      toast.error('Please speak or enter product details first.');
      return;
    }
    setProcessingVoice(true);
    try {
      const { data } = await api.post('/voice-inventory/process', {
        transcript: transcript.trim(),
        language_hint: speechLang,
        mode_hint: voiceMode,
      });
      setVoiceSessionId(data.session_id);
      setDetectedLanguage(data.detected_language || 'en');

      if (data.intent_type === 'search_inventory') {
        const matched = data.search_results || [];
        setVoiceFilterSummary(`${data.filter_summary} (${matched.length} matching products)`);
        setVoiceFilteredIds(new Set(matched.map((m) => m.id)));
        setVoiceModalOpen(false);
        toast.success(`Voice search applied: ${data.filter_summary}`);
        return;
      }

      if (data.intent_type === 'edit_inventory') {
        setEditProposal(data.edit_proposal);
        setVoiceStep('verify_edit');
        return;
      }

      // Default: add_products / bulk
      const items = (data.items || []).map((it) => ({
        ...it,
        stock_quantity: it.stock_quantity !== null && it.stock_quantity !== undefined ? it.stock_quantity : '',
        selling_price: it.selling_price !== null && it.selling_price !== undefined ? it.selling_price : '',
        in_stock: it.in_stock ?? true,
        is_featured: false,
        image_url: '',
        existing_product_id: it.existing_product?.id || null,
        duplicate_action: it.duplicate_detected ? 'update_existing' : 'create_new',
      }));
      setVerifiedItems(items);
      setVoiceStep('verify_add');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Failed to process voice input');
    } finally {
      setProcessingVoice(false);
    }
  };

  const updateVerifiedItem = (idx, field, value) => {
    setVerifiedItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const handleImageUploadForItem = (idx, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      updateVerifiedItem(idx, 'image_url', e.target?.result || '');
      toast.success('Product photo attached');
    };
    reader.readAsDataURL(file);
  };

  const handleVerifyAndPublish = async (saveAsDraft = false) => {
    // Validate required fields before publishing
    for (const it of verifiedItems) {
      if (it.duplicate_action === 'skip') continue;
      if (!it.product_name_en?.trim()) {
        toast.error('Product Name (English) cannot be empty.');
        return;
      }
      if (it.selling_price === '' || Number(it.selling_price) <= 0) {
        toast.error(`Please enter a valid Selling Price (₹) for "${it.product_name_en}".`);
        return;
      }
      if (it.stock_quantity === '' || Number(it.stock_quantity) < 0) {
        toast.error(`Please enter a valid Stock Quantity for "${it.product_name_en}".`);
        return;
      }
    }

    setPublishingVoice(true);
    try {
      const payload = {
        session_id: voiceSessionId,
        items: verifiedItems.map((it) => ({
          canonical_product_id: it.canonical_product_id,
          canonical_product_name: it.canonical_product_name || it.product_name_en,
          product_name_en: it.product_name_en.trim(),
          product_name_hi: (it.product_name_hi || it.product_name_en).trim(),
          product_name_hinglish: (it.product_name_hinglish || it.product_name_en).trim(),
          brand_or_variant: it.brand_or_variant || null,
          category: it.category || 'other',
          stock_quantity: parseFloat(it.stock_quantity),
          stock_unit: it.stock_unit || 'KG',
          package_size: it.package_size || null,
          selling_price: parseFloat(it.selling_price),
          price_unit: it.price_unit || it.stock_unit || 'KG',
          in_stock: Boolean(it.in_stock),
          is_featured: Boolean(it.is_featured),
          description: it.description || '',
          image_url: it.image_url || null,
          duplicate_action: it.duplicate_action || 'create_new',
          existing_product_id: it.existing_product_id || null,
          save_as_draft: Boolean(saveAsDraft),
        })),
      };

      const { data } = await api.post('/voice-inventory/verify-and-publish', payload);
      await load();
      refresh();
      setVoiceModalOpen(false);
      if (saveAsDraft) {
        toast.success(`${data.published_count} product(s) saved as draft!`);
      } else if (data.moderation_status === 'pending_review') {
        toast.success(`${data.published_count} product(s) submitted for admin moderation!`);
      } else {
        toast.success(`${data.published_count} product(s) verified & published in English, Hindi & Hinglish!`);
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Failed to publish products');
    } finally {
      setPublishingVoice(false);
    }
  };

  const handleConfirmVoiceEdit = async () => {
    if (!editProposal?.matched_product?.id) {
      toast.error('No matching product selected in your inventory.');
      return;
    }
    setPublishingVoice(true);
    try {
      await api.post('/voice-inventory/confirm-edit', {
        session_id: voiceSessionId,
        product_id: editProposal.matched_product.id,
        operation: editProposal.operation,
        stock_delta: editProposal.stock_delta !== undefined ? parseFloat(editProposal.stock_delta) : null,
        new_stock_quantity: editProposal.new_stock_quantity !== undefined ? parseFloat(editProposal.new_stock_quantity) : null,
        new_price: editProposal.new_price !== undefined ? parseFloat(editProposal.new_price) : null,
        new_in_stock: editProposal.new_in_stock,
        reason: `Voice edit: ${transcript}`,
      });
      await load();
      refresh();
      setVoiceModalOpen(false);
      toast.success('Inventory updated via voice command!');
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || 'Failed to apply voice edit');
    } finally {
      setPublishingVoice(false);
    }
  };

  if (!user) return null;
  const limit = user.product_limit; // null if unlimited
  const canAdd = limit == null || products.length < limit;
  const isPro = user.is_pro;
  const displayedProducts = voiceFilteredIds
    ? products.filter((p) => voiceFilteredIds.has(p.id))
    : products;

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <span className="chip chip-amber">Products & AI Voice Inventory</span>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-stone-900 mt-3">Your product catalogue</h1>
          <p className="text-stone-600 text-sm mt-1">
            Speak naturally in Hindi, English, or Hinglish to add or update products — or type manually.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant="outline" className="border-stone-300">{products.length}{limit ? ` / ${limit}` : ''} listed</Badge>

          {voiceConfig.enabled !== false && (
            <Button
              type="button"
              data-testid="add-product-voice-btn"
              disabled={!canAdd}
              onClick={() => openVoiceModal('auto')}
              className="rounded-full bg-gradient-to-r from-[#0A6E3B] to-emerald-600 hover:from-[#075030] hover:to-emerald-700 text-white shadow-md px-5"
            >
              <Mic size={16} className="mr-2 animate-pulse" /> Speak Product Details (AI Voice)
            </Button>
          )}

          <Dialog open={dialog} onOpenChange={setDialog}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} disabled={!canAdd} variant="outline" className="rounded-full border-stone-300 text-stone-800 hover:border-[#0A6E3B]">
                <Plus size={16} className="mr-1.5" /> Type Product Manually
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit product' : 'Add new product (Manual)'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={save} className="space-y-4">
                <Row label="Name"><Input data-testid={PRODUCT_FORM.nameInput} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Row>
                <div className="grid grid-cols-2 gap-3">
                  <Row label="Price (₹)"><Input data-testid={PRODUCT_FORM.priceInput} required type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Row>
                  <Row label="Unit"><Input data-testid={PRODUCT_FORM.unitInput} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg, L, piece" /></Row>
                </div>
                <Row label="Category (optional)"><Input data-testid={PRODUCT_FORM.categoryInput} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Vegetables, Dairy, Grains…" /></Row>
                <Row label="Description (optional)"><Textarea data-testid={PRODUCT_FORM.descriptionInput} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></Row>
                <div className="flex items-center justify-between p-3 rounded-lg bg-stone-50 border border-stone-100">
                  <Label className="text-sm">In stock</Label>
                  <Switch data-testid={PRODUCT_FORM.inStockSwitch} checked={form.in_stock} onCheckedChange={(v) => setForm({ ...form, in_stock: v })} />
                </div>
                <div className={`flex items-center justify-between p-3 rounded-lg border ${isPro ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-100 opacity-70'}`}>
                  <Label className="text-sm flex items-center gap-1.5"><Sparkles size={13} className="text-amber-700" /> Featured (Pro)</Label>
                  <Switch data-testid={PRODUCT_FORM.featuredSwitch} disabled={!isPro} checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />
                </div>
                <DialogFooter className="flex flex-wrap gap-2">
                  <Button data-testid={PRODUCT_FORM.cancelButton} type="button" variant="ghost" onClick={() => setDialog(false)}>Cancel</Button>
                  {!editingId && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={(e) => save(e, true)}
                      className="rounded-full border-emerald-600 text-[#0A6E3B]"
                    >
                      Save & Add Another
                    </Button>
                  )}
                  <Button data-testid={PRODUCT_FORM.submitButton} type="submit" disabled={saving} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add product'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setHistoryOpen(true);
              loadHistory();
            }}
            className="rounded-full text-stone-600 hover:text-[#0A6E3B]"
          >
            <History size={15} className="mr-1.5" /> Voice History
          </Button>
        </div>
      </div>

      {/* Point 2 & Point 3: Onboarding Progress & Frictionless Inventory Trust Toolbar */}
      <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Inventory Freshness & Onboarding</span>
            {onboarding && (
              <Badge className="bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11px]">
                {onboarding.completion_pct}% Onboarding Complete ({onboarding.completed_steps}/{onboarding.total_steps})
              </Badge>
            )}
          </div>
          {onboarding?.steps && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {onboarding.steps.map((s) => (
                <span
                  key={s.key}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    s.completed ? 'bg-emerald-100 text-emerald-900' : 'bg-stone-100 text-stone-500'
                  }`}
                >
                  {s.completed ? '✓' : '○'} {s.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={handleConfirmAllUnchanged}
            disabled={confirmingAll || products.length === 0}
            data-testid="confirm-all-unchanged-btn"
            className="rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
          >
            <CheckCircle2 size={13} className="mr-1.5" />
            {confirmingAll ? 'Confirming…' : '🟢 Confirm All Unchanged'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCsvModalOpen(true)}
            data-testid="open-csv-import-btn"
            className="rounded-full border-stone-300 text-stone-700 text-xs"
          >
            CSV / Bulk Import
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAssistModalOpen(true)}
            data-testid="open-assist-extract-btn"
            className="rounded-full border-stone-300 text-stone-700 text-xs"
          >
            Barcode / Invoice Assist
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleCopyPreviousInventory}
            className="rounded-full text-stone-600 text-xs"
          >
            <RotateCcw size={13} className="mr-1" /> Copy Previous
          </Button>
        </div>
      </div>

      {/* Prominent AI Voice Entry Banner Card (Section 3) */}
      {voiceConfig.enabled !== false && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/90 via-white to-amber-50/60 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#0A6E3B] text-white grid place-items-center shrink-0 shadow-sm">
              <Mic size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-lg font-semibold text-stone-900">Add Product Using Voice (AI Multilingual)</h2>
                <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[10px]">English · हिन्दी · Hinglish</Badge>
              </div>
              <p className="text-xs text-stone-600 mt-1">
                Try saying: <span className="font-medium text-stone-800">"Add 5 kg potatoes at 30 rupees per kg"</span> or{' '}
                <span className="font-medium text-stone-800">"दस किलो बासमती चावल पैंसठ रुपये किलो में डाल दो"</span> or{' '}
                <span className="font-medium text-stone-800">"Das kilo pyaaz 40 rupaye kilo"</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => openVoiceModal('add')}
              disabled={!canAdd}
              className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs"
            >
              <Mic size={13} className="mr-1.5" /> 🎙 Speak Product Details
            </Button>
            {voiceConfig.bulk_entry_enabled !== false && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openVoiceModal('bulk')}
                disabled={!canAdd}
                className="rounded-full border-emerald-300 text-emerald-900 hover:bg-emerald-100/50 text-xs"
              >
                <Layers size={13} className="mr-1.5" /> Bulk Voice Entry
              </Button>
            )}
            {voiceConfig.voice_editing_enabled !== false && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openVoiceModal('edit')}
                className="rounded-full border-stone-300 text-stone-700 text-xs"
              >
                <Wand2 size={13} className="mr-1.5" /> Voice Edit Stock/Price
              </Button>
            )}
            {voiceConfig.voice_search_enabled !== false && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openVoiceModal('search')}
                className="rounded-full border-stone-300 text-stone-700 text-xs"
              >
                <Search size={13} className="mr-1.5" /> Voice Search
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Voice Search Filter Banner */}
      {voiceFilterSummary && (
        <div className="mt-4 rounded-xl bg-emerald-900 text-white px-4 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Search size={14} />
            <span>Active Voice Search Filter: <strong>{voiceFilterSummary}</strong></span>
          </div>
          <button
            type="button"
            onClick={() => {
              setVoiceFilterSummary(null);
              setVoiceFilteredIds(null);
            }}
            className="inline-flex items-center gap-1 underline hover:text-emerald-200"
          >
            <X size={13} /> Clear Filter
          </button>
        </div>
      )}

      {!canAdd && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-amber-900">
            <strong>Free Plan Active Cap Reached ({limit} active products).</strong> None of your products or business history are ever deleted! You can choose which {limit} listings stay active in search, or upgrade to Pro for unlimited active listings.
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" onClick={openSelectActiveCapModal} className="rounded-full border-amber-400 text-amber-950 bg-white">
              Choose Active Products ({limit})
            </Button>
            <Link to="/vendor/pricing"><Button className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white">Upgrade to Pro</Button></Link>
          </div>
        </div>
      )}

      {/* Part 3.4: Smart 1-Tap Product Templates (Select item -> Enter price -> Publish) */}
      {canAdd && templates.length > 0 && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#0A6E3B]">⚡ Quick 1-Tap Product Templates</div>
              <p className="text-xs text-stone-500">Tap a common item, check/enter your price, and publish in seconds — no typing needed.</p>
            </div>
            <Input
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              placeholder="Filter templates (e.g. Tomato, Milk, Maggi)..."
              className="h-8 text-xs max-w-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {templates
              .filter((t) => !templateFilter.trim() || t.name.toLowerCase().includes(templateFilter.toLowerCase()) || t.name_hinglish?.toLowerCase().includes(templateFilter.toLowerCase()))
              .slice(0, 12)
              .map((tpl) => {
                const isSelected = quickSelectedTemplate?.name_en === tpl.name_en;
                return (
                  <button
                    key={tpl.name_en}
                    type="button"
                    onClick={() => {
                      setQuickSelectedTemplate(tpl);
                      setQuickPrice(String(tpl.suggested_price || ''));
                      setQuickUnit(tpl.unit || 'kg');
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      isSelected
                        ? 'bg-[#0A6E3B] text-white border-[#0A6E3B] shadow-xs'
                        : 'bg-stone-50 text-stone-800 border-stone-200 hover:border-emerald-500'
                    }`}
                  >
                    + {tpl.name} · ₹{tpl.suggested_price}/{tpl.unit}
                  </button>
                );
              })}
          </div>
          {quickSelectedTemplate && (
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center gap-3">
              <div className="text-xs font-semibold text-stone-900">
                Adding: <span className="text-[#0A6E3B]">{quickSelectedTemplate.name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-stone-600">Price (₹):</span>
                <Input
                  type="number"
                  value={quickPrice}
                  onChange={(e) => setQuickPrice(e.target.value)}
                  className="h-8 w-24 text-xs bg-white"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-stone-600">Unit:</span>
                <Input
                  value={quickUnit}
                  onChange={(e) => setQuickUnit(e.target.value)}
                  className="h-8 w-20 text-xs bg-white"
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => handleQuickPublishTemplate(false)}
                className="h-8 rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs"
              >
                Publish Now
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => handleQuickPublishTemplate(true)}
                className="h-8 rounded-full border-emerald-600 text-[#0A6E3B] text-xs bg-white"
              >
                Save & Add Another
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setQuickSelectedTemplate(null)}
                className="h-8 text-xs text-stone-500"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead>Product (Multilingual)</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Selling Price</TableHead>
              <TableHead>Available</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedProducts.map((p) => (
              <TableRow key={p.id} className="even:bg-stone-50/40">
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    {p.image_url && (
                      <img src={p.image_url} alt={p.name} className="w-9 h-9 rounded-lg object-cover border border-stone-200 shrink-0" />
                    )}
                    <div>
                      <div className="font-medium text-stone-900 flex items-center gap-1.5 flex-wrap">
                        <span>{p.name}</span>
                        {p.is_featured && <Sparkles size={12} className="inline text-amber-600" />}
                        {p.created_via === 'voice' && (
                          <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] px-1.5 py-0">🎙 Voice</Badge>
                        )}
                        {p.listing_status === 'draft' && (
                          <Badge className="bg-amber-100 text-amber-900 border-0 text-[9px]">Draft</Badge>
                        )}
                        {p.moderation_status === 'pending_review' && (
                          <Badge className="bg-amber-100 text-amber-900 border-0 text-[9px]">Pending Review</Badge>
                        )}
                      </div>
                      {(p.name_hi || p.name_hinglish) && (
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          {p.name_hi && <span>हिन्दी: <strong>{p.name_hi}</strong></span>}
                          {p.name_hinglish && <span className="ml-2">· Hinglish: <strong>{p.name_hinglish}</strong></span>}
                        </div>
                      )}
                      {p.description && <div className="text-xs text-stone-400 mt-0.5">{p.description}</div>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-stone-600 text-sm capitalize">{p.category || '—'}</TableCell>
                <TableCell className="text-stone-700 text-sm">
                  {p.stock_quantity !== undefined && p.stock_quantity !== null
                    ? `${p.stock_quantity} ${p.stock_unit || p.unit || ''}`
                    : '—'}
                </TableCell>
                <TableCell className="font-semibold text-[#0A6E3B]">
                  {inlinePriceId === p.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={inlinePriceVal}
                        onChange={(e) => setInlinePriceVal(e.target.value)}
                        className="h-7 w-20 text-xs"
                        autoFocus
                      />
                      <Button size="sm" onClick={() => handleSaveInlinePrice(p)} className="h-7 px-2 bg-[#0A6E3B] text-white text-[10px]">
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setInlinePriceId(null)} className="h-7 px-1.5 text-[10px]">
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setInlinePriceId(p.id);
                        setInlinePriceVal(String(p.price));
                      }}
                      title="Tap to quickly update price"
                      className="hover:underline text-left"
                    >
                      ₹{p.price}<span className="text-xs text-stone-500 ml-1">{p.unit ? `/${p.unit}` : ''}</span>
                      <span className="ml-1 text-[10px] text-stone-400">✎</span>
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  <Switch data-testid={PRODUCT_FORM.toggleAvailability} checked={p.in_stock} onCheckedChange={() => toggleAvail(p)} />
                </TableCell>
                <TableCell className="text-xs text-stone-500">
                  <div>{new Date(p.updated_at).toLocaleDateString()}</div>
                  <div className="mt-0.5 text-[10px] font-medium text-emerald-800">
                    {p.freshness_badge || '🟢 Confirmed recently'}
                  </div>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleConfirmSingleProduct(p.id)}
                    title="Confirm still available (boosts freshness score)"
                    className="h-7 px-2 text-[11px] text-emerald-700 hover:bg-emerald-50 mr-1"
                  >
                    ✓ Confirm
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDuplicateProduct(p)}
                    title="Duplicate product"
                    className="h-7 px-2 text-[11px] text-stone-600 hover:bg-stone-100 mr-1"
                  >
                    Duplicate
                  </Button>
                  <Button data-testid={PRODUCT_FORM.editButton} variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil size={14} /></Button>
                  <Button data-testid={PRODUCT_FORM.deleteButton} variant="ghost" size="icon" onClick={() => remove(p.id)} className="text-red-600 hover:text-red-700"><Trash2 size={14} /></Button>
                </TableCell>
              </TableRow>
            ))}
            {displayedProducts.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-stone-500 text-sm">
                  No products found. Click "Speak Product Details (AI Voice)" or "Type Product Manually" to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Part 4.6: Non-Destructive Active Listing Cap Selector Modal */}
      <Dialog open={selectActiveOpen} onOpenChange={setSelectActiveOpen}>
        <DialogContent className="bg-white max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose Which Products Stay Active in Search</DialogTitle>
            <DialogDescription>
              Your Free plan supports up to {limit || 30} active listings. Select up to {limit || 30} products below to keep live. Unselected products are safely paused and never deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-80 overflow-y-auto">
            <div className="text-xs font-semibold text-stone-700">
              Selected: {selectedActiveIds.length} / {limit || 30}
            </div>
            {products.map((p) => {
              const checked = selectedActiveIds.includes(p.id);
              return (
                <label key={p.id} className="flex items-center justify-between p-2.5 rounded-xl border border-stone-200 bg-stone-50 text-xs cursor-pointer">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (selectedActiveIds.length >= (limit || 30)) {
                            toast.info(`You can select up to ${limit || 30} products on the Free plan.`);
                            return;
                          }
                          setSelectedActiveIds([...selectedActiveIds, p.id]);
                        } else {
                          setSelectedActiveIds(selectedActiveIds.filter((id) => id !== p.id));
                        }
                      }}
                    />
                    <span className="font-medium text-stone-900">{p.name}</span>
                  </div>
                  <span className="text-[#0A6E3B] font-semibold">₹{p.price}/{p.unit || 'unit'}</span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelectActiveOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveActiveCapSelection} disabled={savingActiveCap} className="rounded-full bg-[#0A6E3B] text-white">
              {savingActiveCap ? 'Saving…' : 'Save Active Selection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Point 3: CSV / Bulk Import Modal */}
      <Dialog open={csvModalOpen} onOpenChange={setCsvModalOpen}>
        <DialogContent className="bg-white max-w-xl">
          <DialogHeader>
            <DialogTitle>CSV / Bulk Inventory Import</DialogTitle>
            <DialogDescription>
              Paste CSV rows (`name,price,unit,category,stock_quantity`). Duplicate items automatically update existing products and refresh inventory confidence to 🟢 Confirmed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="font-mono text-xs"
              placeholder="name,price,unit,category,stock_quantity"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCsvModalOpen(false)}>Cancel</Button>
            <Button onClick={handleImportCsv} disabled={importingCsv} className="rounded-full bg-[#0A6E3B] text-white">
              {importingCsv ? 'Importing…' : 'Import & Confirm Inventory'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Point 3: Barcode & Invoice/Text-Assisted Extraction Modal */}
      <Dialog open={assistModalOpen} onOpenChange={setAssistModalOpen}>
        <DialogContent className="bg-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Barcode & Invoice-Assisted Inventory Extraction</DialogTitle>
            <DialogDescription>
              Scan/enter an EAN/UPC barcode or paste wholesale bill / distributor invoice lines. Low-confidence items are flagged for confirmation before publishing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
              <Label className="text-xs font-semibold">1. Barcode Lookup (EAN / UPC)</Label>
              <div className="flex gap-2">
                <Input
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Enter barcode (e.g., 8901058000290)"
                />
                <Button type="button" variant="outline" onClick={handleLookupBarcode}>Lookup</Button>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
              <Label className="text-xs font-semibold">2. Wholesale Bill / Invoice Text Extraction</Label>
              <Textarea
                rows={4}
                value={invoiceTextInput}
                onChange={(e) => setInvoiceTextInput(e.target.value)}
                className="text-xs"
                placeholder="e.g. 10 packet Maggi 14 rupees, 20 Dairy Milk 20 rupees, Surf Excel 1 kg 135"
              />
              <Button type="button" size="sm" onClick={handleExtractInvoice} className="bg-emerald-700 text-white">
                Extract Structured Products
              </Button>
            </div>

            {extractedAssistItems.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-stone-700">Extracted Items ({extractedAssistItems.length}) — Review before publishing:</div>
                {extractedAssistItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border border-stone-200 bg-white text-xs">
                    <div className="col-span-5">
                      <Input
                        value={it.name}
                        onChange={(e) => {
                          const next = [...extractedAssistItems];
                          next[idx].name = e.target.value;
                          setExtractedAssistItems(next);
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        value={it.price}
                        onChange={(e) => {
                          const next = [...extractedAssistItems];
                          next[idx].price = parseFloat(e.target.value) || 0;
                          setExtractedAssistItems(next);
                        }}
                        className="h-8 text-xs"
                        placeholder="₹ Price"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        value={it.unit}
                        onChange={(e) => {
                          const next = [...extractedAssistItems];
                          next[idx].unit = e.target.value;
                          setExtractedAssistItems(next);
                        }}
                        className="h-8 text-xs"
                        placeholder="Unit"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        value={it.stock_quantity}
                        onChange={(e) => {
                          const next = [...extractedAssistItems];
                          next[idx].stock_quantity = parseFloat(e.target.value) || 0;
                          setExtractedAssistItems(next);
                        }}
                        className="h-8 text-xs"
                        placeholder="Qty"
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      {it.requires_confirmation ? (
                        <Badge className="bg-amber-100 text-amber-900 border-0 text-[9px]">Verify</Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-900 border-0 text-[9px]">OK</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssistModalOpen(false)}>Cancel</Button>
            <Button
              disabled={extractedAssistItems.length === 0}
              onClick={handlePublishAssistItems}
              className="rounded-full bg-[#0A6E3B] text-white"
            >
              Publish {extractedAssistItems.length} Item(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================================================================== */}
      {/* AI VOICE-TO-INVENTORY MODAL (Recording -> Verification -> Publish)    */}
      {/* ===================================================================== */}
      <Dialog
        open={voiceModalOpen}
        onOpenChange={(open) => {
          if (!open) stopMicrophone();
          setVoiceModalOpen(open);
        }}
      >
        <DialogContent className="bg-white max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-display">
              <Mic size={20} className="text-[#0A6E3B]" />
              {voiceStep === 'record' && 'Add or Update Products Using Voice'}
              {voiceStep === 'verify_add' && 'Verify Extracted Product Details Before Publishing'}
              {voiceStep === 'verify_edit' && 'Confirm Voice Inventory Update'}
            </DialogTitle>
            <DialogDescription>
              {voiceStep === 'record' && 'Speak naturally in Hindi, English, or Hinglish. Nothing is published until you review and verify.'}
              {voiceStep === 'verify_add' && 'Review the AI-extracted product names, multilingual translations, units, and prices below. Edit any field if needed.'}
              {voiceStep === 'verify_edit' && 'Verify the proposed inventory change before applying it.'}
            </DialogDescription>
          </DialogHeader>

          {/* STEP 1: VOICE RECORDING & TRANSCRIPTION */}
          {voiceStep === 'record' && (
            <div className="space-y-5 py-2">
              {/* Mode & Language Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-50 p-3 rounded-xl border border-stone-200">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-stone-500 mr-1">Mode:</span>
                  {[
                    { id: 'auto', label: 'Auto Detect' },
                    { id: 'add', label: 'Single Product' },
                    { id: 'bulk', label: 'Bulk Products' },
                    { id: 'edit', label: 'Edit Existing Stock/Price' },
                    { id: 'search', label: 'Search Inventory' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setVoiceMode(m.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        voiceMode === m.id ? 'bg-[#0A6E3B] text-white' : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <Languages size={14} className="text-stone-500" />
                  <span className="text-xs text-stone-500">Mic Language:</span>
                  <select
                    value={speechLang}
                    onChange={(e) => setSpeechLang(e.target.value)}
                    className="text-xs border border-stone-300 rounded-lg px-2 py-1 bg-white text-stone-800"
                  >
                    <option value="hi-IN">हिन्दी / Hinglish (hi-IN)</option>
                    <option value="en-IN">English (India) (en-IN)</option>
                  </select>
                </div>
              </div>

              {/* Microphone Button & Waveform Indicator */}
              <div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-6 flex flex-col items-center text-center">
                <button
                  type="button"
                  data-testid="voice-mic-toggle-btn"
                  onClick={isRecording ? stopMicrophone : startMicrophone}
                  className={`w-20 h-20 rounded-full grid place-items-center transition-all shadow-lg ${
                    isRecording
                      ? 'bg-red-600 hover:bg-red-700 text-white ring-8 ring-red-100 animate-pulse'
                      : 'bg-[#0A6E3B] hover:bg-[#075030] text-white ring-8 ring-emerald-100'
                  }`}
                >
                  {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
                </button>

                <div className="mt-3 font-display font-semibold text-base text-stone-900">
                  {isRecording ? (
                    <span className="text-red-600 flex items-center gap-2 justify-center">
                      ● Recording Live ({recordingSeconds}s / {voiceConfig?.max_recording_seconds || 60}s) — Click to Stop
                    </span>
                  ) : (
                    'Click the Microphone to Start Speaking'
                  )}
                </div>

                {/* Animated Waveform Bars while recording */}
                {isRecording && (
                  <div className="mt-3 flex items-center justify-center gap-1 h-6">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((bar) => (
                      <span
                        key={bar}
                        className="w-1.5 bg-red-500 rounded-full animate-bounce"
                        style={{
                          height: `${10 + ((bar * 7) % 16)}px`,
                          animationDelay: `${bar * 0.08}s`,
                        }}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {!isRecording ? (
                    <Button type="button" size="sm" onClick={startMicrophone} className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white text-xs">
                      <Mic size={13} className="mr-1.5" /> Start Recording
                    </Button>
                  ) : (
                    <Button type="button" size="sm" onClick={stopMicrophone} className="rounded-full bg-red-600 hover:bg-red-700 text-white text-xs">
                      <MicOff size={13} className="mr-1.5" /> Stop Recording
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      stopMicrophone();
                      setTranscript('');
                      startMicrophone();
                    }}
                    className="rounded-full text-xs"
                  >
                    <RotateCcw size={13} className="mr-1.5" /> Record Again
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setTranscript('')}
                    className="rounded-full text-xs text-stone-500"
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {micError && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-700" />
                  <span>{micError}</span>
                </div>
              )}

              {/* Editable Transcription Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-widest text-stone-500">
                    Spoken Transcription (You can also edit or type directly here)
                  </Label>
                  {transcript && (
                    <span className="text-[11px] text-emerald-700 font-medium">Ready to process</span>
                  )}
                </div>
                <Textarea
                  data-testid="voice-transcript-input"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={3}
                  placeholder='Speak or type e.g. "Add 5 kg potatoes at 30 rupees per kg" or "पाँच किलो आलू तीस रुपये किलो में डाल दो"'
                  className="text-base font-medium text-stone-900"
                />
              </div>

              {/* Quick Sample Phrases */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                  Click any sample phrase to test immediately:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {SAMPLE_PROMPTS.map((sp, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setTranscript(sp.text)}
                      className="text-left p-2.5 rounded-xl border border-stone-200 hover:border-[#0A6E3B] hover:bg-emerald-50/40 transition-colors text-xs flex items-start gap-2"
                    >
                      <Badge variant="outline" className="shrink-0 text-[10px] border-emerald-300 text-emerald-800">{sp.lang}</Badge>
                      <span className="text-stone-700 font-medium">{sp.text}</span>
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter className="flex items-center justify-between pt-2">
                <Button type="button" variant="ghost" onClick={() => setVoiceModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  data-testid="process-voice-btn"
                  disabled={!transcript.trim() || processingVoice}
                  onClick={handleProcessVoice}
                  className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white px-6"
                >
                  {processingVoice ? 'Processing with AI…' : 'Process Voice & Review Details →'}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* STEP 2A: MANDATORY VENDOR VERIFICATION SCREEN (Single & Bulk Products) */}
          {voiceStep === 'verify_add' && (
            <div className="space-y-5 py-2">
              {/* Recognized Transcript Summary Bar */}
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs text-stone-700">
                  <span className="font-semibold text-stone-500 uppercase mr-2">Recognized Speech ({detectedLanguage.toUpperCase()}):</span>
                  <span className="font-medium text-stone-900">"{transcript}"</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setVoiceStep('record')}
                  className="rounded-full text-xs h-7 shrink-0"
                >
                  <RotateCcw size={12} className="mr-1" /> Edit Speech / Record Again
                </Button>
              </div>

              {/* Verification Cards for each extracted product */}
              <div className="space-y-4">
                {verifiedItems.map((item, idx) => {
                  const confPct = Math.round((item.confidence?.overall || 0.85) * 100);
                  const isHighConf = confPct >= 80 && !item.needs_attention;
                  return (
                    <div
                      key={idx}
                      className={`rounded-2xl border p-5 space-y-4 ${
                        item.needs_attention ? 'border-amber-300 bg-amber-50/20' : 'border-stone-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-[#0A6E3B] text-white border-0 text-xs">
                            Item #{idx + 1}: {item.canonical_product_name}
                          </Badge>
                          <Badge variant="outline" className="text-[11px] border-stone-300">
                            ID: {item.canonical_product_id}
                          </Badge>
                          <Badge
                            className={`border-0 text-[11px] ${
                              isHighConf ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {isHighConf ? (
                              <><CheckCircle2 size={11} className="mr-1" /> High Confidence ({confPct}%)</>
                            ) : (
                              <><AlertTriangle size={11} className="mr-1" /> Needs Verification ({confPct}%)</>
                            )}
                          </Badge>
                        </div>
                        {verifiedItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setVerifiedItems(verifiedItems.filter((_, i) => i !== idx))}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove Item
                          </button>
                        )}
                      </div>

                      {/* Warnings & Ambiguities */}
                      {item.warnings && item.warnings.length > 0 && (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-1">
                          {item.warnings.map((w, wi) => (
                            <div key={wi} className="text-xs text-amber-900 flex items-start gap-1.5 font-medium">
                              <AlertTriangle size={14} className="text-amber-700 shrink-0 mt-0.5" />
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Duplicate Product Resolution Selector (Section 14) */}
                      {item.duplicate_detected && item.existing_product && (
                        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3.5 space-y-2">
                          <div className="text-xs font-semibold text-blue-950">
                            Duplicate Detected: "{item.existing_product.name}" is already in your inventory (Current Price: ₹{item.existing_product.price}/{item.existing_product.unit || 'unit'}, Stock: {item.existing_product.stock_quantity ?? '—'}).
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            {[
                              { val: 'update_existing', label: '1. Update existing stock & price' },
                              { val: 'add_stock', label: '2. Add stock to existing quantity' },
                              { val: 'create_variant', label: '3. Create separate product variant' },
                              { val: 'skip', label: '4. Cancel / Skip this item' },
                            ].map((opt) => (
                              <label
                                key={opt.val}
                                className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer ${
                                  item.duplicate_action === opt.val
                                    ? 'bg-blue-600 text-white border-blue-600 font-medium'
                                    : 'bg-white text-stone-700 border-blue-200'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`dup-action-${idx}`}
                                  value={opt.val}
                                  checked={item.duplicate_action === opt.val}
                                  onChange={() => updateVerifiedItem(idx, 'duplicate_action', opt.val)}
                                  className="sr-only"
                                />
                                <span>{opt.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Multilingual Names Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Row label="Product Name (English) *">
                          <Input
                            value={item.product_name_en}
                            onChange={(e) => updateVerifiedItem(idx, 'product_name_en', e.target.value)}
                            placeholder="e.g. Potato"
                          />
                        </Row>
                        <Row label="Product Name (हिन्दी)">
                          <Input
                            value={item.product_name_hi || ''}
                            onChange={(e) => updateVerifiedItem(idx, 'product_name_hi', e.target.value)}
                            placeholder="e.g. आलू"
                          />
                        </Row>
                        <Row label="Product Name (Hinglish)">
                          <Input
                            value={item.product_name_hinglish || ''}
                            onChange={(e) => updateVerifiedItem(idx, 'product_name_hinglish', e.target.value)}
                            placeholder="e.g. Aloo"
                          />
                        </Row>
                      </div>

                      {/* Category, Stock Quantity, Stock Unit, Selling Price, Price Unit */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <Row label="Category">
                          <select
                            value={item.category || 'other'}
                            onChange={(e) => updateVerifiedItem(idx, 'category', e.target.value)}
                            className="w-full h-9 rounded-md border border-stone-200 bg-white px-2.5 text-sm"
                          >
                            {CATEGORY_OPTIONS.map((c) => (
                              <option key={c.key} value={c.key}>{c.label}</option>
                            ))}
                          </select>
                        </Row>

                        <Row label="Stock Quantity *">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.stock_quantity}
                            onChange={(e) => updateVerifiedItem(idx, 'stock_quantity', e.target.value)}
                            className={item.missing_fields?.includes('stock_quantity') && item.stock_quantity === '' ? 'border-red-400 bg-red-50/40' : ''}
                            placeholder="e.g. 5"
                          />
                        </Row>

                        <Row label="Stock Unit">
                          <select
                            value={item.stock_unit || 'KG'}
                            onChange={(e) => updateVerifiedItem(idx, 'stock_unit', e.target.value)}
                            className="w-full h-9 rounded-md border border-stone-200 bg-white px-2 text-sm"
                          >
                            {(voiceConfig.supported_units || DEFAULT_UNITS).map((u) => (
                              <option key={u.code} value={u.code}>{u.code} — {u.label_en}</option>
                            ))}
                          </select>
                        </Row>

                        <Row label="Selling Price (₹) *">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.selling_price}
                            onChange={(e) => updateVerifiedItem(idx, 'selling_price', e.target.value)}
                            className={item.missing_fields?.includes('selling_price') && item.selling_price === '' ? 'border-red-400 bg-red-50/40' : ''}
                            placeholder="e.g. 30"
                          />
                        </Row>

                        <Row label="Price Unit">
                          <select
                            value={item.price_unit || item.stock_unit || 'KG'}
                            onChange={(e) => updateVerifiedItem(idx, 'price_unit', e.target.value)}
                            className="w-full h-9 rounded-md border border-stone-200 bg-white px-2 text-sm"
                          >
                            {(voiceConfig.supported_units || DEFAULT_UNITS).map((u) => (
                              <option key={u.code} value={u.code}>Per {u.code}</option>
                            ))}
                          </select>
                        </Row>
                      </div>

                      {/* Brand/Variant, Description, Availability & Optional Photo Upload */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <Row label="Brand / Variant (Optional)">
                          <Input
                            value={item.brand_or_variant || ''}
                            onChange={(e) => updateVerifiedItem(idx, 'brand_or_variant', e.target.value)}
                            placeholder="e.g. Parle-G, Amul, Fresh"
                          />
                        </Row>
                        <Row label="Description">
                          <Input
                            value={item.description || ''}
                            onChange={(e) => updateVerifiedItem(idx, 'description', e.target.value)}
                            placeholder="Short description"
                          />
                        </Row>
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer border border-stone-200 rounded-lg px-3 py-2 bg-stone-50 hover:bg-stone-100">
                            <ImageIcon size={14} className="text-stone-600" />
                            <span>{item.image_url ? 'Change Photo' : 'Upload Photo'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleImageUploadForItem(idx, e.target.files?.[0])}
                            />
                          </label>
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs">In Stock</Label>
                            <Switch
                              checked={Boolean(item.in_stock)}
                              onCheckedChange={(v) => updateVerifiedItem(idx, 'in_stock', v)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-200">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setVoiceStep('record')} className="rounded-full">
                    <RotateCcw size={14} className="mr-1.5" /> Record Again
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setVoiceModalOpen(false)}>
                    Cancel
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={publishingVoice}
                    onClick={() => handleVerifyAndPublish(true)}
                    className="rounded-full border-stone-300"
                  >
                    Save as Draft
                  </Button>
                  <Button
                    type="button"
                    data-testid="verify-and-publish-btn"
                    disabled={publishingVoice}
                    onClick={() => handleVerifyAndPublish(false)}
                    className="rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white px-6"
                  >
                    <FileCheck2 size={15} className="mr-1.5" />
                    {publishingVoice ? 'Publishing…' : 'Verify & Publish'}
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}

          {/* STEP 2B: VOICE INVENTORY EDIT CONFIRMATION (Section 19) */}
          {voiceStep === 'verify_edit' && editProposal && (
            <div className="space-y-4 py-2">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 space-y-3">
                <div className="text-xs uppercase tracking-wider text-stone-500 font-semibold">Proposed Voice Inventory Edit</div>
                <div className="text-lg font-display font-semibold text-stone-900">{editProposal.summary}</div>

                {editProposal.matched_product ? (
                  <div className="rounded-xl bg-white border border-stone-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <div className="text-stone-400">Matched Product</div>
                      <div className="font-semibold text-stone-900 mt-0.5">{editProposal.matched_product.name}</div>
                    </div>
                    <div>
                      <div className="text-stone-400">Current Price</div>
                      <div className="font-semibold text-stone-900 mt-0.5">₹{editProposal.matched_product.price}/{editProposal.matched_product.unit || 'unit'}</div>
                    </div>
                    <div>
                      <div className="text-stone-400">Current Stock</div>
                      <div className="font-semibold text-stone-900 mt-0.5">{editProposal.matched_product.stock_quantity ?? '—'}</div>
                    </div>
                    <div>
                      <div className="text-stone-400">Operation</div>
                      <div className="font-semibold text-[#0A6E3B] mt-0.5 uppercase">{editProposal.operation}</div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-900">
                    Could not automatically match an existing product in your inventory. Please select one below:
                    <select
                      className="mt-2 w-full h-9 rounded-md border border-stone-300 bg-white px-2 text-sm"
                      value={editProposal.matched_product?.id || ''}
                      onChange={(e) => {
                        const found = products.find((p) => p.id === e.target.value);
                        setEditProposal({ ...editProposal, matched_product: found });
                      }}
                    >
                      <option value="">-- Select Product --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} (₹{p.price})</option>
                      ))}
                    </select>
                  </div>
                )}

                {editProposal.requires_strong_confirmation && (
                  <div className="rounded-xl bg-red-50 border border-red-300 p-3 text-xs text-red-900 font-semibold">
                    ⚠️ Warning: This voice command will permanently delete the product from your catalogue. Please confirm carefully.
                  </div>
                )}
              </div>

              <DialogFooter className="flex items-center justify-between">
                <Button type="button" variant="outline" onClick={() => setVoiceStep('record')} className="rounded-full">
                  <RotateCcw size={14} className="mr-1.5" /> Record Again
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" onClick={() => setVoiceModalOpen(false)}>Cancel</Button>
                  <Button
                    type="button"
                    disabled={publishingVoice || !editProposal.matched_product}
                    onClick={handleConfirmVoiceEdit}
                    className={`rounded-full text-white ${
                      editProposal.requires_strong_confirmation ? 'bg-red-600 hover:bg-red-700' : 'bg-[#0A6E3B] hover:bg-[#075030]'
                    }`}
                  >
                    {publishingVoice ? 'Applying…' : 'Confirm & Apply Update'}
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Voice Inventory History Modal */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="bg-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History size={18} className="text-[#0A6E3B]" /> Voice Inventory Change History
            </DialogTitle>
            <DialogDescription>
              Audit trail of products added or updated using AI Voice Inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-stone-100">
            {historyItems.map((h) => (
              <div key={h.history_id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-stone-900 uppercase">{h.operation_type?.replace('_', ' ')}</span>
                  <span className="text-stone-500 ml-2">
                    {h.new_value?.name ? `— ${h.new_value.name}` : ''}
                    {h.new_value?.price !== undefined ? ` (₹${h.new_value.price})` : ''}
                    {h.new_value?.stock_quantity !== undefined ? ` · Stock: ${h.new_value.stock_quantity}` : ''}
                  </span>
                </div>
                <div className="text-stone-400">{new Date(h.created_at).toLocaleString()}</div>
              </div>
            ))}
            {historyItems.length === 0 && (
              <div className="py-8 text-center text-stone-400 text-sm">No voice inventory actions recorded yet.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, children }) {
  return <div className="space-y-1.5"><Label className="text-xs uppercase tracking-widest text-stone-500">{label}</Label>{children}</div>;
}
