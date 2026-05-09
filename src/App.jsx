import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import MapView from "./MapView";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const mapDeal = (d) => ({
  ...d,
  mealTimes: d.meal_times || [],
  normalPrice: d.normal_price,
  expiredAt: d.expired_at,
  imageUrl: d.image_url ?? null,
  comments: (d.comments || []).map(c => ({ ...c, user: c.username, votes: 0 })),
});

const username = (user) => user?.email?.split("@")[0] ?? "anonymous";

const useIsMobile = (breakpoint = 640) => {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
};

const timeAgo = (ts) => {
  if (!ts) return "";
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const avatarColor = (name = "") => {
  const colors = ["#e07b54","#5b8dd9","#59a96a","#9b6dcc","#d4a017","#3aa8a8"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
};

const buildTree = (comments) => {
  const map = {};
  const roots = [];
  comments.forEach(c => { map[c.id] = { ...c, replies: [] }; });
  comments.forEach(c => {
    if (c.parent_id && map[c.parent_id]) map[c.parent_id].replies.push(map[c.id]);
    else roots.push(map[c.id]);
  });
  return roots;
};

const MEAL_TIMES = ["All", "Breakfast", "Lunch", "Dinner"];
const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

export default function MealDeals() {
  const isMobile = useIsMobile();
  const [screen, setScreen] = useState("home");
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [authModal, setAuthModal] = useState(null); // "login" | "signup" | "forgot" | null
  const [resetPassword, setResetPassword] = useState(false);
  const [votedDeals, setVotedDeals] = useState(() => {
    try { return JSON.parse(localStorage.getItem("votedDeals") || "{}"); }
    catch { return {}; }
  });
  const [mealFilter, setMealFilter] = useState("All");
  const [dayFilter, setDayFilter] = useState([DAYS_SHORT[new Date().getDay()]]);
  const [sortBy, setSortBy] = useState("top");
  const [savedDealIds, setSavedDealIds] = useState(new Set());

  const [searchQuery, setSearchQuery] = useState("");
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [postForm, setPostForm] = useState({
    title: "", restaurant: "", address: "", price: "", normalPrice: "", description: "",
    mealTimes: [], days: [], includes: []
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState(null);
  const imageInputRef = useRef(null);
  const [geocoding, setGeocoding] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);
  const [postError, setPostError] = useState("");
  const [editingDealId, setEditingDealId] = useState(null);

  const fetchRole = async (userId) => {
    if (!userId) { setRole(null); return; }
    const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
    setRole(data?.role ?? "user");
  };

  const fetchSaved = async (userId) => {
    if (!userId) { setSavedDealIds(new Set()); return; }
    const { data } = await supabase.from("saved_deals").select("deal_id").eq("user_id", userId);
    setSavedDealIds(new Set((data || []).map(r => r.deal_id)));
  };

  useEffect(() => {
    fetchDeals();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      fetchRole(session?.user?.id ?? null);
      fetchSaved(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      fetchRole(session?.user?.id ?? null);
      fetchSaved(session?.user?.id ?? null);
      if (event === "PASSWORD_RECOVERY") setResetPassword(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const toggleSaveDeal = async (dealId) => {
    if (!user) { setAuthModal("login"); return; }
    const isSaved = savedDealIds.has(dealId);
    const next = new Set(savedDealIds);
    if (isSaved) next.delete(dealId); else next.add(dealId);
    setSavedDealIds(next);
    if (isSaved) {
      const { error } = await supabase.from("saved_deals").delete().eq("user_id", user.id).eq("deal_id", dealId);
      if (error) { setSavedDealIds(savedDealIds); }
    } else {
      const { error } = await supabase.from("saved_deals").insert({ user_id: user.id, deal_id: dealId });
      if (error) { setSavedDealIds(savedDealIds); }
    }
  };

  const fetchDeals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("deals")
      .select("*, comments(*)")
      .order("votes", { ascending: false });
    if (!error && data) setDeals(data.map(mapDeal));
    setLoading(false);
  };

  const handleVote = async (dealId, dir) => {
    if (!user) { setAuthModal("login"); return; }
    const key = `${dealId}-${dir}`;
    const opposite = `${dealId}-${dir === "up" ? "down" : "up"}`;
    const wasVoted = votedDeals[key];
    const wasOpposite = votedDeals[opposite];
    const delta = wasVoted ? (dir === "up" ? -1 : 1) : (dir === "up" ? 1 : -1);
    const extra = wasOpposite ? (dir === "up" ? 1 : -1) : 0;
    const totalDelta = delta + extra;

    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, votes: d.votes + totalDelta } : d));

    const newVoted = { ...votedDeals };
    if (newVoted[key]) { delete newVoted[key]; }
    else { newVoted[key] = true; delete newVoted[opposite]; }
    setVotedDeals(newVoted);
    localStorage.setItem("votedDeals", JSON.stringify(newVoted));

    await supabase.rpc("increment_votes", { deal_id: dealId, delta: totalDelta });
  };

  const handleDeleteDeal = async (dealId) => {
    if (!window.confirm("Delete this deal?")) return;
    const { error } = await supabase.from("deals").delete().eq("id", dealId);
    if (!error) {
      setDeals(prev => prev.filter(d => d.id !== dealId));
      if (selectedDeal === dealId) setScreen("home");
    }
  };

  const handleToggleExpired = async (deal) => {
    const newVal = deal.expiredAt ? null : new Date().toISOString();
    const { error } = await supabase.from("deals").update({ expired_at: newVal }).eq("id", deal.id);
    if (!error) {
      setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, expiredAt: newVal } : d));
    }
  };

  const handleComment = async (dealId, parentId = null) => {
    if (!user) { setAuthModal("login"); return; }
    const text = parentId ? replyText.trim() : newComment.trim();
    if (!text) return;
    if (parentId) { setReplyText(""); setReplyingTo(null); } else setNewComment("");
    const { data, error } = await supabase
      .from("comments")
      .insert({ deal_id: dealId, username: username(user), text, user_id: user.id, parent_id: parentId })
      .select()
      .single();
    if (!error && data) {
      setDeals(prev => prev.map(d =>
        d.id === dealId ? { ...d, comments: [...d.comments, { ...data, user: data.username, votes: 0 }] } : d
      ));
    }
  };

  const handleDeleteComment = async (dealId, commentId) => {
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (!error) {
      setDeals(prev => prev.map(d =>
        d.id === dealId ? { ...d, comments: d.comments.filter(c => c.id !== commentId) } : d
      ));
    }
  };

  const geocodeAddress = async (address) => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  };

  const openEditDeal = (deal) => {
    setPostForm({
      title: deal.title,
      restaurant: deal.restaurant,
      address: deal.address || "",
      price: deal.price,
      normalPrice: deal.normalPrice || "",
      description: deal.description || "",
      mealTimes: deal.mealTimes || [],
      days: deal.days || [],
      includes: deal.includes || [],
    });
    setImageFile(null);
    setImagePreview(deal.imageUrl || null);
    setPostError("");
    setEditingDealId(deal.id);
    setScreen("post");
  };

  const uploadDealImage = async (file) => {
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    setUploadingImage(true);
    setImageError(null);
    const { error } = await supabase.storage.from("deal-images").upload(path, file, { upsert: true });
    setUploadingImage(false);
    if (error) {
      setImageError(`Upload failed: ${error.message}`);
      return null;
    }
    const { data } = supabase.storage.from("deal-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const handlePostDeal = async () => {
    if (!user) { setAuthModal("login"); return; }
    if (!postForm.title || !postForm.restaurant || !postForm.price) return;
    setPostError("");

    const originalDeal = editingDealId ? deals.find(d => d.id === editingDealId) : null;
    const addressChanged = !originalDeal || (postForm.address.trim() !== (originalDeal.address || "").trim());

    let lat = originalDeal?.lat ?? null;
    let lng = originalDeal?.lng ?? null;
    if (postForm.address.trim() && addressChanged) {
      setGeocoding(true);
      const coords = await geocodeAddress(postForm.address.trim());
      setGeocoding(false);
      if (coords) { lat = coords.lat; lng = coords.lng; }
      else { lat = null; lng = null; }
    } else if (!postForm.address.trim()) {
      lat = null; lng = null;
    }

    let imageUrl = imagePreview && !imageFile ? imagePreview : null;
    if (imageFile) {
      imageUrl = await uploadDealImage(imageFile);
      if (!imageUrl) return;
    }

    if (editingDealId) {
      const { data, error } = await supabase
        .from("deals")
        .update({
          title: postForm.title,
          restaurant: postForm.restaurant,
          price: postForm.price,
          description: postForm.description,
          meal_times: postForm.mealTimes,
          days: postForm.days,
          includes: postForm.includes,
          normal_price: postForm.normalPrice.trim() || null,
          address: postForm.address.trim() || null,
          lat,
          lng,
          ...(imageFile || imagePreview === null ? { image_url: imageUrl } : {}),
        })
        .eq("id", editingDealId)
        .select("*, comments(*)")
        .single();
      if (error) {
        setPostError(`Couldn't save: ${error.message}`);
      } else if (!data) {
        setPostError("Couldn't save — you may not have permission to edit this deal.");
      } else {
        setDeals(prev => prev.map(d => d.id === editingDealId ? mapDeal(data) : d));
        setEditingDealId(null);
        setPostForm({ title: "", restaurant: "", address: "", price: "", normalPrice: "", description: "", mealTimes: [], days: [], includes: [] });
        setImageFile(null);
        setImagePreview(null);
        setPostSuccess(true);
        setTimeout(() => { setPostSuccess(false); setScreen("deal"); }, 1800);
      }
      return;
    }

    const { data, error } = await supabase
      .from("deals")
      .insert({
        title: postForm.title,
        restaurant: postForm.restaurant,
        price: postForm.price,
        description: postForm.description,
        meal_times: postForm.mealTimes,
        days: postForm.days,
        includes: postForm.includes,
        votes: 1,
        distance: "near you",
        hours: "See description",
        verified: false,
        normal_price: postForm.normalPrice.trim() || null,
        user_id: user.id,
        address: postForm.address.trim() || null,
        lat,
        lng,
        image_url: imageUrl,
      })
      .select("*, comments(*)")
      .single();
    if (error) {
      setPostError(`Couldn't post: ${error.message}`);
    } else if (data) {
      setDeals(prev => [mapDeal(data), ...prev]);
      setPostSuccess(true);
      setPostForm({ title: "", restaurant: "", address: "", price: "", normalPrice: "", description: "", mealTimes: [], days: [], includes: [] });
      setImageFile(null);
      setImagePreview(null);
      setTimeout(() => { setPostSuccess(false); setScreen("home"); }, 1800);
    }
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
    if (mealFilter !== "All" && !(d.mealTimes || []).includes(mealFilter)) return false;
    if (dayFilter.length > 0 && d.days && d.days.length > 0 && !d.days.some(day => dayFilter.includes(day))) return false;
    if (searchQuery && !d.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !d.restaurant.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "newest") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    if (sortBy === "expiring") {
      const ax = a.expiredAt ? new Date(a.expiredAt).getTime() : Infinity;
      const bx = b.expiredAt ? new Date(b.expiredAt).getTime() : Infinity;
      return ax - bx;
    }
    return b.votes - a.votes;
  });

  const openDeal = deals.find(d => d.id === selectedDeal);

  const styles = {
    root: { fontFamily: "'DM Sans', sans-serif", background: "var(--bg)", minHeight: "100vh", color: "var(--text)" },
    nav: { display: "flex", alignItems: "center", gap: isMobile ? 6 : 12, padding: isMobile ? "12px 12px" : "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 10 },
    logo: { fontSize: isMobile ? 17 : 20, fontWeight: 700, color: "var(--accent)", letterSpacing: "-0.5px", cursor: "pointer" },
    navRight: { marginLeft: "auto", display: "flex", gap: isMobile ? 6 : 8, alignItems: "center" },
    navBtn: { padding: isMobile ? "8px 10px" : "7px 14px", borderRadius: 20, border: "1px solid var(--border)", fontSize: isMobile ? 12 : 13, background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" },
    navBtnActive: { padding: isMobile ? "8px 10px" : "7px 14px", borderRadius: 20, border: "1px solid var(--accent)", fontSize: isMobile ? 12 : 13, background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 },
    page: { maxWidth: 720, margin: "0 auto", padding: isMobile ? "16px 12px" : "20px 16px" },
    filterBar: { display: "flex", gap: 8, overflowX: "auto", marginBottom: 12, paddingBottom: 4 },
    chip: { flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface)", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
    chipActive: { flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "1px solid var(--accent)", fontSize: 13, background: "var(--accent-light)", color: "var(--accent-dark)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap" },
    sortRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 16, fontSize: 13, color: "var(--text-muted)" },
    sortBtn: { padding: "4px 10px", borderRadius: 6, border: "none", background: "transparent", fontSize: 13, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" },
    sortBtnActive: { padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--surface-2)", fontSize: 13, color: "var(--text)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 },
    card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px", marginBottom: 12, cursor: "pointer", transition: "border-color 0.15s" },
    cardHeader: { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 },
    voteCol: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: isMobile ? 44 : 38 },
    voteBtn: { width: isMobile ? 40 : 30, height: isMobile ? 40 : 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", fontSize: isMobile ? 16 : 13, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" },
    voteBtnUp: { width: isMobile ? 40 : 30, height: isMobile ? 40 : 30, borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent-light)", cursor: "pointer", fontSize: isMobile ? 16 : 13, color: "var(--accent-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" },
    voteBtnDown: { width: isMobile ? 40 : 30, height: isMobile ? 40 : 30, borderRadius: 8, border: "1px solid #e24b4a", background: "#fcebeb", cursor: "pointer", fontSize: isMobile ? 16 : 13, color: "#a32d2d", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" },
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
    commentBox: { display: "flex", gap: 10, marginBottom: 12 },
    commentAvatar: { width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: 1 },
    commentBody: { flex: 1, background: "var(--surface-2)", borderRadius: 10, padding: "8px 12px" },
    commentUser: { fontSize: 12, fontWeight: 700, color: "var(--text)" },
    commentTime: { fontSize: 11, color: "var(--text-faint)", marginLeft: 6 },
    commentText: { fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 3 },
    inputRow: { display: "flex", gap: 8, marginTop: 10 },
    input: { flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: isMobile ? 16 : 13, fontFamily: "inherit", outline: "none" },
    btn: { padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 13, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" },
    btnPrimary: { padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--accent)", fontSize: 14, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 },
    searchBar: { display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 16px", marginBottom: 16 },
    searchInput: { flex: 1, border: "none", background: "transparent", fontSize: isMobile ? 16 : 15, color: "var(--text)", fontFamily: "inherit", outline: "none" },
    formCard: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px", marginBottom: 14 },
    sectionLabel: { fontSize: 11, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 },
    field: { marginBottom: 14 },
    label: { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6 },
    textInput: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: isMobile ? 16 : 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
    textarea: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: isMobile ? 16 : 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", height: 90, resize: "none", lineHeight: 1.5 },
    row2: { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 },
    dayChip: { width: isMobile ? 44 : 38, height: isMobile ? 44 : 38, borderRadius: "50%", border: "1px solid var(--border)", fontSize: isMobile ? 13 : 12, fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "var(--surface-2)" },
    dayChipActive: { width: isMobile ? 44 : 38, height: isMobile ? 44 : 38, borderRadius: "50%", border: "1px solid var(--accent)", fontSize: isMobile ? 13 : 12, fontWeight: 700, color: "var(--accent-dark)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "var(--accent-light)" },
    includeItem: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" },
    successBanner: { background: "#eaf3de", border: "1px solid #97c459", color: "#3b6d11", borderRadius: 12, padding: "16px 20px", textAlign: "center", fontSize: 15, fontWeight: 700, marginBottom: 16 },
    backBtn: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", cursor: "pointer", marginBottom: 16, background: "none", border: "none", fontFamily: "inherit", padding: 0 },
    emptyState: { textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" },
    includesRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 },
    includeBadge: { background: "#e6f1fb", border: "1px solid #85b7eb", color: "#185fa5", fontSize: 11, padding: "2px 8px", borderRadius: 20 },
    expiredBadge: { display: "inline-flex", alignItems: "center", gap: 4, background: "#fdecea", border: "1px solid #e24b4a", color: "#a32d2d", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" },
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

      {authModal && authModal !== "forgot" && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} onSwitch={m => setAuthModal(m)} />}
      {authModal === "forgot" && <ForgotPasswordModal onClose={() => setAuthModal(null)} onSwitch={m => setAuthModal(m)} />}
      {resetPassword && <ResetPasswordModal onClose={() => setResetPassword(false)} />}

      {/* Nav */}
      <div style={styles.nav}>
        <div style={styles.logo} onClick={() => setScreen("home")}>MealDeals</div>
        <div style={styles.navRight}>
          <button style={screen === "map" ? styles.navBtnActive : styles.navBtn} onClick={() => setScreen("map")}>Map</button>
          {user && <button style={screen === "saved" ? styles.navBtnActive : styles.navBtn} onClick={() => setScreen("saved")}>{isMobile ? "★" : "★ Saved"}</button>}
          {user ? (
            <>
              {!isMobile && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>u/{username(user)}</span>}
              {role === "moderator" && <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--accent)", borderRadius: 20, padding: "2px 8px" }}>MOD</span>}
              <button style={styles.navBtn} onClick={() => supabase.auth.signOut()}>{isMobile ? "Out" : "Log out"}</button>
            </>
          ) : (
            <>
              <button style={styles.navBtn} onClick={() => setAuthModal("login")}>{isMobile ? "Log in" : "Log in"}</button>
              {!isMobile && <button style={styles.navBtn} onClick={() => setAuthModal("signup")}>Sign up</button>}
            </>
          )}
          <button style={styles.navBtnActive} onClick={() => user ? setScreen("post") : setAuthModal("login")}>{isMobile ? "+ Post" : "+ Post a deal"}</button>
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

          <div style={styles.filterBar}>
            {["All", ...DAYS_SHORT].map(d => {
              const isToday = d === DAYS_SHORT[new Date().getDay()];
              const isActive = d === "All" ? dayFilter.length === 0 : dayFilter.includes(d);
              return (
                <button key={d} style={isActive ? styles.chipActive : styles.chip} onClick={() => {
                  if (d === "All") { setDayFilter([]); }
                  else { setDayFilter(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]); }
                }}>
                  {d === "All" ? "All days" : d}{isToday && d !== "All" ? " •" : ""}
                </button>
              );
            })}
          </div>

          <div style={styles.sortRow}>
            <span>Sort:</span>
            {[["top","Top voted"],["newest","Newest"],["expiring","Expiring soon"]].map(([k,label]) => (
              <button key={k} style={sortBy === k ? styles.sortBtnActive : styles.sortBtn} onClick={() => setSortBy(k)}>{label}</button>
            ))}
          </div>

          {loading && <div style={styles.emptyState}><div style={{ fontSize: 13 }}>Loading deals...</div></div>}

          {!loading && filteredDeals.length === 0 && (
            <div style={styles.emptyState}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🍽️</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No deals yet</div>
              <div style={{ fontSize: 13 }}>Be the first to <span style={{ color: "var(--accent)", cursor: "pointer" }} onClick={() => user ? setScreen("post") : setAuthModal("login")}>post one!</span></div>
            </div>
          )}

          {!loading && filteredDeals.map(deal => (
            <DealCard key={deal.id} deal={deal} styles={styles} votedDeals={votedDeals}
              onVote={handleVote} onClick={() => { setSelectedDeal(deal.id); setScreen("deal"); }}
              canDelete={role === "moderator" || deal.user_id === user?.id}
              onDelete={handleDeleteDeal}
              isSaved={savedDealIds.has(deal.id)}
              onToggleSave={toggleSaveDeal} />
          ))}
        </div>
      )}

      {/* MAP */}
      {screen === "map" && (
        <MapView
          deals={deals}
          onDealClick={(id) => { setSelectedDeal(id); setScreen("deal"); }}
        />
      )}

      {/* SAVED */}
      {screen === "saved" && (
        <div style={styles.page}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>★ Saved deals</div>
          {deals.filter(d => savedDealIds.has(d.id)).length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>★</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No saved deals yet</div>
              <div style={{ fontSize: 13 }}>Tap the star on any deal to save it for later.</div>
            </div>
          ) : (
            deals.filter(d => savedDealIds.has(d.id)).map(deal => (
              <DealCard key={deal.id} deal={deal} styles={styles} votedDeals={votedDeals}
                onVote={handleVote} onClick={() => { setSelectedDeal(deal.id); setScreen("deal"); }}
                canDelete={role === "moderator" || deal.user_id === user?.id}
                onDelete={handleDeleteDeal}
                isSaved={savedDealIds.has(deal.id)}
                onToggleSave={toggleSaveDeal} />
            ))
          )}
        </div>
      )}

      {/* DEAL DETAIL */}
      {screen === "deal" && openDeal && (
        <div style={styles.page}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button style={styles.backBtn} onClick={() => setScreen("home")}>← Back to deals</button>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {openDeal?.expiredAt && (
                <span style={styles.expiredBadge}>🚩 Expired {new Date(openDeal.expiredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              )}
              {(role === "moderator" || openDeal?.user_id === user?.id) && (
                <button style={{ ...styles.btn, fontSize: 13, ...(openDeal?.expiredAt ? {} : { color: "#a32d2d", borderColor: "#e24b4a" }) }}
                  onClick={() => handleToggleExpired(openDeal)}>
                  {openDeal?.expiredAt ? "Mark active" : "🚩 Mark expired"}
                </button>
              )}
              {(role === "moderator" || openDeal?.user_id === user?.id) && (
                <button style={{ ...styles.btn, fontSize: 13 }} onClick={() => openEditDeal(openDeal)}>Edit</button>
              )}
              {(role === "moderator" || openDeal?.user_id === user?.id) && (
                <button style={{ ...styles.btn, color: "#e24b4a", borderColor: "#e24b4a", fontSize: 13 }}
                  onClick={() => handleDeleteDeal(openDeal.id)}>Delete deal</button>
              )}
            </div>
          </div>
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
                  <div style={{ ...styles.dealTitle, fontSize: 17, flex: 1 }}>{openDeal.title}</div>
                  <span onClick={() => toggleSaveDeal(openDeal.id)}
                    title={savedDealIds.has(openDeal.id) ? "Unsave" : "Save"}
                    style={{ fontSize: 22, cursor: "pointer", flexShrink: 0, color: savedDealIds.has(openDeal.id) ? "var(--accent)" : "var(--text-faint)", lineHeight: 1 }}>
                    {savedDealIds.has(openDeal.id) ? "★" : "☆"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {openDeal.normalPrice && <span style={{ ...styles.badge, position: "relative", overflow: "hidden", border: "1px solid #000" }}>{openDeal.normalPrice}<span style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom left, transparent calc(50% - 0.5px), var(--text-muted) calc(50% - 0.5px), var(--text-muted) calc(50% + 0.5px), transparent calc(50% + 0.5px))", pointerEvents: "none" }} /></span>}
                  <span style={styles.priceBadge}>{openDeal.price}</span>
                  {(openDeal.mealTimes || []).map(m => <span key={m} style={styles.badge}>{m}</span>)}
                  <span style={styles.badge}>{openDeal.category}</span>
                  {openDeal.verified && <span style={styles.verified}>✓ Verified</span>}
                </div>
                {openDeal.imageUrl && (
                  <img src={openDeal.imageUrl} alt={openDeal.title} style={{ maxWidth: "100%", maxHeight: 420, height: "auto", borderRadius: 10, marginBottom: 12, display: "block" }} />
                )}
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
              {buildTree(openDeal.comments).map(node => (
                <CommentNode key={node.id} node={node} dealId={openDeal.id}
                  user={user} role={role}
                  replyingTo={replyingTo} setReplyingTo={setReplyingTo}
                  replyText={replyText} setReplyText={setReplyText}
                  onComment={handleComment} onDelete={handleDeleteComment} styles={styles} />
              ))}
              {openDeal.comments.filter(c => !c.parent_id).length === 0 && (
                <div style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 12 }}>No comments yet — be the first!</div>
              )}
              {user ? (
                <div style={styles.inputRow}>
                  <input style={styles.input} placeholder="Share your experience..." value={newComment} onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleComment(openDeal.id)} />
                  <button style={styles.btnPrimary} onClick={() => handleComment(openDeal.id)}>Post</button>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                  <span style={{ color: "var(--accent)", cursor: "pointer" }} onClick={() => setAuthModal("login")}>Log in</span> to leave a comment.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POST A DEAL */}
      {screen === "post" && (
        <div style={styles.page}>
          <button style={styles.backBtn} onClick={() => { setEditingDealId(null); setPostError(""); setScreen(editingDealId ? "deal" : "home"); }}>← Back</button>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{editingDealId ? "Edit deal" : "Post a deal"}</div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>{editingDealId ? "Update the details below." : "Share a deal you've found — help the community eat well for less."}</div>

          {postSuccess && <div style={styles.successBanner}>{editingDealId ? "✓ Deal updated!" : "🎉 Deal posted! Taking you back..."}</div>}
          {postError && <div style={{ background: "#fce8e8", border: "1px solid #e24b4a", color: "#a02020", borderRadius: 12, padding: "12px 16px", fontSize: 14, marginBottom: 16 }}>{postError}</div>}

          <div style={styles.formCard}>
            <div style={styles.sectionLabel}>Restaurant info</div>
            <div style={styles.field}>
              <label style={styles.label}>Restaurant name *</label>
              <input style={styles.textInput} placeholder="e.g. McLanahan's, Rathskeller..." value={postForm.restaurant} onChange={e => setPostForm(p => ({ ...p, restaurant: e.target.value }))} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Address <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>(optional — shows on map)</span></label>
              <input style={styles.textInput} placeholder="e.g. 123 College Ave, State College, PA" value={postForm.address} onChange={e => setPostForm(p => ({ ...p, address: e.target.value }))} />
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
                <input style={styles.textInput} placeholder="e.g. $7, $1/slice, 50% off" value={postForm.price} onChange={e => { const v = e.target.value; setPostForm(p => ({ ...p, price: v && !v.startsWith("$") ? "$" + v : v })); }} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Normal price</label>
                <input style={styles.textInput} placeholder="$0.00 (shows savings)" value={postForm.normalPrice} onChange={e => { const v = e.target.value; setPostForm(p => ({ ...p, normalPrice: v && !v.startsWith("$") ? "$" + v : v })); }} />
              </div>
            </div>
          </div>

          <div style={styles.formCard}>
            <div style={styles.sectionLabel}>Photo <span style={{ color: "var(--text-faint)", fontWeight: 400, textTransform: "none", fontSize: 11 }}>(optional)</span></div>
            {imagePreview ? (
              <div style={{ position: "relative", marginBottom: 12 }}>
                <img src={imagePreview} alt="Deal preview" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 10, display: "block" }} />
                <button onClick={() => { setImageFile(null); setImagePreview(null); if (imageInputRef.current) imageInputRef.current.value = ""; }}
                  style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
            ) : (
              <div onClick={() => imageInputRef.current?.click()}
                style={{ border: "1.5px dashed var(--border)", borderRadius: 10, padding: "24px 16px", textAlign: "center", cursor: "pointer", background: "var(--surface-2)", marginBottom: 4 }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>Tap to add a photo</div>
                <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>Take a picture or choose from your library</div>
              </div>
            )}
            <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImageFile(file);
                setImagePreview(URL.createObjectURL(file));
                setImageError(null);
              }} />
            {imageError && <div style={{ fontSize: 12, color: "#e24b4a", marginTop: 6 }}>{imageError}</div>}
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
            <div style={styles.sectionLabel}>Meal time</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>Pick one or more</div>
            <div style={styles.field}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Breakfast","Lunch","Dinner"].map(m => (
                  <button key={m} style={postForm.mealTimes.includes(m) ? styles.chipActive : styles.chip} onClick={() => setPostForm(p => ({ ...p, mealTimes: p.mealTimes.includes(m) ? p.mealTimes.filter(x => x !== m) : [...p.mealTimes, m] }))}>{m}</button>
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
            <button style={{ ...styles.btn, padding: "12px 20px", fontSize: 14 }} onClick={() => { setEditingDealId(null); setPostError(""); setScreen("home"); }}>Cancel</button>
            <button style={{ ...styles.btnPrimary, flex: 1, fontSize: 15 }} onClick={handlePostDeal} disabled={geocoding || uploadingImage}>
              {uploadingImage ? "Uploading photo..." : geocoding ? "Finding location..." : editingDealId ? "Save changes →" : "Post deal →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Replace with your Cloudflare Turnstile site key from https://dash.cloudflare.com/
// Also enable CAPTCHA in your Supabase dashboard under Authentication > Settings
const TURNSTILE_SITE_KEY = "YOUR_TURNSTILE_SITE_KEY";

function AuthModal({ mode, onClose, onSwitch }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const turnstileRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!siteKey) return;
    const render = () => {
      if (turnstileRef.current && window.turnstile && !widgetIdRef.current) {
        try {
          widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
            sitekey: siteKey,
            callback: (token) => setCaptchaToken(token),
            "expired-callback": () => setCaptchaToken(null),
          });
        } catch (e) {
          console.error("Turnstile render failed:", e);
        }
      }
    };
    if (window.turnstile) {
      render();
    } else {
      const interval = setInterval(() => { if (window.turnstile) { clearInterval(interval); render(); } }, 100);
      return () => clearInterval(interval);
    }
    return () => {
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  const resetCaptcha = () => {
    if (widgetIdRef.current != null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
    setCaptchaToken(null);
  };

  const handleSubmit = async () => {
    if (!captchaToken) { setError("Please complete the CAPTCHA."); return; }
    if (mode === "signup" && password !== confirmPassword) { setError("Passwords do not match."); return; }
    setError("");
    setLoading(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password, options: { captchaToken } });
      if (error) { setError(error.message); resetCaptcha(); }
      else onClose();
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
      if (error) { setError(error.message); resetCaptcha(); }
      else onClose();
    }
    setLoading(false);
  };

  const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
  const modalStyle = { background: "var(--surface)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 8px 40px rgba(0,0,0,0.15)" };
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 10 };
  const btnStyle = { width: "100%", padding: "11px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 4, opacity: (!captchaToken || loading) ? 0.5 : 1 };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
          {mode === "signup" ? "Create an account" : "Welcome back"}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
          {mode === "signup" ? "Sign up to post deals and leave comments." : "Log in to your account."}
        </div>
        <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && mode === "login" && captchaToken && handleSubmit()} />
        {mode === "signup" && (
          <input style={inputStyle} type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && captchaToken && handleSubmit()} />
        )}
        <div ref={turnstileRef} style={{ marginBottom: 10 }} />
        {error && <div style={{ fontSize: 13, color: "#e24b4a", marginBottom: 8 }}>{error}</div>}
        <button style={btnStyle} onClick={handleSubmit} disabled={loading || !captchaToken}>
          {loading ? "..." : mode === "signup" ? "Sign up" : "Log in"}
        </button>
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginTop: 14 }}>
          {mode === "signup" ? "Already have an account? " : "No account? "}
          <span style={{ color: "var(--accent)", cursor: "pointer" }} onClick={() => onSwitch(mode === "signup" ? "login" : "signup")}>
            {mode === "signup" ? "Log in" : "Sign up"}
          </span>
        </div>
        {mode === "login" && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
            <span style={{ color: "var(--accent)", cursor: "pointer" }} onClick={() => onSwitch("forgot")}>Forgot password?</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ForgotPasswordModal({ onClose, onSwitch }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const turnstileRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!siteKey) return;
    const render = () => {
      if (turnstileRef.current && window.turnstile && !widgetIdRef.current) {
        try {
          widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
            sitekey: siteKey,
            callback: (token) => setCaptchaToken(token),
            "expired-callback": () => setCaptchaToken(null),
          });
        } catch (e) { console.error("Turnstile render failed:", e); }
      }
    };
    if (window.turnstile) { render(); }
    else {
      const interval = setInterval(() => { if (window.turnstile) { clearInterval(interval); render(); } }, 100);
      return () => clearInterval(interval);
    }
    return () => {
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  const resetCaptcha = () => {
    if (widgetIdRef.current != null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
    setCaptchaToken(null);
  };

  const handleSubmit = async () => {
    if (!captchaToken) { setError("Please complete the CAPTCHA."); return; }
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
      captchaToken,
    });
    if (error) { setError(error.message); resetCaptcha(); }
    else setSent(true);
    setLoading(false);
  };

  const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
  const modalStyle = { background: "var(--surface)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 8px 40px rgba(0,0,0,0.15)" };
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 10 };
  const btnStyle = { width: "100%", padding: "11px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 4, opacity: (!captchaToken || loading) ? 0.5 : 1 };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Reset password</div>
        {sent ? (
          <>
            <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
              Check your email for a reset link. It may take a minute to arrive.
            </div>
            <button style={btnStyle} onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Enter your email and we'll send you a reset link.</div>
            <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && captchaToken && handleSubmit()} />
            <div ref={turnstileRef} style={{ marginBottom: 10 }} />
            {error && <div style={{ fontSize: 13, color: "#e24b4a", marginBottom: 8 }}>{error}</div>}
            <button style={btnStyle} onClick={handleSubmit} disabled={loading || !captchaToken}>{loading ? "..." : "Send reset link"}</button>
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginTop: 14 }}>
              <span style={{ color: "var(--accent)", cursor: "pointer" }} onClick={() => onSwitch("login")}>Back to log in</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ResetPasswordModal({ onClose }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else setDone(true);
    setLoading(false);
  };

  const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
  const modalStyle = { background: "var(--surface)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 8px 40px rgba(0,0,0,0.15)" };
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 10 };
  const btnStyle = { width: "100%", padding: "11px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 4 };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Set new password</div>
        {done ? (
          <>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>Password updated successfully.</div>
            <button style={btnStyle} onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Enter your new password below.</div>
            <input style={inputStyle} type="password" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            {error && <div style={{ fontSize: 13, color: "#e24b4a", marginBottom: 8 }}>{error}</div>}
            <button style={btnStyle} onClick={handleSubmit} disabled={loading}>{loading ? "..." : "Update password"}</button>
          </>
        )}
      </div>
    </div>
  );
}

