import React, { useEffect, useState } from 'react';
import { api, formatApiErrorDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Store, ShoppingBag, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';

const SPEND_RANGES = [
  { key: '0-100', label: '₹0 – 100' },
  { key: '101-250', label: '₹101 – 250' },
  { key: '251-500', label: '₹251 – 500' },
  { key: '501-1000', label: '₹501 – 1,000' },
  { key: '1001-2500', label: '₹1,001 – 2,500' },
  { key: '2500+', label: '₹2,500+' },
];

export default function CustomerVisitPrompt() {
  const { user } = useAuth();
  const [promptData, setPromptData] = useState(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('quick'); // 'quick' | 'ocr'
  const [step, setStep] = useState(1); // 1: visited?, 2: bought?, 3: how much?
  const [visited, setVisited] = useState(null);
  const [purchased, setPurchased] = useState(null);
  const [spendRange, setSpendRange] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Receipt OCR State
  const [receiptText, setReceiptText] = useState('');
  const [analyzingReceipt, setAnalyzingReceipt] = useState(false);
  const [extractedData, setExtractedData] = useState(null);

  useEffect(() => {
    if (!user || user.role !== 'consumer') return;
    // Check if there is a pending visit prompt
    const checkPrompt = async () => {
      try {
        const { data } = await api.get('/attribution/prompt-check');
        if (data && data.has_prompt) {
          setPromptData(data);
          setOpen(true);
          setStep(1);
          setMode('quick');
        }
      } catch (err) {
        // silent
      }
    };
    const timer = setTimeout(checkPrompt, 2000);
    return () => clearTimeout(timer);
  }, [user]);

  if (!promptData || !open) return null;

  const handleDeclineVisit = async () => {
    try {
      await api.post('/attribution/confirm-visit-customer', {
        session_id: promptData.session_id,
        visited: false,
        purchased: false,
      });
      setOpen(false);
    } catch {
      setOpen(false);
    }
  };

  const handleConfirmNoPurchase = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post('/attribution/confirm-visit-customer', {
        session_id: promptData.session_id,
        visited: true,
        purchased: false,
      });
      toast.success(`Visit confirmed! You earned +${data.points_earned || 10} HyperLocal points.`);
      setOpen(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPurchase = async () => {
    setSubmitting(true);
    try {
      const exact = customAmount ? parseFloat(customAmount) : null;
      const { data } = await api.post('/attribution/confirm-visit-customer', {
        session_id: promptData.session_id,
        visited: true,
        purchased: true,
        spend_range: spendRange,
        exact_amount: exact,
      });
      toast.success(`Purchase verified! You earned +${data.points_earned || 25} HyperLocal shopper points.`);
      setOpen(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnalyzeReceipt = async () => {
    if (!receiptText.trim()) {
      toast.error('Please enter receipt text or paste bill details');
      return;
    }
    setAnalyzingReceipt(true);
    try {
      const { data } = await api.post('/attribution/receipt/upload', {
        raw_text: receiptText,
        seller_hint: promptData.shop_name,
      });
      setExtractedData(data);
      if (data.extracted?.total_amount) {
        setCustomAmount(String(data.extracted.total_amount));
      }
      toast.success('Receipt analyzed successfully!');
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setAnalyzingReceipt(false);
    }
  };

  const handleConfirmReceipt = async () => {
    setSubmitting(true);
    try {
      const amt = customAmount ? parseFloat(customAmount) : (extractedData?.extracted?.total_amount || 100);
      const { data } = await api.post('/attribution/receipt/confirm', {
        receipt_id: extractedData?.receipt_id,
        seller_id: promptData.seller_id,
        session_id: promptData.session_id,
        amount: amt,
        notes: 'Confirmed via AI Receipt OCR',
      });
      toast.success(`Receipt verified! You earned +${data.points_earned || 25} points.`);
      setOpen(false);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-white sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-emerald-100 grid place-items-center text-[#0A6E3B]">
                <Store size={16} />
              </span>
              <Badge variant="outline" className="text-[10px] border-emerald-300 text-[#0A6E3B]">
                <Sparkles size={9} className="mr-1" /> Earn points
              </Badge>
            </div>
            <div className="flex bg-stone-100 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setMode('quick')}
                className={`px-2 py-1 rounded-md transition-colors ${mode === 'quick' ? 'bg-white shadow text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-700'}`}
              >
                Quick Confirm
              </button>
              <button
                type="button"
                onClick={() => setMode('ocr')}
                className={`px-2 py-1 rounded-md transition-colors ${mode === 'ocr' ? 'bg-white shadow text-[#0A6E3B] font-medium' : 'text-stone-500 hover:text-stone-700'}`}
              >
                Upload Bill (OCR)
              </button>
            </div>
          </div>
          <DialogTitle className="font-display text-xl font-semibold text-stone-900">
            {mode === 'ocr' ? `Verify Bill from ${promptData.shop_name}` : (
              <>
                {step === 1 && `Did you visit ${promptData.shop_name}?`}
                {step === 2 && `Did you buy anything at ${promptData.shop_name}?`}
                {step === 3 && `Approximately how much did you spend?`}
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-stone-600 text-xs mt-1">
            {mode === 'ocr'
              ? 'Paste receipt text, SMS bill, or type line items. AI will parse details and match the store automatically.'
              : (
                <>
                  {step === 1 && `You recently viewed directions for this shop. Confirming helps local sellers and earns you rewards.`}
                  {step === 2 && `Help us understand whether local shoppers found what they were looking for.`}
                  {step === 3 && `Select an approximate range or enter an amount. A rough estimate is completely fine.`}
                </>
              )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-3">
          {mode === 'ocr' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-stone-700 block mb-1">
                  Receipt / Bill Text or SMS
                </label>
                <textarea
                  rows={4}
                  value={receiptText}
                  onChange={(e) => setReceiptText(e.target.value)}
                  placeholder={`Paste store receipt or bill details here...\nExample:\n${promptData.shop_name}\nApples 1kg 120.00\nMilk 1L 60.00\nTOTAL: 180.00`}
                  className="w-full text-xs font-mono p-2.5 rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-[#0A6E3B]"
                />
              </div>

              {!extractedData ? (
                <Button
                  type="button"
                  disabled={analyzingReceipt || !receiptText.trim()}
                  onClick={handleAnalyzeReceipt}
                  className="w-full rounded-xl bg-[#0A6E3B] hover:bg-[#075030] text-white py-5"
                >
                  {analyzingReceipt ? 'Analyzing with AI...' : 'Parse Receipt with AI'}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1.5">
                    <div className="font-semibold text-emerald-900 flex items-center justify-between">
                      <span>AI-Extracted Details</span>
                      <Badge className="bg-emerald-600 text-white text-[10px]">
                        {extractedData.matched_seller?.confidence ? `${Math.round(extractedData.matched_seller.confidence * 100)}% Match` : 'Matched'}
                      </Badge>
                    </div>
                    <div className="text-stone-700"><strong>Store:</strong> {extractedData.extracted?.seller_name || promptData.shop_name}</div>
                    {extractedData.extracted?.receipt_date && (
                      <div className="text-stone-600"><strong>Date:</strong> {extractedData.extracted.receipt_date}</div>
                    )}
                    {extractedData.extracted?.items?.length > 0 && (
                      <div className="text-stone-600">
                        <strong>Items ({extractedData.extracted.items.length}):</strong>
                        <ul className="list-disc pl-4 mt-1 space-y-0.5">
                          {extractedData.extracted.items.map((it, idx) => (
                            <li key={idx}>{it.name} - ₹{it.price}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs text-stone-600 mb-1 block">Confirmed Total Amount (₹):</label>
                    <Input
                      type="number"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      className="rounded-xl text-sm"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setExtractedData(null)}
                      className="w-1/3 rounded-xl border-stone-200 text-stone-600"
                    >
                      Re-parse
                    </Button>
                    <Button
                      type="button"
                      disabled={submitting}
                      onClick={handleConfirmReceipt}
                      className="w-2/3 rounded-xl bg-[#0A6E3B] hover:bg-[#075030] text-white"
                    >
                      {submitting ? 'Confirming...' : 'Confirm Bill (+25 Pts)'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'quick' && step === 1 && (
            <div className="flex flex-col gap-2.5">
              <Button
                onClick={() => { setVisited(true); setStep(2); }}
                className="w-full justify-between rounded-xl bg-[#0A6E3B] hover:bg-[#075030] text-white py-6"
              >
                <span className="font-medium">Yes, I visited</span>
                <ArrowRight size={16} />
              </Button>
              <Button
                variant="outline"
                onClick={handleDeclineVisit}
                className="w-full rounded-xl border-stone-200 text-stone-700 py-6"
              >
                No, I did not visit
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-2.5">
              <Button
                onClick={() => { setPurchased(true); setStep(3); }}
                className="w-full justify-between rounded-xl bg-[#0A6E3B] hover:bg-[#075030] text-white py-6"
              >
                <span className="font-medium flex items-center gap-2">
                  <ShoppingBag size={16} /> Yes, I bought something
                </span>
                <ArrowRight size={16} />
              </Button>
              <Button
                variant="outline"
                disabled={submitting}
                onClick={handleConfirmNoPurchase}
                className="w-full rounded-xl border-stone-200 text-stone-700 py-6"
              >
                No, just visited
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {SPEND_RANGES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => { setSpendRange(r.key); setCustomAmount(''); }}
                    className={`p-3 rounded-xl text-sm font-medium border transition-colors text-center ${
                      spendRange === r.key
                        ? 'bg-emerald-50 border-[#0A6E3B] text-[#0A6E3B] ring-1 ring-[#0A6E3B]'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:border-stone-300'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div>
                <div className="text-xs text-stone-500 mb-1">Or enter exact amount (optional):</div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-stone-400 text-sm">₹</span>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 350"
                    value={customAmount}
                    onChange={(e) => { setCustomAmount(e.target.value); setSpendRange(null); }}
                    className="pl-7 rounded-xl"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button
                  disabled={submitting || (!spendRange && !customAmount)}
                  onClick={handleConfirmPurchase}
                  className="w-full rounded-full bg-[#0A6E3B] hover:bg-[#075030] text-white"
                >
                  Confirm & Earn Rewards
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

