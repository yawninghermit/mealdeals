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

const emailPrefix = (user) => user?.email?.split("@")[0] ?? "anonymous";
const username = emailPrefix;
const nameFor = (userId, profilesById, fallback) =>
  profilesById?.[userId]?.display_name || fallback || "anonymous";

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

const friendlyError = (error, fallback) => {
  const msg = error?.message || "";
  const match = msg.match(/rate_limit_exceeded:\s*(.+)/i);
  if (match) return match[1].trim();
  return fallback;
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

export default function App() {
  const isMobile = useIsMobile();
  const [screen, setScreen] = useState("home");
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [profile, setProfile] = useState(null); // { id, display_name, avatar_url, role }
  const [profilesById, setProfilesById] = useState({}); // cache for live name/avatar lookups
  const [authModal, setAuthModal] = useState(null); // "login" | "signup" | "forgot" | null
  const [resetPassword, setResetPassword] = useState(false);
  const [myComments, setMyComments] = useState([]);
  const [votedDeals, setVotedDeals] = useState({});
  const [mealFilter, setMealFilter] = useState("All");
  const [dayFilter, setDayFilter] = useState([DAYS_SHORT[new Date().getDay()]]);
  const [sortBy, setSortBy] = useState("top");
  const [savedDealIds, setSavedDealIds] = useState(new Set());

  const [searchQuery, setSearchQuery] = useState("");
  const [newComment, setNewComment] = useState("");
  const [commentError, setCommentError] = useState("");
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
  const avatarInputRef = useRef(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const [pwSending, setPwSending] = useState(false);
  const [pwSent, setPwSent] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);
  const [postError, setPostError] = useState("");
  const [editingDealId, setEditingDealId] = useState(null);

  // Reporting state
  const [reportTarget, setReportTarget] = useState(null); // { type: 'deal'|'comment', id, preview }
  const [reportReason, setReportReason] = useState("inappropriate");
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [pendingReports, setPendingReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [pendingReportCount, setPendingReportCount] = useState(0);
  const [reportsFilter, setReportsFilter] = useState("pending"); // pending | reviewed | all

  const [shareCopied, setShareCopied] = useState(false);

  // Account deletion state
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [accountDeletedBanner, setAccountDeletedBanner] = useState(false);

  const fetchProfile = async (userId) => {
    if (!userId) { setRole(null); setProfile(null); return; }
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, role, display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    let row = existing;
    if (!row) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const initial = authUser?.user_metadata?.display_name?.trim() || authUser?.email?.split("@")[0] || null;
      const { data: created } = await supabase
        .from("profiles")
        .insert({ id: userId, display_name: initial })
        .select("id, role, display_name, avatar_url")
        .single();
      row = created;
    } else if (!row.display_name) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const metaName = authUser?.user_metadata?.display_name?.trim();
      if (metaName) {
        await supabase.from("profiles").update({ display_name: metaName }).eq("id", userId);
        row.display_name = metaName;
      }
    }

    setProfile(row);
    setRole(row?.role ?? "user");
    if (row?.role === "moderator") {
      const { count } = await supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "pending");
      setPendingReportCount(count || 0);
    } else {
      setPendingReportCount(0);
    }
    if (row) {
      setProfilesById(prev => ({
        ...prev,
        [row.id]: { display_name: row.display_name, avatar_url: row.avatar_url }
      }));
    }
  };

  const fetchProfilesForIds = async (userIds) => {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (ids.length === 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", ids);
    if (data) {
      setProfilesById(prev => {
        const next = { ...prev };
        data.forEach(p => { next[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url }; });
        return next;
      });
    }
  };

  const fetchMyComments = async (userId) => {
    if (!userId) { setMyComments([]); return; }
    const { data } = await supabase
      .from("comments")
      .select("id, text, created_at, deal_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setMyComments(data || []);
  };

  const fetchSaved = async (userId) => {
    if (!userId) { setSavedDealIds(new Set()); return; }
    const { data } = await supabase.from("saved_deals").select("deal_id").eq("user_id", userId);
    setSavedDealIds(new Set((data || []).map(r => r.deal_id)));
  };

  const fetchVotes = async (userId) => {
    if (!userId) { setVotedDeals({}); return; }
    const { data } = await supabase.from("deal_votes").select("deal_id, direction").eq("user_id", userId);
    const next = {};
    (data || []).forEach(v => { next[`${v.deal_id}-${v.direction === 1 ? "up" : "down"}`] = true; });
    setVotedDeals(next);
  };

  useEffect(() => {
    fetchDeals();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      fetchProfile(session?.user?.id ?? null);
      fetchSaved(session?.user?.id ?? null);
      fetchVotes(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      fetchProfile(session?.user?.id ?? null);
      fetchSaved(session?.user?.id ?? null);
      fetchVotes(session?.user?.id ?? null);
      if (event === "PASSWORD_RECOVERY") setResetPassword(true);
    });

    const dealIdFromUrl = new URLSearchParams(window.location.search).get("deal");
    if (dealIdFromUrl) { setSelectedDeal(dealIdFromUrl); setScreen("deal"); }

    return () => subscription.unsubscribe();
  }, []);

  // Keep the URL's ?deal= param in sync with the deal screen, so deal links are shareable.
  useEffect(() => {
    const url = new URL(window.location.href);
    const current = url.searchParams.get("deal");
    if (screen === "deal" && selectedDeal) {
      if (current !== String(selectedDeal)) {
        url.searchParams.set("deal", selectedDeal);
        window.history.pushState({}, "", url);
      }
    } else if (current) {
      url.searchParams.delete("deal");
      window.history.pushState({}, "", url);
    }
  }, [screen, selectedDeal]);

  useEffect(() => {
    const onPopState = () => {
      const dealId = new URLSearchParams(window.location.search).get("deal");
      if (dealId) { setSelectedDeal(dealId); setScreen("deal"); }
      else { setScreen(s => s === "deal" ? "home" : s); }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (screen === "profile" && profile) {
      setDisplayNameDraft(profile.display_name || "");
      setNameError(null);
      setAvatarError(null);
    }
  }, [screen, profile?.display_name]);

  const handleShare = async (deal) => {
    const url = `${window.location.origin}${window.location.pathname}?deal=${deal.id}`;
    const shareData = { title: deal.title, text: `${deal.title} at ${deal.restaurant} — ${deal.price}`, url };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* user cancelled the share sheet */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

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

  const handleSaveDisplayName = async () => {
    const name = displayNameDraft.trim();
    setNameError(null);
    setNameSaved(false);
    if (name.length < 2 || name.length > 30) { setNameError("Display name must be 2-30 characters."); return; }
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
    setSavingName(false);
    if (error) { setNameError(error.message); return; }
    setProfile(p => p ? { ...p, display_name: name } : p);
    setProfilesById(prev => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), display_name: name } }));
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  };

  const downscaleAvatar = (file, maxDim = 512, quality = 0.9) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("toBlob failed")), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image decode failed")); };
    img.src = url;
  });

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { setAvatarError("Please choose an image file."); return; }
    setAvatarError(null);
    setUploadingAvatar(true);
    let blob, ext, contentType;
    try {
      blob = await downscaleAvatar(file);
      ext = "jpg";
      contentType = "image/jpeg";
    } catch {
      if (file.size > 5 * 1024 * 1024) { setAvatarError("Image must be under 5 MB."); setUploadingAvatar(false); return; }
      blob = file;
      ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      contentType = file.type || "image/png";
    }
    const path = `${user.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType });
    if (upErr) { setAvatarError(upErr.message); setUploadingAvatar(false); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setUploadingAvatar(false);
    if (updErr) { setAvatarError(updErr.message); return; }
    setProfile(p => p ? { ...p, avatar_url: url } : p);
    setProfilesById(prev => ({ ...prev, [user.id]: { ...(prev[user.id] || {}), avatar_url: url } }));
  };

  const handleSendPasswordReset = async () => {
    if (!user) return;
    setPwSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: window.location.origin });
    setPwSending(false);
    if (!error) { setPwSent(true); setTimeout(() => setPwSent(false), 4000); }
  };

  const openReport = (type, id, preview) => {
    if (!user) { setAuthModal("login"); return; }
    setReportTarget({ type, id, preview });
    setReportReason("inappropriate");
    setReportNote("");
    setReportError(null);
    setReportSuccess(false);
  };

  const submitReport = async () => {
    if (!reportTarget || !user) return;
    setReportSubmitting(true);
    setReportError(null);
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: reportTarget.type,
      target_id: reportTarget.id,
      reason: reportReason,
      note: reportNote.trim() || null,
    });
    setReportSubmitting(false);
    if (error) {
      if (error.code === "23505") { setReportSuccess(true); return; }
      setReportError(friendlyError(error, error.message));
      return;
    }
    setReportSuccess(true);
    if (role === "moderator") setPendingReportCount(c => c + 1);
  };

  const fetchReports = async (filter = reportsFilter) => {
    if (role !== "moderator") return;
    setReportsLoading(true);
    let q = supabase.from("reports").select("*").order("created_at", { ascending: false });
    if (filter === "pending") q = q.eq("status", "pending");
    else if (filter === "reviewed") q = q.neq("status", "pending");
    const { data: reports } = await q;
    const list = reports || [];
    const dealIds = [...new Set(list.filter(r => r.target_type === "deal").map(r => r.target_id))];
    const commentIds = [...new Set(list.filter(r => r.target_type === "comment").map(r => r.target_id))];
    const profileIds = [...new Set(list.flatMap(r => [r.reporter_id, r.reviewed_by]).filter(Boolean))];
    const [deals, comments, profiles] = await Promise.all([
      dealIds.length ? supabase.from("deals").select("id, title, user_id").in("id", dealIds) : Promise.resolve({ data: [] }),
      commentIds.length ? supabase.from("comments").select("id, text, user_id, deal_id").in("id", commentIds) : Promise.resolve({ data: [] }),
      profileIds.length ? supabase.from("profiles").select("id, display_name").in("id", profileIds) : Promise.resolve({ data: [] }),
    ]);
    const dealMap = Object.fromEntries((deals.data || []).map(d => [d.id, d]));
    const commentMap = Object.fromEntries((comments.data || []).map(c => [c.id, c]));
    const profileMap = Object.fromEntries((profiles.data || []).map(p => [p.id, p]));
    setPendingReports(list.map(r => ({
      ...r,
      target: r.target_type === "deal" ? dealMap[r.target_id] : commentMap[r.target_id],
      reporter: profileMap[r.reporter_id],
      reviewer: r.reviewed_by ? profileMap[r.reviewed_by] : null,
    })));
    if (filter === "pending") setPendingReportCount(list.length);
    setReportsLoading(false);
  };

  const setReportStatus = async (reportId, status) => {
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase.from("reports").update({
      status, reviewed_by: user.id, reviewed_at: reviewedAt,
    }).eq("id", reportId);
    if (error) return;
    const wasPending = pendingReports.find(r => r.id === reportId)?.status === "pending";
    if (reportsFilter === "pending") {
      setPendingReports(rs => rs.filter(r => r.id !== reportId));
    } else {
      setPendingReports(rs => rs.map(r => r.id === reportId
        ? { ...r, status, reviewed_by: user.id, reviewed_at: reviewedAt, reviewer: profile ? { id: user.id, display_name: profile.display_name } : r.reviewer }
        : r));
    }
    if (wasPending && status !== "pending") setPendingReportCount(c => Math.max(0, c - 1));
    if (!wasPending && status === "pending") setPendingReportCount(c => c + 1);
  };

  const handleDeleteAccount = async () => {
    if (!user || !profile) return;
    setDeleting(true);
    setDeleteError(null);

    const extractPath = (url, bucket) => {
      const m = url?.match(new RegExp(`/${bucket}/(.+?)(\\?|$)`));
      return m ? m[1] : null;
    };

    const { data: userDeals } = await supabase.from("deals").select("image_url").eq("user_id", user.id);
    const dealImagePaths = (userDeals || []).map(d => extractPath(d.image_url, "deal-images")).filter(Boolean);
    if (dealImagePaths.length > 0) {
      await supabase.storage.from("deal-images").remove(dealImagePaths);
    }
    const avatarPath = extractPath(profile.avatar_url, "avatars");
    if (avatarPath) {
      await supabase.storage.from("avatars").remove([avatarPath]);
    }

    const { error } = await supabase.rpc("delete_user");
    if (error) {
      setDeleting(false);
      setDeleteError(error.message);
      return;
    }

    await supabase.auth.signOut();
    setDeleting(false);
    setDeleteAccountOpen(false);
    setDeleteConfirmText("");
    setScreen("home");
    setAccountDeletedBanner(true);
    setTimeout(() => setAccountDeletedBanner(false), 6000);
  };

  const fetchDeals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("deals")
      .select("*, comments(*)")
      .order("votes", { ascending: false });
    if (!error && data) {
      setDeals(data.map(mapDeal));
      const ids = data.flatMap(d => [d.user_id, ...(d.comments || []).map(c => c.user_id)]);
      fetchProfilesForIds(ids);
    }
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

    const prevDeals = deals;
    const prevVoted = votedDeals;

    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, votes: d.votes + totalDelta } : d));

    const newVoted = { ...votedDeals };
    if (newVoted[key]) { delete newVoted[key]; }
    else { newVoted[key] = true; delete newVoted[opposite]; }
    setVotedDeals(newVoted);

    const { error } = await supabase.rpc("cast_vote", { p_deal_id: dealId, p_direction: dir === "up" ? 1 : -1 });
    if (error) {
      setDeals(prevDeals);
      setVotedDeals(prevVoted);
    }
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
    setCommentError("");
    const { data, error } = await supabase
      .from("comments")
      .insert({ deal_id: dealId, username: profile?.display_name || username(user), text, user_id: user.id, parent_id: parentId })
      .select()
      .single();
    if (error) {
      setCommentError(friendlyError(error, `Couldn't post comment: ${error.message}`));
      setTimeout(() => setCommentError(""), 5000);
      return;
    }
    if (data) {
      if (parentId) { setReplyText(""); setReplyingTo(null); } else setNewComment("");
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
    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return null;
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageError("Image must be under 8 MB.");
      return null;
    }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    setUploadingImage(true);
    setImageError(null);
    const { error } = await supabase.storage.from("deal-images").upload(path, file, { upsert: true, contentType: file.type });
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
      setPostError(friendlyError(error, `Couldn't post: ${error.message}`));
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
    policyText: { fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 12 },
    policyH2: { fontSize: 17, fontWeight: 700, color: "var(--text)", marginTop: 22, marginBottom: 8 },
    policyList: { paddingLeft: 22, fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 12 },
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

      {authModal && authModal !== "forgot" && <AuthModal mode={authModal} onClose={() => setAuthModal(null)} onSwitch={m => setAuthModal(m)} onShowPolicy={s => { setScreen(s); setAuthModal(null); }} />}
      {authModal === "forgot" && <ForgotPasswordModal onClose={() => setAuthModal(null)} onSwitch={m => setAuthModal(m)} />}
      {resetPassword && <ResetPasswordModal onClose={() => setResetPassword(false)} />}

      {/* Report modal */}
      {reportTarget && (
        <div onClick={() => setReportTarget(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, maxWidth: 420, width: "100%" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Report {reportTarget.type}</div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{reportTarget.preview}”</div>
            {reportSuccess ? (
              <>
                <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 14 }}>Thanks — a moderator will review this shortly.</div>
                <button style={styles.btnPrimary} onClick={() => setReportTarget(null)}>Close</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>Reason</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {[
                    { v: "spam", l: "Spam or promotional" },
                    { v: "inappropriate", l: "Inappropriate or offensive" },
                    { v: "inaccurate", l: "Inaccurate / misleading deal" },
                    { v: "other", l: "Other" },
                  ].map(opt => (
                    <label key={opt.v} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" name="reportReason" value={opt.v} checked={reportReason === opt.v} onChange={() => setReportReason(opt.v)} />
                      {opt.l}
                    </label>
                  ))}
                </div>
                <textarea
                  placeholder="Optional: add a note for the moderators"
                  value={reportNote}
                  onChange={e => setReportNote(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "none", height: 64, lineHeight: 1.5, marginBottom: 10 }}
                />
                {reportError && <div style={{ fontSize: 12, color: "#e24b4a", marginBottom: 8 }}>{reportError}</div>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button style={styles.btn} onClick={() => setReportTarget(null)} disabled={reportSubmitting}>Cancel</button>
                  <button style={styles.btnPrimary} onClick={submitReport} disabled={reportSubmitting}>
                    {reportSubmitting ? "Sending..." : "Submit report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete account modal */}
      {deleteAccountOpen && (
        <div onClick={() => !deleting && setDeleteAccountOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, maxWidth: 440, width: "100%" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Delete your account?</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
              This permanently deletes:
            </div>
            <ul style={{ paddingLeft: 22, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 14 }}>
              <li>Your profile and avatar</li>
              <li>All deals you've posted (and their images)</li>
              <li>All comments you've written</li>
              <li>Your saved deals and reports you've filed</li>
            </ul>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
              Type your display name {profile?.display_name && <>(<strong>{profile.display_name}</strong>)</>} to confirm:
            </div>
            <input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={profile?.display_name || "display name"}
              autoFocus
              disabled={!profile?.display_name}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 12 }}
            />
            {deleteError && <div style={{ fontSize: 12, color: "#e24b4a", marginBottom: 8 }}>{deleteError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={styles.btn} onClick={() => setDeleteAccountOpen(false)} disabled={deleting}>Cancel</button>
              {(() => {
                const canDelete = !deleting && !!profile?.display_name && deleteConfirmText === profile.display_name;
                return (
                  <button
                    style={{ ...styles.btn, color: "#fff", background: "#e24b4a", borderColor: "#e24b4a", opacity: canDelete ? 1 : 0.5, cursor: canDelete ? "pointer" : "not-allowed" }}
                    disabled={!canDelete}
                    onClick={handleDeleteAccount}>
                    {deleting ? "Deleting..." : "Delete forever"}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Account deleted banner */}
      {accountDeletedBanner && (
        <div style={{ background: "#eaf3de", border: "1px solid #97c459", color: "#3b6d11", padding: "12px 20px", textAlign: "center", fontSize: 14, fontWeight: 600 }}>
          Your account has been deleted. We're sorry to see you go.
        </div>
      )}

      {/* Nav */}
      <div style={styles.nav}>
        <div style={styles.logo} onClick={() => setScreen("home")}>ih8fullprice</div>
        <div style={styles.navRight}>
          <button style={screen === "map" ? styles.navBtnActive : styles.navBtn} onClick={() => setScreen("map")}>Map</button>
          {user && <button style={screen === "saved" ? styles.navBtnActive : styles.navBtn} onClick={() => setScreen("saved")}>{isMobile ? "★" : "★ Saved"}</button>}
          {user && (
            <button
              style={screen === "profile" ? styles.navBtnActive : styles.navBtn}
              onClick={() => { setScreen("profile"); fetchMyComments(user.id); }}
              title="Profile"
            >
              {isMobile ? "👤" : `u/${profile?.display_name || emailPrefix(user)}`}
            </button>
          )}
          {user ? (
            <>
              {role === "moderator" && (
                <button
                  style={screen === "reports" ? styles.navBtnActive : styles.navBtn}
                  onClick={() => { setScreen("reports"); fetchReports(); }}
                  title="Reports"
                >
                  {isMobile ? "🚩" : "🚩 Reports"}{pendingReportCount > 0 && <span style={{ marginLeft: 6, background: "#e24b4a", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 700 }}>{pendingReportCount}</span>}
                </button>
              )}
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

      {/* PROFILE */}
      {screen === "profile" && user && (
        <div style={styles.page}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>Profile</div>

          {/* Avatar + change */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: avatarColor(profile?.display_name || emailPrefix(user)), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: "#fff" }}>
                {((profile?.display_name || emailPrefix(user))[0] || "?").toUpperCase()}
              </div>
            )}
            <div>
              <button style={styles.btn} onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}>
                {uploadingAvatar ? "Uploading..." : profile?.avatar_url ? "Change picture" : "Upload picture"}
              </button>
              <input type="file" accept="image/*" ref={avatarInputRef} style={{ display: "none" }} onChange={handleAvatarUpload} />
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>PNG/JPG. Large images are resized automatically.</div>
              {avatarError && <div style={{ fontSize: 12, color: "#e24b4a", marginTop: 4 }}>{avatarError}</div>}
            </div>
          </div>

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Email</div>
            <div style={{ fontSize: 14, color: "var(--text)" }}>{user.email}</div>
          </div>

          {/* Display name */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Display name</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...styles.input, flex: 1 }}
                value={displayNameDraft}
                onChange={e => setDisplayNameDraft(e.target.value)}
                maxLength={30}
                placeholder="Your display name"
              />
              <button style={styles.btnPrimary} onClick={handleSaveDisplayName} disabled={savingName || displayNameDraft.trim() === (profile?.display_name || "")}>
                {savingName ? "..." : "Save"}
              </button>
            </div>
            {nameError && <div style={{ fontSize: 12, color: "#e24b4a", marginTop: 4 }}>{nameError}</div>}
            {nameSaved && <div style={{ fontSize: 12, color: "#3aa86b", marginTop: 4 }}>Saved.</div>}
          </div>

          {/* Change password */}
          <div style={{ marginBottom: 28 }}>
            <button style={styles.btn} onClick={handleSendPasswordReset} disabled={pwSending || pwSent}>
              {pwSending ? "Sending..." : pwSent ? "Email sent ✓" : "Send password reset email"}
            </button>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>We'll email you a link to set a new password.</div>
          </div>

          {/* Saved deals */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>★ Saved deals ({deals.filter(d => savedDealIds.has(d.id)).length})</div>
            {deals.filter(d => savedDealIds.has(d.id)).length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-faint)" }}>Tap the star on any deal to save it.</div>
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

          {/* Liked deals (local) */}
          {(() => {
            const likedIds = Object.keys(votedDeals).filter(k => k.endsWith("-up") && votedDeals[k]).map(k => k.replace("-up", ""));
            const likedDeals = deals.filter(d => likedIds.includes(String(d.id)));
            return (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>👍 Liked deals ({likedDeals.length})</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>Tracked locally on this device.</div>
                {likedDeals.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--text-faint)" }}>No upvotes yet.</div>
                ) : (
                  likedDeals.map(deal => (
                    <DealCard key={deal.id} deal={deal} styles={styles} votedDeals={votedDeals}
                      onVote={handleVote} onClick={() => { setSelectedDeal(deal.id); setScreen("deal"); }}
                      canDelete={role === "moderator" || deal.user_id === user?.id}
                      onDelete={handleDeleteDeal}
                      isSaved={savedDealIds.has(deal.id)}
                      onToggleSave={toggleSaveDeal} />
                  ))
                )}
              </div>
            );
          })()}

          {/* Danger zone */}
          <div style={{ marginTop: 28, marginBottom: 28, padding: 16, border: "1px solid #e24b4a", borderRadius: 12, background: "rgba(226,75,74,0.05)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#a32d2d", marginBottom: 6 }}>Danger zone</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
              Deleting your account permanently removes your profile, all your deals, comments, saved deals, and reports. This cannot be undone.
            </div>
            <button style={{ ...styles.btn, color: "#a32d2d", borderColor: "#e24b4a", fontSize: 13 }} onClick={() => { setDeleteConfirmText(""); setDeleteError(null); setDeleteAccountOpen(true); }}>
              Delete my account
            </button>
          </div>

          {/* Comment history */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>💬 Your comments ({myComments.length})</div>
            {myComments.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-faint)" }}>You haven't commented yet.</div>
            ) : (
              myComments.map(c => {
                const dealTitle = deals.find(d => d.id === c.deal_id)?.title || "(deal removed)";
                return (
                  <div
                    key={c.id}
                    onClick={() => { setSelectedDeal(c.deal_id); setScreen("deal"); }}
                    style={{ borderTop: "1px solid var(--border)", padding: "10px 0", cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                      on <span style={{ color: "var(--accent)" }}>{dealTitle}</span> · {timeAgo(c.created_at)}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text)" }}>{c.text}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* REPORTS (moderator-only) */}
      {screen === "reports" && role === "moderator" && (
        <div style={styles.page}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>🚩 Reports</div>
            <button style={styles.btn} onClick={() => fetchReports(reportsFilter)} disabled={reportsLoading}>{reportsLoading ? "Loading..." : "Refresh"}</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[{ k: "pending", l: "Pending" }, { k: "reviewed", l: "Reviewed" }, { k: "all", l: "All" }].map(opt => (
              <button key={opt.k}
                style={reportsFilter === opt.k ? styles.navBtnActive : styles.navBtn}
                onClick={() => { setReportsFilter(opt.k); fetchReports(opt.k); }}>
                {opt.l}
              </button>
            ))}
          </div>
          {!reportsLoading && pendingReports.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-faint)", padding: 24, textAlign: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
              {reportsFilter === "pending" ? "No pending reports. 🎉" : "No reports in this view."}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pendingReports.map(r => {
              const statusStyle = r.status === "pending"
                ? { bg: "rgba(226,75,74,0.12)", color: "#a32d2d", label: "PENDING" }
                : r.status === "actioned"
                  ? { bg: "rgba(40,160,90,0.15)", color: "#1a6d3d", label: "ACTIONED" }
                  : { bg: "var(--surface-2)", color: "var(--text-faint)", label: "DISMISSED" };
              return (
              <div key={r.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: statusStyle.bg, color: statusStyle.color, letterSpacing: 0.4 }}>{statusStyle.label}</span>
                    {r.target_type === "deal" ? "Deal" : "Comment"} · <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>{r.reason}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{new Date(r.created_at).toLocaleString()}</div>
                </div>
                {r.target ? (
                  <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 8 }}>
                    {r.target_type === "deal" ? r.target.title : r.target.text}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 8, fontStyle: "italic" }}>(Target deleted)</div>
                )}
                {r.note && <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Note: {r.note}</div>}
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
                  Reported by u/{r.reporter?.display_name || "unknown"}
                  {r.status !== "pending" && r.reviewed_at && (
                    <> · {r.status === "actioned" ? "Actioned" : "Dismissed"} by u/{r.reviewer?.display_name || "unknown"} on {new Date(r.reviewed_at).toLocaleString()}</>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {r.target && r.target_type === "deal" && (
                    <button style={{ ...styles.btn, fontSize: 12 }} onClick={() => { setSelectedDeal(r.target_id); setScreen("deal"); }}>View deal</button>
                  )}
                  {r.target && r.target_type === "comment" && r.target.deal_id && (
                    <button style={{ ...styles.btn, fontSize: 12 }} onClick={() => { setSelectedDeal(r.target.deal_id); setScreen("deal"); }}>View thread</button>
                  )}
                  {r.status === "pending" ? (
                    <>
                      <button style={{ ...styles.btn, fontSize: 12 }} onClick={() => setReportStatus(r.id, "dismissed")}>Dismiss</button>
                      <button style={{ ...styles.btn, fontSize: 12, color: "var(--accent)", borderColor: "var(--accent)" }} onClick={() => setReportStatus(r.id, "actioned")}>Mark actioned</button>
                    </>
                  ) : (
                    <button style={{ ...styles.btn, fontSize: 12 }} onClick={() => setReportStatus(r.id, "pending")}>Reopen</button>
                  )}
                </div>
              </div>
            );})}
          </div>
        </div>
      )}

      {/* DEAL DETAIL */}
      {screen === "deal" && !openDeal && (
        <div style={styles.page}>
          <button style={styles.backBtn} onClick={() => setScreen("home")}>← Back to deals</button>
          {loading ? (
            <div style={styles.emptyState}><div style={{ fontSize: 13 }}>Loading deal...</div></div>
          ) : (
            <div style={styles.emptyState}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Deal not found</div>
              <div style={{ fontSize: 13 }}>It may have been removed by its owner.</div>
            </div>
          )}
        </div>
      )}
      {screen === "deal" && openDeal && (
        <div style={styles.page}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button style={styles.backBtn} onClick={() => setScreen("home")}>← Back to deals</button>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {openDeal?.expiredAt && (
                <span style={styles.expiredBadge}>🚩 Expired {new Date(openDeal.expiredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              )}
              <button style={{ ...styles.btn, fontSize: 13 }} onClick={() => handleShare(openDeal)}>
                {shareCopied ? "Link copied!" : "🔗 Share"}
              </button>
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
              {user && openDeal?.user_id !== user?.id && (
                <button style={{ ...styles.btn, fontSize: 13, color: "var(--text-muted)" }}
                  onClick={() => openReport("deal", openDeal.id, openDeal.title)}>🚩 Report</button>
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
                  <img src={openDeal.imageUrl} alt={openDeal.title} style={{ width: "100%", height: "auto", borderRadius: 10, marginBottom: 12, display: "block" }} />
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
                  user={user} role={role} profilesById={profilesById}
                  replyingTo={replyingTo} setReplyingTo={setReplyingTo}
                  replyText={replyText} setReplyText={setReplyText}
                  onComment={handleComment} onDelete={handleDeleteComment} onReport={openReport} styles={styles} />
              ))}
              {openDeal.comments.filter(c => !c.parent_id).length === 0 && (
                <div style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 12 }}>No comments yet — be the first!</div>
              )}
              {user ? (
                <>
                  <div style={styles.inputRow}>
                    <input style={styles.input} placeholder="Share your experience..." value={newComment} onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleComment(openDeal.id)} />
                    <button style={styles.btnPrimary} onClick={() => handleComment(openDeal.id)}>Post</button>
                  </div>
                  {commentError && <div style={{ fontSize: 12, color: "#e24b4a", marginTop: 6 }}>{commentError}</div>}
                </>
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

      {/* PRIVACY POLICY */}
      {screen === "privacy" && (
        <div style={styles.page}>
          <button style={styles.backBtn} onClick={() => setScreen("home")}>← Back</button>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 12, marginBottom: 2 }}>Privacy Policy</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 20 }}>Last updated: May 25, 2026</div>
          <div style={styles.policyText}>
            This policy explains what data ih8fullprice collects and what we do with it. Plain English, no tricks.
          </div>

          <div style={styles.policyH2}>1. What we collect</div>
          <ul style={styles.policyList}>
            <li><strong>Account info:</strong> your email, a display name, and an optional profile picture you upload.</li>
            <li><strong>Content you post:</strong> deals, comments, votes, saved deals, and reports.</li>
            <li><strong>Location info:</strong> when you post a deal, the address text you type is sent to a geocoder to convert it to lat/long coordinates. We don't track your device location.</li>
            <li><strong>Technical info:</strong> standard server logs (IP, timestamp, page loaded) via our hosting providers.</li>
          </ul>

          <div style={styles.policyH2}>2. How we use it</div>
          <ul style={styles.policyList}>
            <li>To run the service — show your content to other users, log you in, send password reset emails.</li>
            <li>To prevent abuse — the Report flow and the bot check at signup.</li>
            <li>To improve the site.</li>
          </ul>
          <div style={styles.policyText}>We do not sell your data and we do not show ads.</div>

          <div style={styles.policyH2}>3. Where it's stored</div>
          <ul style={styles.policyList}>
            <li><strong>Supabase</strong> — database, authentication, image storage.</li>
            <li><strong>Vercel</strong> — site hosting.</li>
            <li><strong>Cloudflare Turnstile</strong> — bot check at signup. Cloudflare may briefly see your IP.</li>
            <li><strong>OpenStreetMap Nominatim</strong> — converts address text to coordinates when you post a deal.</li>
          </ul>
          <div style={styles.policyText}>Each provider has its own privacy policy. We share data with them only as needed to run the service.</div>

          <div style={styles.policyH2}>4. Cookies and local storage</div>
          <div style={styles.policyText}>We use your browser's localStorage to remember your login session. Your votes and saved deals are stored in our database against your account, so they follow you across devices.</div>
          <div style={styles.policyText}>We don't use third-party tracking cookies.</div>

          <div style={styles.policyH2}>5. How long we keep your data</div>
          <div style={styles.policyText}>
            Account data and content stay until you delete them. You can delete your account at any time from the Profile tab — this permanently removes your profile, deals, comments, saved deals, reports, and uploaded images. You can also email us to request deletion.
          </div>

          <div style={styles.policyH2}>6. Your rights</div>
          <div style={styles.policyText}>You can ask us to:</div>
          <ul style={styles.policyList}>
            <li>Access the data we have about you.</li>
            <li>Correct anything that's wrong (or edit it yourself in your profile).</li>
            <li>Delete your account and all your content.</li>
          </ul>
          <div style={styles.policyText}>
            If you're in the EU/UK or California, you have additional rights under GDPR/CCPA — same way to exercise them: email us.
          </div>

          <div style={styles.policyH2}>7. Children</div>
          <div style={styles.policyText}>
            ih8fullprice isn't intended for users under 13. If you're a parent and your child has signed up, email us and we'll delete the account.
          </div>

          <div style={styles.policyH2}>8. Changes</div>
          <div style={styles.policyText}>
            If this policy changes, we'll update the "Last updated" date at the top.
          </div>

          <div style={styles.policyH2}>9. Contact</div>
          <div style={styles.policyText}>
            <a href="mailto:mealdeals12@gmail.com" style={{ color: "var(--accent)" }}>mealdeals12@gmail.com</a>
          </div>
          <div style={styles.policyText}>
            ih8fullprice is operated by Alec Simin in the United States.
          </div>
        </div>
      )}

      {/* TERMS OF SERVICE */}
      {screen === "terms" && (
        <div style={styles.page}>
          <button style={styles.backBtn} onClick={() => setScreen("home")}>← Back</button>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 12, marginBottom: 2 }}>Terms of Service</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 20 }}>Last updated: May 25, 2026</div>
          <div style={styles.policyText}>
            Welcome to ih8fullprice. By using the site you agree to these terms. If you don't agree, please don't use it.
          </div>

          <div style={styles.policyH2}>1. Who can use ih8fullprice</div>
          <div style={styles.policyText}>
            You need to be at least 13 to create an account (or 16 if you're in the EU/UK).
          </div>

          <div style={styles.policyH2}>2. Your account</div>
          <div style={styles.policyText}>
            Keep your password to yourself. You're responsible for what happens through your account.
          </div>

          <div style={styles.policyH2}>3. Your content</div>
          <div style={styles.policyText}>
            Deals, comments, photos, and anything else you post belong to you. By posting, you give ih8fullprice a non-exclusive, royalty-free license to store, display, and share that content so the service can function. You can delete your own content any time.
          </div>

          <div style={styles.policyH2}>4. What's not OK to post</div>
          <ul style={styles.policyList}>
            <li>Spam, scams, or affiliate-link bait.</li>
            <li>Hateful, harassing, threatening, or otherwise illegal content.</li>
            <li>Fake or knowingly misleading deals.</li>
            <li>Content you don't have the right to share (copyrighted photos, trademarks, etc.).</li>
            <li>Content that impersonates someone else.</li>
          </ul>

          <div style={styles.policyH2}>5. Moderation</div>
          <div style={styles.policyText}>
            Moderators can remove content or suspend accounts that violate these terms. If you see something that breaks the rules, use the 🚩 Report button on the deal or comment.
          </div>

          <div style={styles.policyH2}>6. Deal accuracy</div>
          <div style={styles.policyText}>
            Deals are posted by users. ih8fullprice doesn't verify prices, hours, or availability, and isn't affiliated with the restaurants listed. Confirm details with the merchant before you go.
          </div>

          <div style={styles.policyH2}>7. No warranty</div>
          <div style={styles.policyText}>
            ih8fullprice is provided as-is. We don't guarantee that it'll be available, accurate, or bug-free.
          </div>

          <div style={styles.policyH2}>8. Limitation of liability</div>
          <div style={styles.policyText}>
            To the extent allowed by law, the operator of ih8fullprice isn't liable for any indirect, incidental, or consequential damages arising from your use of the site.
          </div>

          <div style={styles.policyH2}>9. Termination</div>
          <div style={styles.policyText}>
            You can stop using the site any time. We can suspend or remove accounts that violate these terms.
          </div>

          <div style={styles.policyH2}>10. Changes</div>
          <div style={styles.policyText}>
            If we update these terms, we'll change the "Last updated" date at the top. Continuing to use the site after a change means you accept the new terms.
          </div>

          <div style={styles.policyH2}>11. Contact</div>
          <div style={styles.policyText}>
            <a href="mailto:mealdeals12@gmail.com" style={{ color: "var(--accent)" }}>mealdeals12@gmail.com</a>
          </div>
          <div style={styles.policyText}>
            ih8fullprice is operated by Alec Simin in the United States.
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 40, padding: "18px 16px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 14, justifyContent: "center", alignItems: "center", fontSize: 12, color: "var(--text-faint)", flexWrap: "wrap" }}>
        <span style={{ cursor: "pointer", color: screen === "privacy" ? "var(--accent)" : "var(--text-faint)" }} onClick={() => setScreen("privacy")}>Privacy</span>
        <span>·</span>
        <span style={{ cursor: "pointer", color: screen === "terms" ? "var(--accent)" : "var(--text-faint)" }} onClick={() => setScreen("terms")}>Terms</span>
        <span>·</span>
        <a href="mailto:mealdeals12@gmail.com" style={{ color: "var(--text-faint)", textDecoration: "none" }}>Contact</a>
      </div>
    </div>
  );
}

function AuthModal({ mode, onClose, onSwitch, onShowPolicy }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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
    if (mode === "signup") {
      const trimmedName = displayName.trim();
      if (trimmedName.length < 2 || trimmedName.length > 30) { setError("Display name must be 2-30 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    }
    setError("");
    setLoading(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { captchaToken, data: { display_name: displayName.trim() } }
      });
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
        {mode === "signup" && (
          <input style={inputStyle} type="text" placeholder="Display name" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={30} />
        )}
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
        {mode === "signup" && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
            By signing up, you agree to our{" "}
            <span style={{ color: "var(--accent)", cursor: "pointer" }} onClick={() => onShowPolicy("terms")}>Terms</span>
            {" "}and{" "}
            <span style={{ color: "var(--accent)", cursor: "pointer" }} onClick={() => onShowPolicy("privacy")}>Privacy Policy</span>.
          </div>
        )}
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

function CommentNode({ node, dealId, user, role, profilesById, replyingTo, setReplyingTo, replyText, setReplyText, onComment, onDelete, onReport, styles }) {
  const authorName = nameFor(node.user_id, profilesById, node.user);
  const authorAvatar = profilesById?.[node.user_id]?.avatar_url;
  const [collapsed, setCollapsed] = useState(false);
  const totalReplies = (n) => n.replies.reduce((acc, r) => acc + 1 + totalReplies(r), 0);
  const replyCount = totalReplies(node);

  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 2 }}>
      {/* Left column: avatar + collapse line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 36, flexShrink: 0 }}>
        {authorAvatar ? (
          <img src={authorAvatar} alt={authorName} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ ...styles.commentAvatar, background: avatarColor(authorName), width: 28, height: 28, fontSize: 12, flexShrink: 0 }}>
            {(authorName || "?")[0].toUpperCase()}
          </div>
        )}
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
          <span style={styles.commentUser}>{authorName}</span>
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
              {user && node.user_id !== user?.id && (
                <button onClick={() => onReport("comment", node.id, node.text)}
                  style={{ background: "none", border: "none", fontSize: 12, color: "var(--text-faint)", cursor: "pointer", padding: "3px 6px", borderRadius: 4, fontFamily: "inherit" }}>
                  Report
                </button>
              )}
            </div>

            {/* Inline reply box */}
            {replyingTo === node.id && (
              <div style={{ marginBottom: 12 }}>
                <textarea
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", resize: "none", height: 72, lineHeight: 1.5, marginBottom: 8, display: "block" }}
                  placeholder={`Reply to ${authorName}...`}
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
              <CommentNode key={r.id} node={r} dealId={dealId} user={user} role={role} profilesById={profilesById}
                replyingTo={replyingTo} setReplyingTo={setReplyingTo}
                replyText={replyText} setReplyText={setReplyText}
                onComment={onComment} onDelete={onDelete} onReport={onReport} styles={styles} />
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
            <img src={deal.imageUrl} alt={deal.title} style={{ width: "100%", height: "auto", borderRadius: 8, marginBottom: 8, display: "block" }} />
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
