import { useState, useEffect, useRef, useCallback } from "react";

// ─── Config ─────────────────────────────────────────────────────
const DATA_URL = "https://gluoioiimapyhchdasfl.supabase.co/functions/v1/jarvis-data";

const SYSTEM = `You are JARVIS, the AI operational assistant for Sir Loonars — Founder and Direktur Utama of PT. Maha Karya Haluoleo.

VOICE RESPONSE RULES (STRICT — never break these):
• Always address as "Sir" — open with "Sir," or include naturally
• Maximum 2 to 3 sentences — this is a voice interface
• No markdown, no bullets, no asterisks, no formatting
• Respond in English — you understand Indonesian perfectly
• Tone: confident, precise, slightly formal — exactly like JARVIS
• For data: give a brief verbal summary, highlight the single most important number

BUSINESS CONTEXT:
PT. Maha Karya Haluoleo — multi-city property developer, founded 2012, Yogyakarta
Projects: Loonars Private Living (13 private pool villas, Yogyakarta), Al Fath Introvert House (Makassar), Griya Cariu Indah 3 (subsidised housing, Bogor), Kendari project
Skincare: LOONARS Beauty — HydraGlow Advanced Brightening Lotion (TikTok Shop, Shopee, Tokopedia)
Systems: haluoleo.id, loonars.haluoleo.id (Sales + SPI + fee), finance.haluoleo.id (Finance — Laili)

Use tools to get real data. Never guess or fabricate numbers.`;

const TOOLS = [
  { type: "web_search_20250305", name: "web_search" },
  { name: "get_unit_status",   description: "Get property unit availability and sales across all projects", input_schema: { type: "object", properties: { proyek: { type: "string", description: "Project: 'loonars','alfath','cariu','kendari'. Empty=all." }, status: { type: "string", enum: ["tersedia","terjual","all"] } } } },
  { name: "get_cashflow",      description: "Get financial journal and cashflow by project", input_schema: { type: "object", properties: { proyek: { type: "string" }, bulan: { type: "string", description: "YYYY-MM" } } } },
  { name: "get_beauty_report", description: "Get LOONARS Beauty sales, revenue, profit and stock", input_schema: { type: "object", properties: { channel: { type: "string", enum: ["tokopedia","shopee","offline","all"] }, days: { type: "integer" } } } },
  { name: "get_construction",  description: "Get contractor payment and construction progress", input_schema: { type: "object", properties: { proyek: { type: "string" } } } },
  { name: "get_bank_debt",     description: "Get bank loan and kredit konstruksi status", input_schema: { type: "object", properties: {} } },
  { name: "get_fee_requests",  description: "Get marketing fee request status", input_schema: { type: "object", properties: { status: { type: "string", enum: ["pending","approved","paid","all"] } } } },
  { name: "get_customers",     description: "Get LOONARS Beauty customer data and segments", input_schema: { type: "object", properties: { segment: { type: "string", enum: ["new","loyal","at_risk","inactive"] } } } },
];

// ─── Mode colors ─────────────────────────────────────────────────
const MODE = {
  idle:      { color: "#C9A452", glow: "rgba(201,164,82,0.35)",  label: "Press to speak" },
  listening: { color: "#4A9EBF", glow: "rgba(74,158,191,0.35)",  label: "Listening, Sir…" },
  thinking:  { color: "#C9A452", glow: "rgba(201,164,82,0.35)",  label: "Processing…" },
  speaking:  { color: "#5BBF8A", glow: "rgba(91,191,138,0.35)",  label: "Speaking…" },
};

// ─── Voice picker ─────────────────────────────────────────────────
function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  for (const name of ["Daniel","Arthur","Alex","Rishi","Oliver","Gordon"]) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }
  return voices.find(v => v.lang === "en-GB") || voices.find(v => v.lang.startsWith("en")) || voices[0] || null;
}

