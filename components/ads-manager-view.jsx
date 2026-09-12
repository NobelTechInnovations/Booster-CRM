"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  ImageIcon,
  Layers,
  Loader2,
  Megaphone,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Target,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  listAdsChannels,
  listAdCampaigns,
  listAdSets as apiListAdSets,
  listAds as apiListAds,
  updateAdCampaign,
  updateAdSet as apiUpdateAdSet,
  updateAdStatus,
  updateAdCreative,
} from "@/lib/api";
import { formatMoney } from "@/lib/utils";

// ─── Small shared bits ───────────────────────────────────────────────────────

function StatusToggle({ status, busy, onChange }) {
  const isActive = status === "ACTIVE";
  return (
    <button
      onClick={() => onChange(isActive ? "PAUSED" : "ACTIVE")}
      disabled={busy}
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition disabled:opacity-50 ${
        isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : isActive ? <Pause size={12} /> : <Play size={12} />}
      {isActive ? "Active" : "Paused"}
    </button>
  );
}

// Click-to-edit budget — shows the formatted amount until clicked, then a
// small inline number input with save/cancel. No separate "edit mode" for
// the whole row; this is the one field on a campaign/ad set that's
// genuinely quick to change often, so it gets its own compact affordance.
function BudgetEditor({ value, currency, busy, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value != null ? String(value) : ""); setEditing(true); }}
        className="flex items-center gap-1 text-sm font-semibold text-slate-900 hover:text-indigo-700"
      >
        {value != null ? `${formatMoney(value, currency)}/day` : "No budget set"}
        <Pencil size={11} className="text-slate-400" />
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(draft);
        if (!Number.isFinite(n) || n <= 0) return;
        onSave(n);
        setEditing(false);
      }}
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        type="number"
        min="1"
        step="1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-7 w-24 rounded-md border border-slate-200 px-1.5 text-xs outline-none focus:border-indigo-500"
      />
      <button type="submit" disabled={busy} className="text-emerald-600 hover:text-emerald-700"><Check size={15} /></button>
      <button type="button" onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
    </form>
  );
}