function CommentNode({ node, dealId, user, role, replyingTo, setReplyingTo, replyText, setReplyText, onComment, onDelete, styles }) {
  const [collapsed, setCollapsed] = useState(false);
  const totalReplies = (n) => n.replies.reduce((acc, r) => acc + 1 + totalReplies(r), 0);
  const replyCount = totalReplies(node);

  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 2 }}>
      {/* Left column: avatar + collapse line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 36, flexShrink: 0 }}>
        <div style={{ ...styles.commentAvatar, background: avatarColor(node.user), width: 28, height: 28, fontSize: 12, flexShrink: 0 }}>
          {(node.user || "?")[0].toUpperCase()}
        </div>
        {!collapsed && (
          <div
            style={{ width: 2, flex: 1, minHeight: 8, background: "var(--border)", marginTop: 4, cursor: "pointer", borderRadius: 1, transition: "background 0.15s" }}
            onClick={() => setCollapsed(true)}
            onMouseEnter={e => e.currentTarget.style.background = "var(--accent)"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--border)"}
          />
        )}
      </div>

      {/* Right column: content + children */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: collapsed ? 0 : 3 }}>
          <span style={styles.commentUser}>{node.user}</span>
          <span style={styles.commentTime}>{timeAgo(node.created_at)}</span>
          {collapsed && (
            <span onClick={() => setCollapsed(false)}
              style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer", fontWeight: 600 }}>
              [+] {replyCount > 0 ? `${replyCount} repl${replyCount === 1 ? "y" : "ies"}` : "expand"}
            </span>
          )}
        </div>

        {!collapsed && (
          <>
            <div style={{ ...styles.commentText, marginBottom: 6 }}>{node.text}</div>

            {/* Action row */}
            <div style={{ display: "flex", gap: 2, alignItems: "center", marginBottom: 8 }}>
              {user && (
                <button onClick={() => { setReplyingTo(replyingTo === node.id ? null : node.id); setReplyText(""); }}
                  style={{ background: "none", border: "none", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", cursor: "pointer", padding: "3px 6px", borderRadius: 4, fontFamily: "inherit" }}>
                  Reply
                </button>
              )}
              {(role === "moderator" || node.user_id === user?.id) && (
                <button onClick={() => onDelete(dealId, node.id)}
                  style={{ background: "none", border: "none", fontSize: 12, color: "var(--text-faint)", cursor: "pointer", padding: "3px 6px", borderRadius: 4, fontFamily: "inherit" }}>
                  Delete
                </button>
              )}
            </div>

            {/* Inline reply box */}
            {replyingTo === node.id && (
              <div style={{ marginBottom: 12 }}>
                <textarea
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "none", height: 72, lineHeight: 1.5, marginBottom: 8, display: "block" }}
                  placeholder={`Reply to ${node.user}...`}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  autoFocus
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...styles.btn, fontSize: 12, padding: "6px 12px" }} onClick={() => { setReplyingTo(null); setReplyText(""); }}>Cancel</button>
                  <button style={{ ...styles.btnPrimary, fontSize: 12, padding: "6px 14px" }} onClick={() => onComment(dealId, node.id)}>Reply</button>
                </div>
              </div>
            )}

            {/* Nested replies */}
            {node.replies.map(r => (
              <CommentNode key={r.id} node={r} dealId={dealId} user={user} role={role}
                replyingTo={replyingTo} setReplyingTo={setReplyingTo}
                replyText={replyText} setReplyText={setReplyText}
                onComment={onComment} onDelete={onDelete} styles={styles} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function DealCard({ deal, styles, votedDeals, onVote, onClick, canDelete, onDelete, isSaved, onToggleSave }) {
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
            {deal.normalPrice && <span style={{ ...styles.badge, position: "relative", overflow: "hidden", border: "1px solid #000" }}>{deal.normalPrice}<span style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom left, transparent calc(50% - 0.5px), var(--text-muted) calc(50% - 0.5px), var(--text-muted) calc(50% + 0.5px), transparent calc(50% + 0.5px))", pointerEvents: "none" }} /></span>}
            <span style={styles.priceBadge}>{deal.price}</span>
            <span onClick={e => { e.stopPropagation(); onToggleSave(deal.id); }}
              title={isSaved ? "Unsave" : "Save"}
              style={{ marginLeft: "auto", fontSize: 18, cursor: "pointer", flexShrink: 0, color: isSaved ? "var(--accent)" : "var(--text-faint)", lineHeight: 1 }}>
              {isSaved ? "★" : "☆"}
            </span>
            {canDelete && (
              <span onClick={e => { e.stopPropagation(); onDelete(deal.id); }}
                style={{ fontSize: 12, color: "#e24b4a", cursor: "pointer", flexShrink: 0 }}>Delete</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {(deal.mealTimes || []).map(m => <span key={m} style={styles.badge}>{m}</span>)}
            <span style={styles.badge}>{deal.category}</span>
            {deal.verified && <span style={styles.verified}>✓ Verified</span>}
            {deal.expiredAt && <span style={styles.expiredBadge}>🚩 Expired {new Date(deal.expiredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
          </div>
          <div style={styles.desc}>{deal.description}</div>
          {deal.imageUrl && (
            <img src={deal.imageUrl} alt={deal.title} style={{ maxWidth: "100%", maxHeight: 260, height: "auto", borderRadius: 8, marginBottom: 8, display: "block" }} />
          )}
          <div style={styles.metaRow}>
            <span onClick={e => { e.stopPropagation(); setShowComments(s => !s); }} style={styles.commentToggle}>
              💬 {deal.comments.length} {deal.comments.length === 1 ? "comment" : "comments"}
            </span>
          </div>
        </div>
      </div>
      {showComments && deal.comments.length > 0 && (
        <div style={styles.divider} onClick={e => e.stopPropagation()}>
          {deal.comments.slice(0, 2).map(c => (
            <div key={c.id} style={styles.commentBox}>
              <div style={{ ...styles.commentAvatar, background: avatarColor(c.user), width: 26, height: 26, fontSize: 11 }}>
                {(c.user || "?")[0].toUpperCase()}
              </div>
              <div style={styles.commentBody}>
                <div>
                  <span style={styles.commentUser}>{c.user}</span>
                  <span style={styles.commentTime}>{timeAgo(c.created_at)}</span>
                </div>
                <div style={styles.commentText}>{c.text}</div>
              </div>
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
