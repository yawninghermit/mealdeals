import { useState } from "react";

const SAMPLE_DEALS = [
  {
    id: 1, title: "Meatball Monday — 2 subs for $10", restaurant: "McLanahan's",
    price: "$10", normalPrice: "$16", category: "Subs", mealTime: "Lunch",
    description: "Every Monday 11am–3pm. Each sub comes with chips and a fountain drink. Meatball or chicken parm — both are massive, easily shareable. Cash preferred but card works.",
    votes: 142, distance: "0.4 mi", days: ["Mo"], hours: "11am–3pm",
    includes: ["Drink", "Side"], verified: true,
    comments: [
      { id: 1, user: "hungry_nittany", text: "Portion size is massive. The meatball sub alone is like 12 inches. 100% worth it, gets crowded around noon though.", votes: 34 },
      { id: 2, user: "deals_daily", text: "Does the drink include iced coffee or just fountain? Went last week and wasn't sure.", votes: 8 },
      { id: 3, user: "psu_eats", text: "Fountain only but free refills. Still a great deal honestly.", votes: 21 },
    ]
  },
  {
    id: 2, title: "$7 chili buffet — all you can eat", restaurant: "Rathskeller",
    price: "$7", normalPrice: null, category: "American", mealTime: "Lunch",
    description: "Runs Wed 11:30am–4pm. All-you-can-eat chili, cornbread, and toppings bar. Add a $3 Stella pint and you're fed and happy for under $10.",
    votes: 87, distance: "0.8 mi", days: ["We"], hours: "11:30am–4pm",
    includes: ["Refills"], verified: false,
    comments: [
      { id: 1, user: "rath_regular", text: "Been going here for 2 years. Never disappoints. The cornbread alone is worth it.", votes: 19 },
    ]
  },
  {
    id: 3, title: "$1 pizza slices weekday lunch", restaurant: "Giuseppe's Pizzeria",
    price: "$1/slice", normalPrice: null, category: "Pizza", mealTime: "Lunch",
    description: "Weekday lunch special. Plain and pepperoni only. Usually sells out by 1pm so get there early. Cash preferred.",
    votes: 54, distance: "1.1 mi", days: ["Mo","Tu","We","Th","Fr"], hours: "11am–1pm",
    includes: [], verified: true,
    comments: [
      { id: 1, user: "pizzawatch_psu", text: "Get there before 12:30 or forget it. Slices are gone fast.", votes: 45 },
      { id: 2, user: "slice_hunter", text: "Tried going at 1:15 last Tuesday. Completely sold out. Go early.", votes: 28 },
    ]
  },
  {
    id: 4, title: "Wing Wednesday — 50¢ wings", restaurant: "Café 210 West",
    price: "50¢/wing", normalPrice: null, category: "Wings", mealTime: "Dinner",
    description: "Every Wednesday starting at 5pm. 10 sauce options. Min order of 10 wings. Pairs great with their $3 draft specials running the same night.",
    votes: 201, distance: "0.5 mi", days: ["We"], hours: "5pm–close",
    includes: ["Drink"], verified: true,
    comments: [
      { id: 1, user: "wing_king_814", text: "Best wings in State College, not even close. Buffalo garlic is the move.", votes: 67 },
    ]
  },
  {
    id: 5, title: "Lunch bowl + drink daily special", restaurant: "Penn Pide",
    price: "$9", normalPrice: "$15", category: "Mediterranean", mealTime: "Lunch",
    description: "Daily lunch special includes a rice bowl or wrap, side salad, and fountain drink. Lamb, chicken, or falafel options. Great portion size.",
    votes: 31, distance: "0.6 mi", days: ["Mo","Tu","We","Th","Fr"], hours: "11am–3pm",
    includes: ["Drink", "Side"], verified: false,
    comments: []
  },
  {
    id: 6, title: "Happy hour half-price apps", restaurant: "Applebee's",
    price: "50% off", normalPrice: null, category: "American", mealTime: "Happy Hour",
    description: "Mon–Fri 3–6pm. Half off all appetizers. Boneless wings, mozzarella sticks, loaded fries — all half price. Great for a group.",
    votes: 44, distance: "1.8 mi", days: ["Mo","Tu","We","Th","Fr"], hours: "3pm–6pm",
    includes: [], verified: false,
    comments: [
      { id: 1, user: "applebees_fan", text: "The half price boneless wings are actually solid. 8 for like $6.", votes: 12 },
    ]
  },
  {
    id: 7, title: "$3 cheeseburgers — quarter pound", restaurant: "Brother's Bar & Grill",
    price: "$3", normalPrice: null, category: "Burgers", mealTime: "Dinner",
    description: "Quarter pound before cooking. Your choice of cheese, plus lettuce, tomato, onion, and pickle. Ketchup and mustard on the side. One of the best burger deals downtown — hard to beat for $3.",
    votes: 0, distance: "downtown", days: [], hours: "Check with bar",
    includes: [], verified: true,
    comments: []
  },
  {
    id: 8, title: "$1 tacos every Sunday at noon", restaurant: "Champs Bar & Grill",
    price: "$1", normalPrice: null, category: "Tacos", mealTime: "Lunch",
    description: "Every Sunday starting at noon. Rotating meat each week — you never know what you're getting until you show up. Minimal toppings, but at $1 a taco you can stack up as many as you want.",
    votes: 0, distance: "downtown", days: ["Su"], hours: "Sundays from noon",
    includes: [], verified: true,
    comments: []
  },
];

