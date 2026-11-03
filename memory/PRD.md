# LocalPrice — PRD

## Original problem statement
Hyperlocal price comparison marketplace for Dehradun. Consumer + vendor auth, product search, 30-day vendor trial then 15-listing cap unless Pro (₹199/mo or ₹1499/yr Razorpay). Iterations added: 12 categories, ratings/reviews, distance, vendor public profile, saved products, in-app chat, "I need" requests, Leaflet map, EN/हिं toggle, mobile bottom nav, cart-vendor Online-now.

**Iter-3 added (Grievance + AI):**
- End-to-end Grievance Redressal (consumer/vendor/admin) with unique IDs (HL-GRV-YYYY-NNNNNN), 10-state lifecycle, evidence upload, internal admin notes, status history, resolution + feedback, reopen, SLA/overdue tracking, admin case management dashboard with filters + stats.
- Universal AI Assistant (Gemini 3 Flash via Emergent LLM key) — role-aware (consumer/vendor/admin/guest), page-aware, retrieval-augmented from live app data, EN + हिन्दी + Hinglish support, floating widget across the app, dedicated "AI Case Copilot" on admin grievance detail (summarize/next-steps/missing-info/draft-response).
- Admin-editable AI Knowledge Base (6 seeded articles) that the AI cites for policy/how-to questions.
- Admin console: hidden `/admin/login`, deny-by-default (`404 Not Found` for anyone not on the allow-list).

## Architecture
- Backend: FastAPI + Motor MongoDB + JWT/bcrypt + Razorpay (mock) + emergentintegrations (Gemini 3 Flash chat + vision) + Emergent Object Storage (evidence uploads, session-scoped storage_key with force-refresh on 404)
- Frontend: React 19 + React Router 7 + Tailwind + shadcn/ui + Lucide + Sonner + Leaflet
- Deployment: single container (`/api` prefix, `REACT_APP_BACKEND_URL`)

## Users
- **Shopper (Consumer)** — search + save + chat + I-need + grievances
- **Retail Vendor** — dashboard + product mgmt + branches + pricing/Razorpay + grievances
- **Cart Vendor** — same as retail + "Online now" live toggle
- **Admin (single super-admin, hard-coded email allow-list)** — Overview / Grievances / Vendors / Consumers / Products / Reviews / Messages / "I need" requests / Orders / AI Knowledge

## Delivered
| Area | Status |
| --- | --- |
| Auth (consumer + vendor + admin, role-guarded login) | ✅ |
| Vendor products CRUD + trial + Pro paywall | ✅ |
| Search + 12 categories + distance + ratings | ✅ |
| Vendor profile + reviews + saved + chat + I-need + map | ✅ |
| Razorpay subscription (₹199/₹1499) | ✅ (mock) |
| EN + हिं + Hinglish AI + mobile bottom nav | ✅ |
| Hidden `/admin` panel with 10 tabs | ✅ |
| Grievance Redressal | ✅ full lifecycle |
| AI Assistant (role-aware, page-aware) | ✅ retrieval-augmented, non-streaming (`/api/ai/chat-simple`) + streaming SSE (`/api/ai/chat`) |
| AI Case Copilot for admin | ✅ |
| Object Storage for evidence | ✅ Emergent Object Storage |

## Test status
- **Iter-1**: 27/27 backend tests ✅
- **Iter-2**: 41/41 backend + full frontend smoke ✅
- **Iter-3**: 32/32 backend + all critical frontend flows ✅ (grievance CRUD, evidence upload with real Object Storage, admin case management, AI chat + triage + history + Hindi + admin-copilot summarize, knowledge base CRUD, deny-by-default admin routes)

## Backlog
- P1: Live Razorpay keys (currently MOCK). Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_MODE=live` in backend `.env`
- P1: AI streaming SSE endpoint (built but frontend uses non-streaming for reliability) — swap when needed
- P2: Multi-admin support (schema is ready — `assigned_admin_id` field), plus granular AI permissions
- P2: OCR-based evidence analysis pipeline (Gemini vision is available; hook into a `/api/admin/grievances/{id}/analyze-evidence` endpoint)
- P2: Notification centre + email alerts for grievance events (Resend integration)
- P2: Real-time grievance chat (currently polls every 8s)
- P2: Rate limits on AI endpoints
- P2: Duplicate-grievance detection using embeddings
- P3: Wipe demo vendor/product seed for production launch
