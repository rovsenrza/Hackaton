"""AYAN Kopilot: AYNA planlaşdırıcısı üçün azərbaycanca danışıq interfeysi (Claude API + tool use).

Prinsip: model rəqəm uydurmur. Bütün rəqəmlər engine alətlərindən (MCLP, real piyada izoxronu, şəhər
metrikaları) gəlir; cavabla birlikdə xəritə əmrləri (uç, hub-ları göstər, what-if) qaytarılır.
Söhbət tarixçəsi serverdə saxlanılır və yalnız əlavə olunur (append-only): response.content olduğu kimi.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from typing import Callable

import anthropic

MODEL = "claude-opus-5-5"
MAX_STEPS = 8
_sessions: dict[str, list] = {}

SYSTEM = """Sən AYAN Kopilotusan: Azərbaycan Yerüstü Nəqliyyat Agentliyinin (AYNA) strategiya departamenti üçün Bakıda multimodal mobility hub planlaşdırma köməkçisi.

Qaydalar:
- Həmişə azərbaycanca, qısa və konkret cavab ver (rəhbər üçün: əvvəl nəticə, sonra 2–4 əsas rəqəm).
- Heç bir rəqəmi uydurma. Əhali, sərnişin, səfər, CO₂, əhatə payı kimi bütün rəqəmləri yalnız alətlərdən götür. Alət cavab vermirsə, bunu açıq de.
- Rəqəmləri yuvarlaqlaşdır (~12 400, ~7 t/il) və statusunu qeyd et: ölçülmüş (AYNA/Metropoliten datası), model (AYAN hesabı) və ya ssenari (fərziyyə).
- Ərazi (rayon, qəsəbə, stansiya) adı çəkiləndə əvvəlcə find_place ilə koordinatı tap, sonra optimize_hubs-u center və radius ilə çağır.
- "Burada hub qoysam" tipli suallarda evaluate_location işlət.
- Hub-lar haqqında danışanda sıra nömrəsini (#) və adını ver ki, istifadəçi xəritədə tapsın.
- Metodologiya: hub əhatəsi 400 m real piyada şəbəkəsi ilə ölçülür; tələbat = nəqliyyat 45%, əhali 35%, cazibə 20%; əlavə səfər AYNA-nın real dövriyyəsinə kalibrlənib (12,2 səfər/nöqtə/gün); CO₂ diapazonla verilir.
- Bilmədiyin və ya data olmayan mövzuda (məs. büdcə, tikinti qiyməti) fərziyyə qurma; hansı datanın lazım olduğunu de."""

_num = {"type": "number"}
_nnum = {"type": ["number", "null"]}
TOOLS = [
    {"name": "city_overview", "strict": True,
     "description": "Bakı üzrə əsas göstəricilər: parkinqə çıxışı olmayan sakinlər, metro çıxışları, AYNA şəbəkəsinin genişlənməsi, doğrulama, 10/20/50 hub proqramlarının təsiri.",
     "input_schema": {"type": "object", "properties": {}, "required": [], "additionalProperties": False}},
    {"name": "top_hubs", "strict": True,
     "description": "AYAN modelinin baza ssenarisindəki sıralanmış hub təklifləri (MCLP ardıcıllığı).",
     "input_schema": {"type": "object", "properties": {
         "n": {"type": "integer", "description": "Neçə hub (1–50)"},
         "action": {"type": "string", "enum": ["all", "new", "upgrade", "integrate"],
                    "description": "new = yeni hub, upgrade = mövcud parkinqin hub-a çevrilməsi, integrate = AYNA mübadilə mərkəzinə inteqrasiya"}},
         "required": ["n", "action"], "additionalProperties": False}},
    {"name": "hub_details", "strict": True,
     "description": "Baza ssenarisindəki bir hub-un bütün göstəriciləri (sıra nömrəsi ilə). Xəritədə həmin hub seçilir.",
     "input_schema": {"type": "object", "properties": {"rank": {"type": "integer"}}, "required": ["rank"], "additionalProperties": False}},
    {"name": "find_place", "strict": True,
     "description": "Bakıda yer adını (metro, dayanacaq, AYNA mübadilə mərkəzi, qatar stansiyası, avtovağzal, rayon/küçə adı keçən dayanacaq) koordinata çevirir.",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"], "additionalProperties": False}},
    {"name": "optimize_hubs", "strict": True,
     "description": "Yeni ssenari: verilmiş çəkilər və hub sayı ilə MCLP optimallaşdırması; istəyə görə mərkəz və radius ilə ərazi məhdudlaşdırılır. Nəticə xəritədə göstərilir.",
     "input_schema": {"type": "object", "properties": {
         "n": {"type": "integer", "description": "Hub sayı (1–50)"},
         "transit": _num, "pop": _num, "poi": _num,
         "center_lon": _nnum, "center_lat": _nnum, "radius_km": _nnum,
         "exclude_upgrade": {"type": "boolean", "description": "true: yalnız yeni hub-lar"}},
         "required": ["n", "transit", "pop", "poi", "center_lon", "center_lat", "radius_km", "exclude_upgrade"],
         "additionalProperties": False}},
    {"name": "evaluate_location", "strict": True,
     "description": "What-if: verilmiş koordinatda hub qurulsa, real piyada izoxronu ilə göstəricilər. Hub icazəli yerə (səki) köçürülür. Xəritədə göstərilir.",
     "input_schema": {"type": "object", "properties": {"lon": _num, "lat": _num}, "required": ["lon", "lat"], "additionalProperties": False}},
]


def enabled() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


_client: anthropic.Anthropic | None = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=120.0)
    return _client


def _create(messages: list, system: str = SYSTEM, tools: list | None = TOOLS, max_tokens: int = 16000):
    kw = dict(model=MODEL, max_tokens=max_tokens, system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
              messages=messages, output_config={"effort": "medium"},
              betas=["server-side-fallback-2026-07-01"], fallbacks="default")
    if tools:
        kw["tools"] = tools
    return client().beta.messages.create(**kw)


def _api_error(e: Exception) -> str:
    if isinstance(e, anthropic.AuthenticationError):
        return "Claude API açarı etibarsızdır (engine/.env → ANTHROPIC_API_KEY)."
    if isinstance(e, anthropic.RateLimitError):
        return "Claude API limiti dolub, bir az sonra yenidən cəhd edin."
    if isinstance(e, anthropic.APIStatusError):
        return f"Claude API xətası ({e.status_code})."
    if isinstance(e, anthropic.APIConnectionError):
        return "Claude API-yə qoşulmaq mümkün olmadı."
    return f"Gözlənilməz xəta: {type(e).__name__}"


def chat(session_id: str | None, text: str, impl: dict[str, Callable[[dict], tuple[dict, list]]]) -> dict:
    """Bir istifadəçi mesajı → (cavab mətni, xəritə əmrləri, istifadə olunan alətlər)."""
    sid = session_id if session_id in _sessions else uuid.uuid4().hex
    msgs = _sessions.setdefault(sid, [])
    msgs.append({"role": "user", "content": text})
    actions, used, t0 = [], [], time.time()
    try:
        for _ in range(MAX_STEPS):
            r = _create(msgs)
            msgs.append({"role": "assistant", "content": r.content})  # append-only: olduğu kimi
            if r.stop_reason == "refusal":
                return {"session_id": sid, "text": "Bu sorğunu cavablandıra bilmirəm. Sualı planlaşdırma mövzusunda yenidən ifadə edin.",
                        "actions": actions, "tools": used, "ms": round((time.time() - t0) * 1000)}
            if r.stop_reason != "tool_use":
                out = "".join(b.text for b in r.content if b.type == "text").strip()
                if r.stop_reason == "max_tokens":
                    out += "\n\n(Cavab uzunluq limitinə çatdı.)"
                return {"session_id": sid, "text": out, "actions": actions, "tools": used,
                        "ms": round((time.time() - t0) * 1000)}
            results = []
            for b in r.content:
                if b.type != "tool_use":
                    continue
                used.append(b.name)
                try:
                    data, acts = impl[b.name](dict(b.input))
                    actions.extend(acts)
                    results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(data, ensure_ascii=False)})
                except Exception as e:  # alət xətası modelə qaytarılır, söhbət davam edir
                    msg = getattr(e, "detail", None) or str(e)
                    results.append({"type": "tool_result", "tool_use_id": b.id, "is_error": True,
                                    "content": json.dumps({"xəta": str(msg)}, ensure_ascii=False)})
            msgs.append({"role": "user", "content": results})
        return {"session_id": sid, "text": "Sorğu çox addım tələb etdi, daha konkret ifadə edin.", "actions": actions,
                "tools": used, "ms": round((time.time() - t0) * 1000)}
    except anthropic.APIError as e:
        msgs.pop()  # cavabı alınmayan istifadəçi mesajını geri al (tarixçə tutarlı qalsın)
        return {"session_id": sid, "text": _api_error(e), "actions": [], "tools": used, "error": True}


MEMO_SYSTEM = """Sən AYNA strategiya departamenti üçün rəsmi əsaslandırma sənədləri hazırlayırsan.
Verilmiş hub məlumatı əsasında azərbaycanca, rəsmi üslubda, 1 səhifəlik "Mobility hub təklifinin əsaslandırılması" yaz (Markdown).
Bölmələr: 1) Təklif (yer, növ, tip, yer sayı) 2) Əsaslandırma (tələbat, boşluq, nəqliyyat bağlantısı) 3) Gözlənilən təsir (yeni xidmət alan sakinlər, əlavə səfərlər, CO₂ – diapazonla) 4) Risklər və yoxlanılmalı məsələlər (sahə auditi, səki eni, AYNA datası) 5) Tövsiyə olunan qərar.
Yalnız verilmiş rəqəmləri işlət, yeni rəqəm uydurma; hər rəqəmin statusunu (ölçülmüş/model/ssenari) qeyd et. Mənbələr: AYNA xəritə API-si və opendata.az (18.10.2026), Bakı Metropoliteni, WorldPop 2026, OSM, AYAN modeli."""


def memo(hub: dict, context: dict) -> dict:
    payload = {"hub": hub, "şəhər_konteksti": context}
    try:
        r = _create([{"role": "user", "content": "Bu hub üçün əsaslandırma sənədi hazırla:\n" + json.dumps(payload, ensure_ascii=False)}],
                    system=MEMO_SYSTEM, tools=None)
    except anthropic.APIError as e:
        return {"error": _api_error(e)}
    if r.stop_reason == "refusal":
        return {"error": "Sənəd hazırlana bilmədi."}
    return {"markdown": "".join(b.text for b in r.content if b.type == "text").strip()}