const CATEGORIES = ["All", "Pizza", "Wings", "Subs", "Burgers", "Tacos", "Mediterranean", "American", "Breakfast"];
const MEAL_TIMES = ["All", "Breakfast", "Lunch", "Dinner", "Happy Hour"];
const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

export default function MealDeals() {
  const [screen, setScreen] = useState("home");
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [deals, setDeals] = useState(SAMPLE_DEALS);
  const [votedDeals, setVotedDeals] = useState({});
  const [mealFilter, setMealFilter] = useState("All");
  const [catFilter, setCatFilter] = useState("All");
  const [sortBy, setSortBy] = useState("top");
  const [searchQuery, setSearchQuery] = useState("");
  const [newComment, setNewComment] = useState("");
  const [postForm, setPostForm] = useState({
    title: "", restaurant: "", price: "", description: "",
    category: "Pizza", mealTime: "Lunch", days: [], includes: []
  });
  const [postSuccess, setPostSuccess] = useState(false);

  const handleVote = (dealId, dir) => {
    const key = `${dealId}-${dir}`;
    const opposite = `${dealId}-${dir === "up" ? "down" : "up"}`;
    setDeals(prev => prev.map(d => {
      if (d.id !== dealId) return d;
      const wasVoted = votedDeals[key];
      const wasOpposite = votedDeals[opposite];
      const delta = wasVoted ? (dir === "up" ? -1 : 1) : (dir === "up" ? 1 : -1);
      const extra = wasOpposite ? (dir === "up" ? 1 : -1) : 0;
      return { ...d, votes: d.votes + delta + extra };
    }));
    setVotedDeals(prev => {
      const next = { ...prev };
      const opposite2 = `${dealId}-${dir === "up" ? "down" : "up"}`;
      if (next[key]) { delete next[key]; }
      else { next[key] = true; delete next[opposite2]; }
      return next;
    });
  };

  const handleComment = (dealId) => {
    if (!newComment.trim()) return;
    setDeals(prev => prev.map(d => {
      if (d.id !== dealId) return d;
      return { ...d, comments: [...d.comments, { id: Date.now(), user: "you", text: newComment.trim(), votes: 0 }] };
    }));
    setNewComment("");
  };

  const handlePostDeal = () => {
    if (!postForm.title || !postForm.restaurant || !postForm.price) return;
    const newDeal = {
      id: Date.now(), ...postForm, votes: 1, distance: "near you",
      hours: "See description", verified: false, comments: [], normalPrice: null
    };
    setDeals(prev => [newDeal, ...prev]);
    setPostSuccess(true);
    setTimeout(() => { setPostSuccess(false); setScreen("home"); }, 1800);
  };

  const toggleDay = (day) => {
    setPostForm(prev => ({
      ...prev, days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day]
    }));
  };

  const toggleInclude = (item) => {
    setPostForm(prev => ({
      ...prev, includes: prev.includes.includes(item) ? prev.includes.filter(i => i !== item) : [...prev.includes, item]
    }));
  };

  const filteredDeals = deals.filter(d => {
    if (mealFilter !== "All" && d.mealTime !== mealFilter) return false;
    if (catFilter !== "All" && d.category !== catFilter) return false;
    if (searchQuery && !d.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !d.restaurant.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }).sort((a, b) => sortBy === "top" ? b.votes - a.votes : b.id - a.id);

  const openDeal = deals.find(d => d.id === selectedDeal);

  const styles = {
    root: { fontFamily: "'DM Sans', sans-serif", background: "var(--bg)", minHeight: "100vh", color: "var(--text)" },
    nav: { display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 10 },
    logo: { fontSize: 20, fontWeight: 700, color: "var(--accent)", letterSpacing: "-0.5px", cursor: "pointer" },
    navRight: { marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" },
    navBtn: { padding: "7px 14px", borderRadius: 20, border: "1px solid var(--border)", fontSize: 13, background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" },
    navBtnActive: { padding: "7px 14px", borderRadius: 20, border: "1px solid var(--accent)", fontSize: 13, background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 },
    page: { maxWidth: 720, margin: "0 auto", padding: "20px 16px" },
    filterBar: { display: "flex", gap: 8, overflowX: "auto", marginBottom: 12, paddingBottom: 4 },
    chip: { flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
    chipActive: { flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "1px solid var(--accent)", fontSize: 13, background: "var(--accent-light)", color: "var(--accent-dark)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap" },
    sortRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13, color: "var(--text-muted)" },
    sortBtn: { padding: "4px 10px", borderRadius: 6, border: "none", background: "transparent", fontSize: 13, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" },
    sortBtnActive: { padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--surface-2)", fontSize: 13, color: "var(--text)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 },
    card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px", marginBottom: 12, cursor: "pointer", transition: "border-color 0.15s" },
    cardHeader: { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 },
    voteCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 38 },
    voteBtn: { width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" },
    voteBtnUp: { width: 30, height: 30, borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent-light)", cursor: "pointer", fontSize: 13, color: "var(--accent-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" },
    voteBtnDown: { width: 30, height: 30, borderRadius: 8, border: "1px solid #e24b4a", background: "#fcebeb", cursor: "pointer", fontSize: 13, color: "#a32d2d", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" },
    voteCount: { fontSize: 15, fontWeight: 700, color: "var(--text)" },
    dealBody: { flex: 1 },
    titleRow: { display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap", marginBottom: 4 },
    dealTitle: { fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 },
    priceBadge: { background: "#eaf3de", border: "1px solid #97c459", color: "#3b6d11", fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20, whiteSpace: "nowrap" },
    badge: { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 11, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" },
    desc: { fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 8 },
    metaRow: { display: "flex", gap: 12, fontSize: 12, color: "var(--text-faint)", alignItems: "center", flexWrap: "wrap" },
    verified: { color: "#1d9e75", fontWeight: 600, fontSize: 11 },
    divider: { borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12 },
    commentToggle: { fontSize: 13, color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 },
    commentBox: { background: "var(--surface-2)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 },
    commentUser: { fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 3 },
    commentText: { fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 },
    inputRow: { display: "flex", gap: 8, marginTop: 10 },
    input: { flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none" },
    btn: { padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 13, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" },
    btnPrimary: { padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--accent)", fontSize: 14, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 },
    searchBar: { display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 16px", marginBottom: 16 },
    searchInput: { flex: 1, border: "none", background: "transparent", fontSize: 15, color: "var(--text)", fontFamily: "inherit", outline: "none" },
    formCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px", marginBottom: 14 },
    sectionLabel: { fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 },
    field: { marginBottom: 14 },
    label: { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6 },
    textInput: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
    textarea: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", height: 90, resize: "none", lineHeight: 1.5 },
    row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    dayChip: { width: 38, height: 38, borderRadius: "50%", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "var(--surface-2)" },
    dayChipActive: { width: 38, height: 38, borderRadius: "50%", border: "1px solid var(--accent)", fontSize: 12, fontWeight: 700, color: "var(--accent-dark)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "var(--accent-light)" },
    includeItem: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" },
    successBanner: { background: "#eaf3de", border: "1px solid #97c459", color: "#3b6d11", borderRadius: 12, padding: "16px 20px", textAlign: "center", fontSize: 15, fontWeight: 700, marginBottom: 16 },
    backBtn: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", cursor: "pointer", marginBottom: 16, background: "none", border: "none", fontFamily: "inherit", padding: 0 },
    emptyState: { textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" },
    includesRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 },
    includeBadge: { background: "#e6f1fb", border: "1px solid #85b7eb", color: "#185fa5", fontSize: 11, padding: "2px 8px", borderRadius: 20 },
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap');
    :root {
      --bg: #f7f5f2;
      --surface: #ffffff;
      --surface-2: #f2f0ec;
      --border: #e5e1da;
      --text: #1a1816;
      --text-muted: #6b6560;
      --text-faint: #a09a93;
      --accent: #d85a30;
      --accent-light: #faece7;
      --accent-dark: #993c1d;
    }
    * { box-sizing: border-box; }
    input::placeholder { color: var(--text-faint); }
    textarea::placeholder { color: var(--text-faint); }
    ::-webkit-scrollbar { height: 4px; width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  `;

  return (
    <div style={styles.root}>
      <style>{css}</style>

      {/* Nav */}
      <div style={styles.nav}>
        <div style={styles.logo} onClick={() => setScreen("home")}>MealDeals</div>
        <div style={styles.navRight}>
          <button style={screen === "explore" ? styles.navBtnActive : styles.navBtn} onClick={() => setScreen("explore")}>Explore</button>
          <button style={styles.navBtnActive} onClick={() => setScreen("post")}>+ Post a deal</button>
        </div>
      </div>

      {/* HOME */}
      {screen === "home" && (
        <div style={styles.page}>
          <div style={styles.searchBar}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <input style={styles.searchInput} placeholder="Search deals, restaurants..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && <span style={{ fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }} onClick={() => setSearchQuery("")}>✕</span>}
          </div>

          <div style={styles.filterBar}>
            {MEAL_TIMES.map(t => (
              <button key={t} style={mealFilter === t ? styles.chipActive : styles.chip} onClick={() => setMealFilter(t)}>{t}</button>
            ))}
          </div>
          <div style={{ ...styles.filterBar, marginBottom: 16 }}>
            {CATEGORIES.map(c => (
              <button key={c} style={catFilter === c ? styles.chipActive : styles.chip} onClick={() => setCatFilter(c)}>{c}</button>
            ))}
          </div>

          <div style={styles.sortRow}>
            Sort:
            {["top", "new"].map(s => (
              <button key={s} style={sortBy === s ? styles.sortBtnActive : styles.sortBtn} onClick={() => setSortBy(s)}>{s === "top" ? "Top" : "New"}</button>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-faint)" }}>{filteredDeals.length} deals</span>
          </div>

          {filteredDeals.length === 0 && (
            <div style={styles.emptyState}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🍽️</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No deals found</div>
              <div style={{ fontSize: 13 }}>Try a different filter or <span style={{ color: "var(--accent)", cursor: "pointer" }} onClick={() => setScreen("post")}>post one!</span></div>
            </div>
          )}

          {filteredDeals.map(deal => (
            <DealCard key={deal.id} deal={deal} styles={styles} votedDeals={votedDeals}
              onVote={handleVote} onClick={() => { setSelectedDeal(deal.id); setScreen("deal"); }} />
          ))}
        </div>
      )}

      {/* EXPLORE */}
      {screen === "explore" && (
        <div style={styles.page}>
          <div style={styles.searchBar}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <input style={styles.searchInput} placeholder="Search deals, restaurants, dishes..." value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: "var(--text)" }}>Trending right now 🔥</div>
            <div style={styles.filterBar}>
              {["Meatball Monday", "$1 slices", "Wing Wednesday", "Happy hour", "Under $8", "Taco Tuesday"].map(t => (
                <button key={t} style={{ ...styles.chip, background: "var(--accent-light)", border: "1px solid #f0997b", color: "var(--accent-dark)", fontWeight: 600 }}
                  onClick={() => { setSearchQuery(t); setScreen("home"); }}>{t}</button>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "var(--text)" }}>Browse by category</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 24 }}>
            {[["🍕","Pizza","24"],["🍗","Wings","18"],["🥖","Subs","11"],["🌮","Tacos","9"],["🍔","Burgers","15"],["🥗","Salads","7"],["🍳","Breakfast","13"],["🍺","Happy Hour","20"]].map(([icon,name,count]) => (
              <div key={name} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 8px", textAlign: "center", cursor: "pointer" }}
                onClick={() => { setCatFilter(name === "Happy Hour" ? "American" : name); setScreen("home"); }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>{name}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{count} deals</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>Top deals near you</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Within 2 miles · Updated today</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {deals.slice(0,4).map(d => (
              <div key={d.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, cursor: "pointer" }}
                onClick={() => { setSelectedDeal(d.id); setScreen("deal"); }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.3, flex: 1 }}>{d.title}</div>
                  <div style={{ ...styles.priceBadge, flexShrink: 0 }}>{d.price}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{d.restaurant}</div>
                <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--text-faint)", alignItems: "center" }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>▲ {d.votes}</span>
                  <span>{d.distance}</span>
                  <span>{d.hours}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DEAL DETAIL */}
      {screen === "deal" && openDeal && (
        <div style={styles.page}>
          <button style={styles.backBtn} onClick={() => setScreen("home")}>← Back to deals</button>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
            <div style={styles.cardHeader}>
              <div style={styles.voteCol}>
                <button style={votedDeals[`${openDeal.id}-up`] ? styles.voteBtnUp : styles.voteBtn}
                  onClick={() => handleVote(openDeal.id, "up")}>▲</button>
                <div style={styles.voteCount}>{openDeal.votes}</div>
                <button style={votedDeals[`${openDeal.id}-down`] ? styles.voteBtnDown : styles.voteBtn}
                  onClick={() => handleVote(openDeal.id, "down")}>▼</button>
              </div>
              <div style={styles.dealBody}>
                <div style={styles.titleRow}>
                  <div style={{ ...styles.dealTitle, fontSize: 17 }}>{openDeal.title}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  <span style={styles.priceBadge}>{openDeal.price}</span>
                  {openDeal.normalPrice && <span style={{ ...styles.badge, textDecoration: "line-through" }}>{openDeal.normalPrice}</span>}
                  <span style={styles.badge}>{openDeal.mealTime}</span>
                  <span style={styles.badge}>{openDeal.category}</span>
                  {openDeal.verified && <span style={styles.verified}>✓ Verified</span>}
                </div>
                <div style={{ fontSize: 15, color: "var(--text)", marginBottom: 12, lineHeight: 1.6 }}>{openDeal.description}</div>
                <div style={styles.metaRow}>
                  <span>📍 {openDeal.restaurant}</span>
                  <span>📏 {openDeal.distance}</span>
                  <span>🕐 {openDeal.hours}</span>
                </div>
                {openDeal.days.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    {DAYS_SHORT.map(d => (
                      <div key={d} style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--border)", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                        background: openDeal.days.includes(d) ? "var(--accent-light)" : "var(--surface-2)",
                        color: openDeal.days.includes(d) ? "var(--accent-dark)" : "var(--text-faint)",
                        borderColor: openDeal.days.includes(d) ? "var(--accent)" : "var(--border)" }}>{d}</div>
                    ))}
                  </div>
                )}
                {openDeal.includes.length > 0 && (
                  <div style={styles.includesRow}>
                    {openDeal.includes.map(inc => <span key={inc} style={styles.includeBadge}>✓ {inc}</span>)}
                  </div>
                )}
              </div>
            </div>

            <div style={styles.divider}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
                💬 {openDeal.comments.length} comment{openDeal.comments.length !== 1 ? "s" : ""}
              </div>
              {openDeal.comments.map(c => (
                <div key={c.id} style={{ ...styles.commentBox, marginBottom: 8 }}>
                  <div style={styles.commentUser}>u/{c.user}</div>
                  <div style={styles.commentText}>{c.text}</div>
                </div>
              ))}
              {openDeal.comments.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 12 }}>No comments yet — be the first!</div>
              )}
              <div style={styles.inputRow}>
                <input style={styles.input} placeholder="Share your experience — portion size, tips, what's included..." value={newComment} onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleComment(openDeal.id)} />
                <button style={styles.btnPrimary} onClick={() => handleComment(openDeal.id)}>Post</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POST A DEAL */}
      {screen === "post" && (
        <div style={styles.page}>
          <button style={styles.backBtn} onClick={() => setScreen("home")}>← Back</button>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Post a deal</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>Share a deal you've found — help the community eat well for less.</div>

          {postSuccess && <div style={styles.successBanner}>🎉 Deal posted! Taking you back...</div>}

          <div style={styles.formCard}>
            <div style={styles.sectionLabel}>Restaurant info</div>
            <div style={styles.field}>
              <label style={styles.label}>Restaurant name *</label>
              <input style={styles.textInput} placeholder="e.g. McLanahan's, Rathskeller..." value={postForm.restaurant} onChange={e => setPostForm(p => ({ ...p, restaurant: e.target.value }))} />
            </div>
          </div>

          <div style={styles.formCard}>
            <div style={styles.sectionLabel}>The deal</div>
            <div style={styles.field}>
              <label style={styles.label}>Deal title *</label>
              <input style={styles.textInput} placeholder="e.g. Meatball Monday — 2 subs for $10" value={postForm.title} onChange={e => setPostForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Description</label>
              <textarea style={styles.textarea} placeholder="What's included? Any tips for ordering? Portion size? Any catches?" value={postForm.description} onChange={e => setPostForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div style={styles.row2}>
              <div style={styles.field}>
                <label style={styles.label}>Deal price *</label>
                <input style={styles.textInput} placeholder="e.g. $7, $1/slice, 50% off" value={postForm.price} onChange={e => setPostForm(p => ({ ...p, price: e.target.value }))} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Normal price</label>
                <input style={styles.textInput} placeholder="$0.00 (shows savings)" />
              </div>
            </div>
          </div>

          <div style={styles.formCard}>
            <div style={styles.sectionLabel}>What's included</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {["Drink", "Side", "Dessert", "Free refills", "Shareable", "Dine-in only"].map(item => (
                <label key={item} style={styles.includeItem}>
                  <input type="checkbox" checked={postForm.includes.includes(item)} onChange={() => toggleInclude(item)} style={{ accentColor: "var(--accent)" }} />
                  {item}
                </label>
              ))}
            </div>
          </div>

          <div style={styles.formCard}>
            <div style={styles.sectionLabel}>Category & meal time</div>
            <div style={styles.field}>
              <label style={styles.label}>Category</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Pizza","Wings","Subs","Burgers","Tacos","Mediterranean","American","Breakfast","Other"].map(c => (
                  <button key={c} style={postForm.category === c ? styles.chipActive : styles.chip} onClick={() => setPostForm(p => ({ ...p, category: c }))}>{c}</button>
                ))}
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Meal time</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Breakfast","Lunch","Dinner","Happy Hour","Late Night"].map(m => (
                  <button key={m} style={postForm.mealTime === m ? styles.chipActive : styles.chip} onClick={() => setPostForm(p => ({ ...p, mealTime: m }))}>{m}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.formCard}>
            <div style={styles.sectionLabel}>When is this deal available?</div>
            <div style={styles.field}>
              <label style={styles.label}>Days</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DAYS_SHORT.map(d => (
                  <div key={d} style={postForm.days.includes(d) ? styles.dayChipActive : styles.dayChip} onClick={() => toggleDay(d)}>{d}</div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button style={{ ...styles.btn, padding: "12px 20px", fontSize: 14 }} onClick={() => setScreen("home")}>Cancel</button>
            <button style={{ ...styles.btnPrimary, flex: 1, fontSize: 15 }} onClick={handlePostDeal}>Post deal →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DealCard({ deal, styles, votedDeals, onVote, onClick }) {
  const [showComments, setShowComments] = useState(false);
  return (
    <div style={styles.card} onClick={onClick}>
      <div style={styles.cardHeader}>
        <div style={styles.voteCol} onClick={e => e.stopPropagation()}>
          <button style={votedDeals[`${deal.id}-up`] ? styles.voteBtnUp : styles.voteBtn} onClick={() => onVote(deal.id, "up")}>▲</button>
          <div style={styles.voteCount}>{deal.votes}</div>
          <button style={votedDeals[`${deal.id}-down`] ? styles.voteBtnDown : styles.voteBtn} onClick={() => onVote(deal.id, "down")}>▼</button>
        </div>
        <div style={styles.dealBody}>
          <div style={styles.titleRow}>
            <span style={styles.dealTitle}>{deal.title}</span>
            <span style={styles.priceBadge}>{deal.price}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={styles.badge}>{deal.mealTime}</span>
            <span style={styles.badge}>{deal.category}</span>
            {deal.verified && <span style={styles.verified}>✓ Verified</span>}
          </div>
          <div style={styles.desc}>{deal.description}</div>
          <div style={styles.metaRow}>
            <span>📍 {deal.restaurant}</span>
            <span>📏 {deal.distance}</span>
            <span>🕐 {deal.hours}</span>
            <span onClick={e => { e.stopPropagation(); setShowComments(s => !s); }} style={{ ...styles.commentToggle, marginLeft: "auto" }}>
              💬 {deal.comments.length} {deal.comments.length === 1 ? "comment" : "comments"}
            </span>
          </div>
        </div>
      </div>
      {showComments && deal.comments.length > 0 && (
        <div style={styles.divider} onClick={e => e.stopPropagation()}>
          {deal.comments.slice(0, 2).map(c => (
            <div key={c.id} style={{ ...styles.commentBox, marginBottom: 6 }}>
              <div style={styles.commentUser}>u/{c.user}</div>
              <div style={styles.commentText}>{c.text}</div>
            </div>
          ))}
          {deal.comments.length > 2 && (
            <div style={{ fontSize: 12, color: "var(--accent)", cursor: "pointer", marginTop: 4 }} onClick={onClick}>
              View all {deal.comments.length} comments →
            </div>
          )}
        </div>
      )}
    </div>
  );
}
