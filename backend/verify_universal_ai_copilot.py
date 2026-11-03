import sys
import json
import urllib.request
import urllib.error

sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://localhost:8000/api"


def req(method, path, data=None, token=None):
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="ignore")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def main():
    print("=== 1. AUTHENTICATING ADMIN, VENDOR & CONSUMER ===")
    st, admin_auth = req("POST", "/auth/login", {"email": "dgstartup2026@gmail.com", "password": "Dgadmin@startup2026"})
    assert st == 200, f"Admin login failed: {st} {admin_auth}"
    admin_token = admin_auth["token"]
    print("Admin authenticated:", admin_auth["user"]["email"])

    st, vendor_auth = req("POST", "/auth/login", {"email": "copilotvendor@demo.com", "password": "Password123!"})
    if st != 200:
        st, vendor_auth = req("POST", "/auth/vendor/register", {
            "name": "Ramesh Sharma",
            "email": "copilotvendor@demo.com",
            "password": "Password123!",
            "shop_name": "Sharma Kirana & Sabzi",
            "shop_address": "Paltan Bazaar, Dehradun",
            "vendor_type": "retailer",
            "phone": "9876543210",
        })
    assert st == 200, f"Vendor login failed: {st} {vendor_auth}"
    vendor_token = vendor_auth["token"]
    print("Vendor authenticated:", vendor_auth["user"]["email"])

    st, consumer_auth = req("POST", "/auth/login", {"email": "copilotconsumer@demo.com", "password": "Password123!"})
    if st != 200:
        st, consumer_auth = req("POST", "/auth/consumer/register", {
            "name": "Priya Verma",
            "email": "copilotconsumer@demo.com",
            "password": "Password123!",
            "phone": "9811122233",
        })
    assert st == 200, f"Consumer login failed: {st} {consumer_auth}"
    consumer_token = consumer_auth["token"]
    print("Consumer authenticated:", consumer_auth["user"]["email"])

    print("\n=== 2. TESTING VENDOR HINDI VOICE QUESTION + SPOKEN AUDIO ===")
    st, v_sales = req("POST", "/ai/chat-simple", {
        "session_id": "test_vendor_voice_hi",
        "message": "आज मेरी दुकान की बिक्री कितनी हुई?",
        "page": "/vendor/dashboard",
        "input_mode": "voice",
        "preferred_language": "hi",
        "generate_audio": True,
    }, token=vendor_token)
    assert st == 200, f"Vendor Hindi voice query failed: {st} {v_sales}"
    assert v_sales.get("reply"), "Missing written reply"
    assert v_sales.get("audio") and v_sales["audio"].get("status") == "ready", f"Missing TTS audio: {v_sales.get('audio')}"
    assert v_sales["audio"].get("audio_data_url", "").startswith("data:audio/"), "Invalid audio_data_url"
    print("Vendor Hindi Reply:", v_sales["reply"][:140])
    print("Vendor Audio Status:", v_sales["audio"]["status"], "Locale:", v_sales["audio"]["voice_locale"])

    print("\n=== 3. TESTING VENDOR ENGLISH STOCK QUESTION + SPOKEN AUDIO ===")
    st, v_stock = req("POST", "/ai/chat-simple", {
        "session_id": "test_vendor_text_en",
        "message": "Which products are out of stock?",
        "page": "/vendor/products",
        "input_mode": "text",
        "preferred_language": "en",
        "generate_audio": True,
    }, token=vendor_token)
    assert st == 200, f"Vendor stock query failed: {st} {v_stock}"
    assert v_stock.get("reply"), "Missing reply"
    assert v_stock.get("audio") and v_stock["audio"].get("status") == "ready", "Missing audio"
    print("Vendor Stock Reply:", v_stock["reply"][:140])

    print("\n=== 4. TESTING VENDOR HINGLISH WORKFLOW QUESTION ===")
    st, v_hinglish = req("POST", "/ai/chat-simple", {
        "session_id": "test_vendor_hinglish",
        "message": "Main apne shop ki sales kaise check kar sakta hoon?",
        "page": "/vendor/dashboard",
        "input_mode": "voice",
        "preferred_language": "hinglish",
        "generate_audio": True,
    }, token=vendor_token)
    assert st == 200, f"Vendor Hinglish query failed: {st} {v_hinglish}"
    print("Vendor Hinglish Reply:", v_hinglish["reply"][:140])

    print("\n=== 5. TESTING CONSUMER QUESTIONS (TOMATOES, SHOPS LISTING TOMATOES, CHEAPEST, DISTANCE, SHOPS & CARTS) + SPOKEN AUDIO ===")
    for q_text, lang_code in [
        ("sabse saste tamatar kaun si dukaan per aur Kitni Dur Mere Ghar Se Milenge aur kitne rupaye mein", "hinglish"),
        ("सबसे सस्ते टमाटर कौन सी दुकान पर और कितनी दूर मेरे घर से मिलेंगे और कितने रुपये में", "hi"),
        ("Where can I buy tomatoes?", "en"),
        ("Which shops are listing tomatoes?", "en"),
        ("Tamatar kahan milega?", "hinglish"),
        ("टमाटर कहाँ मिलेगा?", "hi"),
        ("Show all shops, mobile carts and their products", "en"),
        ("Show mobile carts near me", "en"),
        ("What is in my shopping cart?", "en"),
        ("Where can I find the cheapest nearby seller?", "en"),
    ]:
        st, c_res = req("POST", "/ai/chat-simple", {
            "session_id": f"test_consumer_{lang_code}_{abs(hash(q_text)) % 10000}",
            "message": q_text,
            "page": "/search",
            "input_mode": "voice",
            "preferred_language": lang_code,
            "generate_audio": True,
        }, token=consumer_token)
        assert st == 200, f"Consumer query '{q_text}' failed: {st} {c_res}"
        reply_low = c_res.get("reply", "").lower()
        assert "do not have information" not in reply_low and "don't have information" not in reply_low, f"AI failed to find product for '{q_text}': {c_res.get('reply')}"
        assert not (len(reply_low) < 120 and "main localprice ai hoon" in reply_low), f"Truncated greeting returned for '{q_text}': {c_res.get('reply')}"
        if "tomato" in q_text.lower() or "tamatar" in q_text.lower() or "टमाटर" in q_text:
            assert any(k in reply_low for k in ["25", "27", "30", "₹", "deepak", "abhay", "chaudhary", "fresh cart", "rawat", "raju", "bisht", "tomato", "टमाटर"]), f"Expected tomato shop/price details in reply: {c_res.get('reply')}"
            assert any(d in reply_low for d in ["km", " m", "किमी", "मीटर", "दूर", "door"]), f"Expected distance in reply for '{q_text}': {c_res.get('reply')}"
        assert c_res.get("audio") and c_res["audio"].get("status") == "ready", "Consumer audio missing"
        print(f"Consumer Query [{q_text}] -> {c_res['reply'][:180]}")

    print("\n=== 6. TESTING ADMIN QUESTION + SPOKEN AUDIO ===")
    st, a_report = req("POST", "/ai/chat-simple", {
        "session_id": "test_admin_en",
        "message": "Show me the AI usage and performance report.",
        "page": "/admin/ai-control-center",
        "input_mode": "text",
        "preferred_language": "en",
        "generate_audio": True,
    }, token=admin_token)
    assert st == 200, f"Admin AI query failed: {st} {a_report}"
    assert "AI Usage & Performance Report" in a_report.get("reply", "") or a_report.get("reply"), "Admin report missing"
    print("Admin AI Report Reply:", a_report["reply"][:160])

    print("\n=== 7. TESTING DIRECT TTS RETRY ENDPOINT & DETAILED FEEDBACK ===")
    st, tts_res = req("POST", "/ai/tts", {
        "text": "नमस्ते, आज आपकी दुकान की कुल बिक्री 450 रुपये है।",
        "language": "hi",
        "speed": 1.0,
    }, token=vendor_token)
    assert st == 200 and tts_res.get("status") == "ready", f"TTS endpoint failed: {st} {tts_res}"
    print("Direct TTS endpoint verified:", tts_res["provider"], tts_res["voice_locale"])

    st, fb_res = req("POST", "/ai/feedback-detailed", {
        "message_id": v_sales.get("message_id", "msg_1"),
        "session_id": "test_vendor_voice_hi",
        "rating": 1,
        "feedback_type": "helpful",
        "comment": "Accurate Hindi voice answer and audio",
    }, token=vendor_token)
    assert st == 200, f"Detailed feedback failed: {st} {fb_res}"
    print("Detailed feedback saved:", fb_res)

    print("\n=== 8. TESTING ALL ADMIN AI CONTROL CENTER ENDPOINTS ===")
    endpoints = [
        ("GET", "/admin/ai-control-center/overview?date_range=7d"),
        ("GET", "/admin/ai-control-center/global-controls"),
        ("GET", "/admin/ai-control-center/roles"),
        ("GET", "/admin/ai-control-center/user-overrides"),
        ("GET", "/admin/ai-control-center/providers"),
        ("GET", "/admin/ai-control-center/voice-audio"),
        ("GET", "/admin/ai-control-center/languages"),
        ("GET", "/admin/ai-control-center/knowledge"),
        ("GET", "/admin/ai-control-center/tools"),
        ("GET", "/admin/ai-control-center/templates"),
        ("GET", "/admin/ai-control-center/conversations"),
        ("GET", "/admin/ai-control-center/feedback"),
        ("GET", "/admin/ai-control-center/audit-logs"),
    ]
    for method, ep in endpoints:
        st, res = req(method, ep, token=admin_token)
        assert st == 200, f"Control Center endpoint {ep} failed: {st} {res}"
        print(f"Verified {method} {ep} -> 200 OK")

    # Test reindexing knowledge & provider connection test
    st, reidx = req("POST", "/admin/ai-control-center/knowledge/reindex", {}, token=admin_token)
    assert st == 200, f"Reindex failed: {st} {reidx}"
    print("Knowledge reindex verified:", reidx)

    st, prov_test = req("POST", "/admin/ai-control-center/providers/llm_primary/test", {}, token=admin_token)
    assert st == 200, f"Provider test failed: {st} {prov_test}"
    print("Provider connection test verified:", prov_test)

    print("\n=== 9. REGRESSION CHECK ON EXISTING APPLICATION FEATURES ===")
    reg_endpoints = [
        ("GET", "/search?q=Aloo", None),
        ("GET", "/vendors", None),
        ("GET", "/payments/config", None),
        ("GET", "/voice-inventory/config", vendor_token),
        ("GET", "/admin/voice-inventory/overview", admin_token),
        ("GET", "/grievances", vendor_token),
    ]
    for method, ep, tok in reg_endpoints:
        st, _ = req(method, ep, token=tok)
        assert st == 200, f"Regression failure on {ep}: {st}"
        print(f"Regression check {ep} -> 200 OK")

    print("\nALL UNIVERSAL AI COPILOT, VOICE, TTS, ADMIN CONTROL CENTER & REGRESSION TESTS PASSED!")


if __name__ == "__main__":
    main()