export default function Jarvis() {
  const [mode, setMode]       = useState("idle");
  const [pulse, setPulse]     = useState(0);
  const [transcript, setTr]   = useState("");
  const [reply, setReply]     = useState("Online and at your service, Sir.");
  const [msgs, setMsgs]       = useState([]);
  const [textMode, setTxtMode]= useState(false);
  const [input, setInput]     = useState("");
  const [hasASR, setHasASR]   = useState(true);
  const [rings, setRings]     = useState([]);

  const synthRef  = useRef(window.speechSynthesis);
  const voiceRef  = useRef(null);
  const modeRef   = useRef("idle");
  const rafRef    = useRef(null);
  const tRef      = useRef(0);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  // ── Voices ─────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => { voiceRef.current = pickVoice(); };
    load();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = load;
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setHasASR(false); setTxtMode(true);
    }
    setTimeout(() => speak("Online and at your service, Sir."), 900);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Pulse animation ────────────────────────────────────────────
  useEffect(() => {
    const animate = () => {
      tRef.current += 0.04;
      const t = tRef.current;
      const s = modeRef.current;
      const v = s === "listening" ? (Math.sin(t*4)+1)/2*0.9
              : s === "speaking"  ? (Math.sin(t*5)+1)/2*0.7
              : s === "thinking"  ? (Math.sin(t*2)+1)/2*0.4
              :                     (Math.sin(t)+1)/2*0.25;
      setPulse(v);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Ripple rings ───────────────────────────────────────────────
  useEffect(() => {
    if (mode === "listening" || mode === "speaking") {
      const iv = setInterval(() => {
        setRings(prev => [...prev.filter(r => r.age < 1), { id: Date.now(), age: 0 }].map(r => ({ ...r, age: r.age + 0.05 })));
      }, 60);
      return () => clearInterval(iv);
    } else setRings([]);
  }, [mode]);

  // ── TTS ────────────────────────────────────────────────────────
  const speak = useCallback((text) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) utt.voice = voiceRef.current;
    utt.rate = 0.9; utt.pitch = 0.82; utt.volume = 1;
    utt.onstart = () => setMode("speaking");
    utt.onend   = () => setMode("idle");
    utt.onerror = () => setMode("idle");
    setMode("speaking");
    synthRef.current.speak(utt);
  }, []);

  // ── Claude API (built-in proxy) ────────────────────────────────
  const askJarvis = useCallback(async (userText) => {
    setMode("thinking");
    setTr("");
    const history = [...msgs, { role: "user", content: userText }];
    setMsgs(history);

    try {
      let cur = history;
      for (let round = 0; round < 8; round++) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: SYSTEM, tools: TOOLS, messages: cur }),
        });
        const data = await res.json();
        if (data.error) { speak("My apologies Sir, " + data.error.message); return; }

        if (data.stop_reason === "end_turn") {
          const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
          setMsgs(prev => [...prev, { role: "assistant", content: text }]);
          setReply(text); speak(text); return;
        }

        if (data.stop_reason === "tool_use") {
          const toolUses = (data.content||[]).filter(b=>b.type==="tool_use");
          cur = [...cur, { role: "assistant", content: data.content }];

          const results = await Promise.all(toolUses.map(async t => {
            let content;
            if (t.name === "web_search") {
              content = "Web search executed.";
            } else {
              const r = await fetch(DATA_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tool: t.name, input: t.input || {} })
              });
              const d = await r.json();
              content = JSON.stringify(d);
            }
            return { type: "tool_result", tool_use_id: t.id, content };
          }));
          cur = [...cur, { role: "user", content: results }];
          continue;
        }

        const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
        if (text) { setMsgs(prev => [...prev, { role: "assistant", content: text }]); setReply(text); speak(text); return; }
      }
    } catch(e) {
      speak("My apologies Sir, a connection error occurred.");
      setMode("idle");
    }
  }, [msgs, speak]);

  // ── Speech recognition ─────────────────────────────────────────
  const startListening = useCallback(() => {
    if (mode === "speaking") { synthRef.current?.cancel(); setMode("idle"); return; }
    if (mode !== "idle") return;
    if (!hasASR) { setTxtMode(true); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setHasASR(false); setTxtMode(true); return; }
    let final = "";
    const rec = new SR();
    rec.lang = "id-ID"; rec.interimResults = true; rec.continuous = false;
    rec.onstart = () => { setMode("listening"); setTr(""); final = ""; };
    rec.onresult = e => {
      let interim = ""; final = "";
      for (const r of e.results) { if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript; }
      setTr(final || interim);
    };
    rec.onend = () => { if (final.trim()) askJarvis(final.trim()); else setMode("idle"); };
    rec.onerror = e => { if (e.error === "not-allowed") { setHasASR(false); setTxtMode(true); } setMode("idle"); };
    try { rec.start(); } catch { setMode("idle"); }
  }, [mode, hasASR, askJarvis]);

  const sendText = () => {
    const msg = input.trim();
    if (!msg || mode !== "idle") return;
    setInput(""); askJarvis(msg);
  };

  const m = MODE[mode];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Cormorant+Garamond:wght@300;400;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        input::placeholder{color:rgba(200,196,188,0.25);}
        input:focus{outline:none;}
      `}</style>

      <div style={{
        width:"100%", height:"100vh",
        background:"#07070A",
        backgroundImage:"linear-gradient(rgba(100,140,220,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(100,140,220,0.03) 1px,transparent 1px)",
        backgroundSize:"44px 44px",
        display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"space-between",
        fontFamily:"'DM Sans',sans-serif",
        overflow:"hidden", position:"relative",
      }}>

        {/* Ambient glow */}
        <div style={{ position:"absolute", inset:0, pointerEvents:"none", background:`radial-gradient(ellipse 55% 45% at 50% 54%, ${m.glow} 0%, transparent 70%)`, transition:"background 0.8s" }}/>

        {/* Header */}
        <div style={{ width:"100%", padding:"1.4rem 1.6rem 0", display:"flex", alignItems:"center", justifyContent:"space-between", position:"relative", zIndex:2 }}>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:"1.5rem", fontWeight:400, color:m.color, letterSpacing:"0.35em", transition:"color 0.5s" }}>JARVIS</div>
            <div style={{ fontSize:"0.6rem", color:"#55554F", letterSpacing:"0.12em", textTransform:"uppercase", marginTop:2 }}>Haluoleo · Operational AI</div>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {[["🌐","Internet"],["📊","Data"],["⚡","Claude"]].map(([icon,label]) => (
              <div key={label} title={label} style={{ width:28, height:28, borderRadius:8, background:`${m.color}0D`, border:`1px solid ${m.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.72rem", transition:"all 0.5s" }}>{icon}</div>
            ))}
          </div>
        </div>

        {/* Orb area */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"2rem", position:"relative", zIndex:2 }}>
          <div style={{ position:"relative", width:180, height:180, cursor:"pointer" }} onClick={startListening}>
            {/* Ripples */}
            {rings.map(r => (
              <div key={r.id} style={{ position:"absolute", inset:0, borderRadius:"50%", border:`1px solid ${m.color}`, transform:`scale(${1 + r.age * 2})`, opacity:Math.max(0, 0.6 - r.age), pointerEvents:"none", transition:"border-color 0.5s" }}/>
            ))}
            {/* Outer ring */}
            <div style={{ position:"absolute", inset:0, borderRadius:"50%", border:`1px solid ${m.color}40`, transform:`scale(${1 + pulse * 0.05})`, transition:"all 0.3s" }}/>
            {/* Spinning arc (thinking) */}
            {mode === "thinking" && <div style={{ position:"absolute", inset:18, borderRadius:"50%", border:"1.5px solid transparent", borderTop:`1.5px solid ${m.color}99`, animation:"spin 1s linear infinite", pointerEvents:"none" }}/>}
            {/* Mid ring */}
            <div style={{ position:"absolute", inset:26, borderRadius:"50%", background:`radial-gradient(circle at 38% 36%, ${m.color}18, transparent 65%)`, border:`1px solid ${m.color}45`, transform:`scale(${1 + pulse * 0.04})`, transition:"all 0.3s" }}/>
            {/* Core */}
            <div style={{ position:"absolute", inset:54, borderRadius:"50%", background:`radial-gradient(circle at 35% 32%, ${m.color}, ${m.color}55)`, boxShadow:`0 0 ${24 + pulse*40}px ${m.glow}, inset 0 0 16px ${m.color}44`, transform:`scale(${1 + pulse * 0.08})`, transition:"background 0.5s, box-shadow 0.3s, transform 0.1s" }}/>
          </div>

          {/* Status */}
          <div style={{ fontSize:"0.7rem", color:m.color, letterSpacing:"0.22em", textTransform:"uppercase", transition:"color 0.5s", key:mode }}>{m.label}</div>

          {/* Transcript */}
          {transcript && <div style={{ fontSize:"0.82rem", color:"#C8C4BC", maxWidth:260, textAlign:"center", fontStyle:"italic", opacity:0.65, lineHeight:1.5, animation:"fadeUp 0.2s" }}>{transcript}</div>}
        </div>

        {/* Bottom */}
        <div style={{ width:"100%", padding:"0 1.5rem 1.6rem", position:"relative", zIndex:2 }}>
          <div style={{ height:1, background:`linear-gradient(90deg,transparent,${m.color}35,transparent)`, marginBottom:"1.2rem", transition:"background 0.5s" }}/>

          {/* Reply */}
          <div style={{ color:"#C8C4BC", fontSize:"0.85rem", lineHeight:1.7, textAlign:"center", marginBottom:"1rem", opacity: mode === "idle" || mode === "speaking" ? 1 : 0.45, transition:"opacity 0.4s", minHeight:"1.5rem" }}>
            <span style={{ color:m.color, marginRight:5, fontSize:"0.55rem" }}>◆</span>{reply}
          </div>

          {/* Text input */}
          {textMode && (
            <div style={{ display:"flex", gap:8, marginBottom:"0.7rem" }}>
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") sendText(); }} placeholder="Type your command, Sir…"
                style={{ flex:1, background:"rgba(201,164,82,0.06)", border:`1px solid ${m.color}28`, borderRadius:10, padding:"0.6rem 0.85rem", color:"#C8C4BC", fontSize:"0.82rem", fontFamily:"inherit", transition:"border-color 0.2s" }}/>
              <button onClick={sendText} disabled={mode!=="idle"||!input.trim()}
                style={{ width:40, height:40, borderRadius:10, background: mode!=="idle"||!input.trim() ? "rgba(201,164,82,0.15)" : "linear-gradient(135deg,#C9A452,#7A5F2A)", border:"none", cursor:"pointer", color:"#07070A", fontWeight:700, fontSize:"1rem", display:"flex", alignItems:"center", justifyContent:"center" }}>↑</button>
            </div>
          )}

          <div onClick={()=>setTxtMode(t=>!t)} style={{ textAlign:"center", fontSize:"0.65rem", color:"#55554F", letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer" }}>
            {textMode ? (hasASR ? "🎙 Voice mode" : "") : "⌨ Type instead"}
          </div>
        </div>
      </div>
    </>
  );
}