function InsightsStrip({ insights, currency }) {
  const items = [
    { label: "Spend", value: formatMoney(insights.spend, currency) },
    { label: "Impressions", value: insights.impressions.toLocaleString("en-IN") },
    { label: "Clicks", value: insights.clicks.toLocaleString("en-IN") },
    { label: "CTR", value: `${insights.ctr.toFixed(2)}%` },
    { label: "Purchases", value: insights.purchases.toLocaleString("en-IN") },
  ];
  return (
    <div className="mt-3 grid grid-cols-5 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-center">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-xs font-bold text-slate-900">{item.value}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Edit Creative modal ─────────────────────────────────────────────────────
// Meta ad creatives are immutable once created — saving here always
// creates a brand-new creative behind the scenes and points the ad at it
// (see updateAdCreative on the backend); from this side it just looks like
// editing the ad directly.
function CreativeModal({ ad, channelId, onClose, onSaved }) {
  const [caption, setCaption] = useState(ad.creative?.caption || "");
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(ad.creative?.imageUrl || ad.creative?.thumbnailUrl || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updateAdCreative(channelId, ad.id, { caption, imageFile });
      onSaved({ ...ad.creative, caption, imageUrl: preview });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Edit Creative</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        {preview ? <img src={preview} alt="" className="mb-3 h-40 w-full rounded-lg border border-slate-200 object-cover" /> : null}
        <label className="mb-3 flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600">
          <ImageIcon size={13} /> {imageFile ? imageFile.name : "Replace image"}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Caption</label>
        <textarea
          rows={4}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />

        {error ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Audience modal ─────────────────────────────────────────────────────
// Deliberately covers only the most common targeting dimensions — age
// range, gender, and a country list. A real ad set's targeting can carry
// dozens of other fields (detailed interests, custom audiences,
// placements...); those are read and preserved as-is by the backend, just
// not editable from this form yet.
function AudienceModal({ adSet, channelId, onClose, onSaved }) {
  const [ageMin, setAgeMin] = useState(adSet.targeting?.ageMin ?? 18);
  const [ageMax, setAgeMax] = useState(adSet.targeting?.ageMax ?? 65);
  const [gender, setGender] = useState(
    !adSet.targeting?.genders?.length || adSet.targeting.genders.length === 2 ? "all" : adSet.targeting.genders[0] === 1 ? "male" : "female",
  );
  const [countries, setCountries] = useState((adSet.targeting?.countries || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    const genders = gender === "male" ? [1] : gender === "female" ? [2] : [1, 2];
    const countryList = countries.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    try {
      await apiUpdateAdSet(channelId, adSet.id, { targeting: { ageMin: Number(ageMin), ageMax: Number(ageMax), genders, countries: countryList } });
      onSaved({ ageMin: Number(ageMin), ageMax: Number(ageMax), genders, countries: countryList });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Edit Audience</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Min Age</label>
            <input type="number" min="13" max="65" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Max Age</label>
            <input type="number" min="13" max="65" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500" />
          </div>
        </div>

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</label>
        <div className="mb-3 flex gap-2">
          {[["all", "All"], ["male", "Men"], ["female", "Women"]].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setGender(key)}
              className={`h-9 flex-1 rounded-lg text-xs font-semibold transition ${gender === key ? "bg-indigo-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Countries (ISO codes, comma-separated)</label>
        <input
          value={countries}
          onChange={(e) => setCountries(e.target.value)}
          placeholder="IN, AE, US"
          className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500"
        />

        {error ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function AdsManagerView() {
  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState("");
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const [currency, setCurrency] = useState("INR");
  const [campaigns, setCampaigns] = useState(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [adSets, setAdSets] = useState(null);
  const [loadingAdSets, setLoadingAdSets] = useState(false);

  const [selectedAdSet, setSelectedAdSet] = useState(null);
  const [ads, setAds] = useState(null);
  const [loadingAds, setLoadingAds] = useState(false);

  const [creativeModalAd, setCreativeModalAd] = useState(null);
  const [audienceModalAdSet, setAudienceModalAdSet] = useState(null);

  useEffect(() => {
    listAdsChannels()
      .then((res) => {
        const metaChannels = (res.channels || []).filter((c) => c.provider === "meta" && c.status === "connected" && c.external?.adAccountId);
        setChannels(metaChannels);
        if (metaChannels.length) setChannelId(metaChannels[0]._id || metaChannels[0].id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingChannels(false));
  }, []);

  async function loadCampaigns() {
    if (!channelId) return;
    setLoadingCampaigns(true);
    setError("");
    try {
      const res = await listAdCampaigns(channelId);
      setCampaigns(res.campaigns);
      setCurrency(res.currency);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingCampaigns(false);
    }
  }

  useEffect(() => {
    setSelectedCampaign(null);
    setSelectedAdSet(null);
    setAdSets(null);
    setAds(null);
    loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  async function openCampaign(campaign) {
    setSelectedCampaign(campaign);
    setSelectedAdSet(null);
    setAds(null);
    setAdSets(null);
    setLoadingAdSets(true);
    setError("");
    try {
      const res = await apiListAdSets(channelId, campaign.id);
      setAdSets(res.adSets);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAdSets(false);
    }
  }

  async function openAdSet(adSet) {
    setSelectedAdSet(adSet);
    setAds(null);
    setLoadingAds(true);
    setError("");
    try {
      const res = await apiListAds(channelId, adSet.id);
      setAds(res.ads);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAds(false);
    }
  }

  async function handleCampaignStatus(campaign, status) {
    setBusyId(campaign.id);
    setError("");
    try {
      await updateAdCampaign(channelId, campaign.id, { status });
      setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? { ...c, status, effectiveStatus: status } : c)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function handleCampaignBudget(campaign, dailyBudget) {
    setBusyId(campaign.id);
    setError("");
    try {
      await updateAdCampaign(channelId, campaign.id, { dailyBudget });
      setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? { ...c, dailyBudget } : c)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function handleAdSetStatus(adSet, status) {
    setBusyId(adSet.id);
    setError("");
    try {
      await apiUpdateAdSet(channelId, adSet.id, { status });
      setAdSets((prev) => prev.map((a) => (a.id === adSet.id ? { ...a, status, effectiveStatus: status } : a)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function handleAdSetBudget(adSet, dailyBudget) {
    setBusyId(adSet.id);
    setError("");
    try {
      await apiUpdateAdSet(channelId, adSet.id, { dailyBudget });
      setAdSets((prev) => prev.map((a) => (a.id === adSet.id ? { ...a, dailyBudget } : a)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function handleAdStatus(ad, status) {
    setBusyId(ad.id);
    setError("");
    try {
      await updateAdStatus(channelId, ad.id, status);
      setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, status, effectiveStatus: status } : a)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  const activeChannel = channels.find((c) => (c._id || c.id) === channelId);
  const view = selectedAdSet ? "ads" : selectedCampaign ? "adsets" : "campaigns";

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-4 lg:px-8">
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="indigo">Ads Manager</Badge>
          <h1 className="mt-3 text-2xl tracking-tight text-slate-950 md:text-[24px]">Ads Manager</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Edit budgets, audiences, and creatives on your live Meta campaigns — and see what's actually working.
          </p>
        </div>
        {channels.length > 1 ? (
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="h-9 rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-500"
          >
            {channels.map((c) => (
              <option key={c._id || c.id} value={c._id || c.id}>{c.external?.adAccountName || c.name}</option>
            ))}
          </select>
        ) : null}
      </section>

      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      ) : null}

      {loadingChannels ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-600" /></div>
      ) : !channels.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100"><Megaphone size={22} className="text-slate-400" /></div>
            <div>
              <p className="font-semibold text-slate-700">No Meta ad account connected</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Connect Meta Ads and select an ad account from Channels first.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Breadcrumb */}
          <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
            <button
              onClick={() => { setSelectedCampaign(null); setSelectedAdSet(null); }}
              className={`font-semibold ${view === "campaigns" ? "text-slate-900" : "text-indigo-700 hover:text-indigo-900"}`}
            >
              Campaigns
            </button>
            {selectedCampaign ? (
              <>
                <ChevronRight size={14} className="text-slate-300" />
                <button
                  onClick={() => setSelectedAdSet(null)}
                  className={`font-semibold ${view === "adsets" ? "text-slate-900" : "text-indigo-700 hover:text-indigo-900"}`}
                >
                  {selectedCampaign.name}
                </button>
              </>
            ) : null}
            {selectedAdSet ? (
              <>
                <ChevronRight size={14} className="text-slate-300" />
                <span className="font-semibold text-slate-900">{selectedAdSet.name}</span>
              </>
            ) : null}
            <button onClick={loadCampaigns} className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <RefreshCw size={12} className={loadingCampaigns ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          {/* Campaigns */}
          {view === "campaigns" ? (
            loadingCampaigns ? (
              <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-600" /></div>
            ) : !campaigns?.length ? (
              <Card><CardContent className="p-10 text-center text-sm text-[var(--muted)]">No campaigns on this ad account.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {campaigns.map((c) => (
                  <Card key={c.id} className="cursor-pointer transition hover:border-indigo-200" onClick={() => openCampaign(c)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold text-slate-900">{c.name}</p>
                            <Badge tone="slate">{c.objective?.replace(/^OUTCOME_/, "").replace(/_/g, " ") || "—"}</Badge>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <BudgetEditor value={c.dailyBudget} currency={currency} busy={busyId === c.id} onSave={(v) => handleCampaignBudget(c, v)} />
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <StatusToggle status={c.status} busy={busyId === c.id} onChange={(s) => handleCampaignStatus(c, s)} />
                          <ChevronRight size={16} className="text-slate-300" />
                        </div>
                      </div>
                      <InsightsStrip insights={c.insights} currency={currency} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : null}

          {/* Ad Sets */}
          {view === "adsets" ? (
            <div>
              <button onClick={() => setSelectedCampaign(null)} className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900">
                <ArrowLeft size={13} /> Back to campaigns
              </button>
              {loadingAdSets ? (
                <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-600" /></div>
              ) : !adSets?.length ? (
                <Card><CardContent className="p-10 text-center text-sm text-[var(--muted)]">No ad sets in this campaign.</CardContent></Card>
              ) : (
                <div className="space-y-3">
                  {adSets.map((a) => (
                    <Card key={a.id} className="cursor-pointer transition hover:border-indigo-200" onClick={() => openAdSet(a)}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">{a.name}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-3" onClick={(e) => e.stopPropagation()}>
                              <BudgetEditor value={a.dailyBudget} currency={currency} busy={busyId === a.id} onSave={(v) => handleAdSetBudget(a, v)} />
                              {a.targeting ? (
                                <button onClick={() => setAudienceModalAdSet(a)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-700">
                                  <Target size={12} /> {a.targeting.ageMin}–{a.targeting.ageMax}
                                  {a.targeting.genders?.length === 1 ? (a.targeting.genders[0] === 1 ? " · Men" : " · Women") : " · All genders"}
                                  {a.targeting.countries?.length ? ` · ${a.targeting.countries.join(", ")}` : ""}
                                  <Pencil size={10} />
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <StatusToggle status={a.status} busy={busyId === a.id} onChange={(s) => handleAdSetStatus(a, s)} />
                            <ChevronRight size={16} className="text-slate-300" />
                          </div>
                        </div>
                        <InsightsStrip insights={a.insights} currency={currency} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Ads */}
          {view === "ads" ? (
            <div>
              <button onClick={() => setSelectedAdSet(null)} className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900">
                <ArrowLeft size={13} /> Back to ad sets
              </button>
              {loadingAds ? (
                <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-600" /></div>
              ) : !ads?.length ? (
                <Card><CardContent className="p-10 text-center text-sm text-[var(--muted)]">No ads in this ad set.</CardContent></Card>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {ads.map((a) => (
                    <Card key={a.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {a.creative?.thumbnailUrl || a.creative?.imageUrl ? (
                            <img src={a.creative.thumbnailUrl || a.creative.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover" />
                          ) : (
                            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-300"><ImageIcon size={22} /></div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-900">{a.name}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{a.creative?.caption || "No caption"}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <StatusToggle status={a.status} busy={busyId === a.id} onChange={(s) => handleAdStatus(a, s)} />
                          <button onClick={() => setCreativeModalAd(a)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-700">
                            <Pencil size={11} /> Edit Creative
                          </button>
                        </div>
                        <InsightsStrip insights={a.insights} currency={currency} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {creativeModalAd ? (
        <CreativeModal
          ad={creativeModalAd}
          channelId={channelId}
          onClose={() => setCreativeModalAd(null)}
          onSaved={(creative) => {
            setAds((prev) => prev.map((a) => (a.id === creativeModalAd.id ? { ...a, creative: { ...a.creative, ...creative } } : a)));
            setCreativeModalAd(null);
          }}
        />
      ) : null}

      {audienceModalAdSet ? (
        <AudienceModal
          adSet={audienceModalAdSet}
          channelId={channelId}
          onClose={() => setAudienceModalAdSet(null)}
          onSaved={(targeting) => {
            setAdSets((prev) => prev.map((a) => (a.id === audienceModalAdSet.id ? { ...a, targeting } : a)));
            setAudienceModalAdSet(null);
          }}
        />
      ) : null}
    </div>
  );
}
