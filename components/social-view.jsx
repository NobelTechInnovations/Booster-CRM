"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  Share2,
  RefreshCw,
  Heart,
  MessageCircle,
  Eye,
  Send,
  ChevronDown,
  ChevronUp,
  Unlink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import {
  connectMetaSocial,
  listSocialChannels,
  syncSocialPosts,
  listSocialPosts,
  listPostComments,
  replyToSocialComment,
  disconnectSocialChannel,
} from "@/lib/api";

function fmt(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

// ─── Connect card ────────────────────────────────────────────────────────────

function SocialConnectCard() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setConnecting(true);
    setError("");
    try {
      const result = await connectMetaSocial();
      window.location.href = result.installUrl;
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Connect Instagram / Facebook</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">See post performance (reach, likes, comments) and reply to comments, all in one place.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={connect} disabled={connecting}>
          <Camera size={16} />
          {connecting ? "Opening Meta…" : "Connect Instagram / Facebook"}
        </Button>
        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          Your Instagram account needs to be a Business/Creator account linked to a Facebook Page — a personal
          Instagram account can't be connected this way. Facebook Page posts sync too, from the same connection.
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Comment thread ──────────────────────────────────────────────────────────

function CommentThread({ post, channelId }) {
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyTargetId, setReplyTargetId] = useState(post._id); // reply to the post's top-level comment by default
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    listPostComments(post._id)
      .then((res) => setComments(res.comments || []))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [post._id]);

  async function sendReply() {
    if (!replyText.trim() || !replyTargetId) return;
    setSending(true);
    setError("");
    try {
      const res = await replyToSocialComment(replyTargetId, { channelId, postId: post._id, message: replyText });
      setComments((prev) => [...prev, res.reply]);
      setReplyText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-[var(--line)] bg-slate-50/60 p-4">
      {isLoading ? (
        <p className="text-xs text-[var(--muted)]">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No comments yet.</p>
      ) : (
        <div className="max-h-72 space-y-2.5 overflow-y-auto">
          {comments.map((c) => (
            <button
              key={c._id || c.externalCommentId}
              onClick={() => setReplyTargetId(c.externalCommentId)}
              className={`block w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                c.isOwnReply
                  ? "ml-6 border-indigo-200 bg-indigo-50"
                  : replyTargetId === c.externalCommentId
                    ? "border-indigo-400 bg-white"
                    : "border-[var(--line)] bg-white hover:border-indigo-200"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{c.isOwnReply ? "You" : (c.fromUsername || "Someone")}</span>
                <span className="text-[10px] text-slate-400">{fmt(c.postedAt)}</span>
              </div>
              <p className="mt-0.5 text-slate-600">{c.text}</p>
            </button>
          ))}
        </div>
      )}

      {error ? <p className="mt-2 text-xs font-medium text-rose-700">{error}</p> : null}

      <div className="mt-3 flex items-center gap-2">
        <input
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendReply()}
          placeholder={replyTargetId === post._id ? "Reply to this post…" : "Reply to selected comment…"}
          className="h-9 flex-1 rounded-lg border border-[var(--line)] bg-white px-3 text-xs outline-none focus:border-indigo-500"
        />
        <Button onClick={sendReply} disabled={sending || !replyText.trim()} className="h-9 px-3 text-xs">
          <Send size={13} />
          {sending ? "Sending…" : "Reply"}
        </Button>
      </div>
    </div>
  );
}

// ─── Post card ───────────────────────────────────────────────────────────────

function PostCard({ post, channelId }) {
  const [expanded, setExpanded] = useState(false);
  const stats = post.insights || {};

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="flex gap-3 p-4">
        {post.mediaUrl || post.thumbnailUrl ? (
          <img src={post.thumbnailUrl || post.mediaUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-300">
            {post.platform === "instagram" ? <Camera size={22} /> : <Share2 size={22} />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone={post.platform === "instagram" ? "rose" : "blue"}>{post.platform}</Badge>
            <span className="text-[11px] text-slate-400">{fmt(post.postedAt)}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-[13px] text-slate-700">{post.caption || <span className="text-slate-400">No caption</span>}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><Eye size={12} /> {(stats.reach || 0).toLocaleString("en-IN")} reach</span>
            <span className="flex items-center gap-1"><Heart size={12} /> {(stats.likeCount || 0).toLocaleString("en-IN")}</span>
            <span className="flex items-center gap-1"><MessageCircle size={12} /> {(stats.commentsCount || 0).toLocaleString("en-IN")}</span>
            {post.permalink ? (
              <a href={post.permalink} target="_blank" rel="noreferrer" className="ml-auto text-indigo-600 hover:underline">View on {post.platform}</a>
            ) : null}
          </div>
        </div>
      </div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--line)] py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-50"
      >
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {expanded ? "Hide comments" : "View & reply to comments"}
      </button>
      {expanded ? <CommentThread post={post} channelId={channelId} /> : null}
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function SocialView() {
  const [channel, setChannel] = useState(null);
  const [loadingChannel, setLoadingChannel] = useState(true);
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listSocialChannels()
      .then((res) => setChannel((res.channels || [])[0] || null))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingChannel(false));
  }, []);

  async function loadPosts(nextPage = 1) {
    if (!channel) return;
    setLoadingPosts(true);
    setError("");
    try {
      const channelId = channel._id || channel.id;
      const res = await listSocialPosts(channelId, { page: nextPage, limit: 12 });
      setPosts((prev) => (nextPage === 1 ? res.posts : [...prev, ...res.posts]));
      setHasMore(!!res.hasMore);
      setPage(nextPage);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPosts(false);
    }
  }

  useEffect(() => { if (channel) loadPosts(1); }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sync() {
    setSyncing(true);
    setSyncNotice("");
    setError("");
    try {
      const channelId = channel._id || channel.id;
      const res = await syncSocialPosts(channelId);
      setSyncNotice(`Synced ${res.syncedRows} posts.`);
      await loadPosts(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  // Re-runs OAuth against the same Facebook Page/Instagram account — the
  // connect flow upserts the existing channel row rather than creating a
  // new one, so this is the way to refresh a token Meta has started
  // rejecting (e.g. after Meta rolled the account onto the "new Pages
  // experience", which needs a fresh Page-scoped token, not just the
  // original user token this channel may have been connected with).
  async function reconnect() {
    setReconnecting(true);
    setError("");
    try {
      const result = await connectMetaSocial();
      window.location.href = result.installUrl;
    } catch (err) {
      setError(err.message);
      setReconnecting(false);
    }
  }

  // Fully removes the connection so the connect card comes back, letting a
  // company connect an entirely different Instagram/Facebook account —
  // Reconnect above only lets you switch Page within the same Meta login.
  async function disconnect() {
    if (!window.confirm(`Disconnect ${channel.name}? You'll need to reconnect to see posts or reply to comments again.`)) return;
    setDisconnecting(true);
    setError("");
    try {
      await disconnectSocialChannel(channel._id || channel.id);
      setChannel(null);
      setPosts([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-4 lg:px-8">
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="indigo">Social Performance</Badge>
          <h1 className="mt-3 text-2xl tracking-tight text-slate-950 md:text-[24px]">Instagram &amp; Facebook</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Post performance and comment replies for your connected Instagram Business account and Facebook Page.
          </p>
        </div>
      </section>

      {loadingChannel ? (
        <Card><CardContent><ListRowsSkeleton rows={3} /></CardContent></Card>
      ) : !channel ? (
        <SocialConnectCard />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{channel.name}</CardTitle>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Last synced {channel.sync?.lastSyncAt ? fmt(channel.sync.lastSyncAt) : "never"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={reconnect} disabled={reconnecting} className="h-9 text-xs">
                  {reconnecting ? "Opening Meta…" : "Reconnect"}
                </Button>
                <Button variant="secondary" onClick={sync} disabled={syncing} className="h-9 text-xs">
                  <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Syncing…" : "Sync Posts"}
                </Button>
                <Button variant="secondary" onClick={disconnect} disabled={disconnecting} className="h-9 text-xs text-rose-600 hover:bg-rose-50">
                  <Unlink size={13} />
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </Button>
              </div>
            </CardHeader>
            {syncNotice ? <div className="border-t border-emerald-100 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800">{syncNotice}</div> : null}
            {error ? <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700">{error}</div> : null}
          </Card>

          {loadingPosts && posts.length === 0 ? (
            <Card><CardContent><ListRowsSkeleton rows={4} /></CardContent></Card>
          ) : posts.length === 0 ? (
            <Card><CardContent><p className="py-8 text-center text-sm text-[var(--muted)]">No posts synced yet — hit Sync Posts above.</p></CardContent></Card>
          ) : (
            <>
              <div className="grid gap-3">
                {posts.map((post) => (
                  <PostCard key={post._id} post={post} channelId={channel._id || channel.id} />
                ))}
              </div>
              {hasMore ? (
                <div className="flex justify-center">
                  <Button variant="secondary" onClick={() => loadPosts(page + 1)} disabled={loadingPosts} className="text-sm">
                    {loadingPosts ? "Loading…" : "Load more posts"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
