// app/components/SessionRunner.tsx
"use client";

import React from "react";
import { useToast } from "./Toast";

/* ========= 型 ========= */
type CEFR = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type Demand = {
  profile: {
    ageRange: "10s" | "20s" | "30s" | "40s" | "50s+";
    gender: "male" | "female" | "other" | "prefer_not_to_say";
    role: string;
    industry: "food_service" | "hotel" | "retail" | "transport" | "other";
    useCase: "inbound_service" | "business" | "study_abroad" | "daily_life";
  };
  level: { selfReport: string; cefr: CEFR; knownIssues: string[] };
  constraints: { minutesPerDay: number; deadlineWeeks: number; scenes: string[] };
  prefs: { lang: "ja" | "en"; mode: "ai_only" | "ai_plus_coach" | "ai_plus_books" | "full_mix" };
};

type StepId = "listen_and_repeat" | "roleplay_ai" | "review";
type Genre = "restaurant" | "hotel" | "retail" | "guide";
type Phrase = { en: string; ja: string };
type PhrasesResp = { phrases: Phrase[] };

type StartResp = { question: string; ideal?: string; contextId?: string };
type ReplyResp = { ai: string; ideal?: string; done?: boolean; contextId?: string };
type Turn = { who: "ai" | "user"; text: string; audioUrl?: string };

/* ========= ユーティリティ ========= */
function toGenre(industry: Demand["profile"]["industry"]): Genre {
  switch (industry) {
    case "food_service":
      return "restaurant";
    case "hotel":
      return "hotel";
    case "retail":
      return "retail";
    case "transport":
    case "other":
    default:
      return "guide";
  }
}
function sceneForGenre(g: Genre): string {
  switch (g) {
    case "restaurant":
      return "menu";
    case "hotel":
      return "check_in";
    case "retail":
      return "payment";
    case "guide":
    default:
      return "directions";
  }
}
const cefrLabel: Record<CEFR, string> = {
  A1: "A1（基礎入門）",
  A2: "A2（基礎）",
  B1: "B1（日常会話）",
  B2: "B2（応用）",
  C1: "C1（上級）",
  C2: "C2（最上級）",
};

/* ========= ルート ========= */
export default function SessionRunner({
  demand,
  onPhrasePlayed,
  onRoleplayCompleted,
  onStepDone,
  onStart,
  phrasesOverride,
}: {
  demand: Demand;
  onPhrasePlayed?: (index: number) => void;
  onRoleplayCompleted?: (payload?: { score?: number }) => void;
  onStepDone?: (id: "phrases" | "roleplay" | "review") => void;
  onStart?: () => void;
  phrasesOverride?: Phrase[]; // ← 追加
}) {
  const { push } = useToast();
  const steps: StepId[] = ["listen_and_repeat", "roleplay_ai", "review"];
  const [current, setCurrent] = React.useState<number>(0);

  const genre = toGenre(demand.profile.industry);
  const level: CEFR = (["A1", "A2", "B1", "B2", "C1", "C2"] as CEFR[]).includes(
    demand.level.cefr
  )
    ? demand.level.cefr
    : "A2";

  // フレーズ（override が来たらそれを優先）
  const [phrases, setPhrases] = React.useState<Phrase[]>(phrasesOverride ?? []);
  const [loading, setLoading] = React.useState<boolean>(false);

  // フレーズ取得（週プラン差し込み対応）
React.useEffect(() => {
  // 1) 週プランからの差し込みがあれば API を呼ばない
  if (phrasesOverride && phrasesOverride.length > 0) {
    setPhrases(phrasesOverride.slice(0, 10));
    return;
  }

  // 2) 差し込みがなければ従来どおり取得
  let aborted = false;
  (async () => {
    try {
      setLoading(true);
      const r = await fetch("/api/phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre, level }),
      });
      const j = (await r.json()) as PhrasesResp | { error?: string };
      if (!r.ok || !("phrases" in j)) throw new Error(("error" in j && j.error) || "フレーズ取得に失敗しました");
      if (!aborted) setPhrases(j.phrases.slice(0, 10));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "エラーが発生しました";
      if (!aborted) {
        setPhrases([]);
        push({ kind: "error", title: "フレーズ取得エラー", message: msg });
      }
    } finally {
      if (!aborted) setLoading(false);
    }
  })();
  return () => { aborted = true; };
  // ここに phrasesOverride を入れておくのがポイント
}, [genre, level, phrasesOverride, push]);

  // セッション開始時のKPI初期化
  React.useEffect(() => {
    onStart?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 初回のみ

  return (
    <div>
      {/* タブ */}
      <div className="space-y-3">
        {steps.map((s, i) => (
          <button
            key={`step-${s}`}
            type="button"
            onClick={() => setCurrent(i)}
            className={`w-full rounded-xl border px-4 py-3 text-left ${
              i === current ? "bg-gray-50 border-gray-800" : "hover:bg-gray-50"
            }`}
          >
            {i + 1}. {s === "listen_and_repeat" ? "音読＆リピート" : s === "roleplay_ai" ? "AIロールプレイ" : "重要表現の復習"}
          </button>
        ))}
      </div>

      {/* パネル */}
      <div className="mt-4">
        {steps[current] === "listen_and_repeat" && (
          <ListenAndRepeat
            genre={genre}
            level={level}
            phrases={phrases}
            loading={loading}
            onPhrasePlayed={onPhrasePlayed}
          />
        )}

        {steps[current] === "roleplay_ai" && (
          <RoleplayBlock genre={genre} level={level} onRoleplayCompleted={onRoleplayCompleted} />
        )}

        {steps[current] === "review" && <ReviewBlock genre={genre} level={level} phrases={phrases} />}

        {/* 次へ */}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              const id =
                steps[current] === "listen_and_repeat"
                  ? "phrases"
                  : steps[current] === "roleplay_ai"
                  ? "roleplay"
                  : "review";
              onStepDone?.(id);
              setCurrent((c) => Math.min(c + 1, steps.length - 1));
            }}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
          >
            次へ →
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========= ① フレーズ＆TTS ========= */
function ListenAndRepeat({
  genre,
  level,
  phrases,
  loading,
  onPhrasePlayed,
}: {
  genre: Genre;
  level: CEFR;
  phrases: Phrase[];
  loading: boolean;
  onPhrasePlayed?: (index: number) => void;
}) {
  const { push } = useToast();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [loadingIndex, setLoadingIndex] = React.useState<number | null>(null);
  const cacheRef = React.useRef<Map<string, string>>(new Map());

  async function play(text: string, idx: number) {
    try {
      setLoadingIndex(idx);
      let url = cacheRef.current.get(text);
      if (!url) {
        const r = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "default" }),
        });
        if (!r.ok) throw new Error("TTS生成に失敗しました");
        const b = await r.blob();
        url = URL.createObjectURL(b);
        cacheRef.current.set(text, url);
      }
      const a = audioRef.current;
      if (a) {
        a.src = url;
        await a.play().catch(() => void 0);
      }
      onPhrasePlayed?.(idx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "エラーが発生しました";
      push({ kind: "error", title: "再生できません", message: msg });
    } finally {
      setLoadingIndex(null);
    }
  }

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm text-gray-600">
        ジャンル: <span className="font-medium">{genre}</span> / レベル:{" "}
        <span className="font-medium">{cefrLabel[level]}</span>
      </div>

      {loading ? (
        <div className="mt-3 text-sm text-gray-500">フレーズを生成中…</div>
      ) : phrases.length === 0 ? (
        <div className="mt-3 text-sm text-gray-500">フレーズが取得できませんでした。</div>
      ) : (
        <>
          <ul className="mt-3 space-y-4">
            {phrases.map((p, i) => (
              <li key={`${p.en}-${i}`} className="text-sm leading-6">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="font-semibold">{p.en}</div>
                    <div className="text-gray-600">{p.ja}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => play(p.en, i)}
                    disabled={loadingIndex === i}
                    className="shrink-0 rounded-md border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                    aria-label={`Play phrase ${i + 1}`}
                    title="英語を再生"
                  >
                    {loadingIndex === i ? "…再生中" : "▶︎ 再生"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <audio ref={audioRef} className="mt-3 w-full" />
        </>
      )}
    </div>
  );
}

/* ========= ② ロールプレイ（録音つき 最大3ターン + 模範解答） ========= */
function RoleplayBlock({
  genre,
  level,
  onRoleplayCompleted,
}: {
  genre: Genre;
  level: CEFR;
  onRoleplayCompleted?: (payload?: { score?: number }) => void;
}) {
  const { push } = useToast();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const scene = sceneForGenre(genre);

  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [contextId, setContextId] = React.useState<string | undefined>(undefined);
  const [recording, setRecording] = React.useState<boolean>(false);
  const [recorder, setRecorder] = React.useState<MediaRecorder | null>(null);
  const [ideal, setIdeal] = React.useState<string | undefined>(undefined);
  const [showIdeal, setShowIdeal] = React.useState<boolean>(false);
  const [round, setRound] = React.useState<number>(0);
  const MAX_ROUNDS = 3;

  // AIの最初の質問
  const start = async () => {
    try {
      const r = await fetch("/api/roleplay/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene, level }),
      });
      const j = (await r.json()) as StartResp | { error?: string };
      if (!r.ok || !("question" in j)) throw new Error(("error" in j && j.error) || "開始に失敗しました");
      setTurns([{ who: "ai", text: j.question }]);
      setIdeal(j.ideal);
      setContextId(j.contextId);
      await speak(j.question);
      push({ kind: "success", title: "AIが最初の質問をしました", message: "録音して返答してみましょう。" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "エラーが発生しました";
      push({ kind: "error", title: "開始できませんでした", message: msg });
    }
  };

  // 音声合成
  async function speak(text: string) {
    const r2 = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: "default" }),
    });
    if (!r2.ok) throw new Error("TTS生成に失敗しました");
    const b = await r2.blob();
    const url = URL.createObjectURL(b);
    const a = audioRef.current;
    if (a) {
      a.src = url;
      await a.play().catch(() => void 0);
    }
  }

  // 録音開始/停止
  const toggleRec = async () => {
    if (!recording) {
      // start
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? { mimeType: "audio/webm;codecs=opus" }
          : undefined
      );
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });

        try {
          // ---- STT
          const form = new FormData();
          form.append("file", new File([blob], "user.webm", { type: "audio/webm" })); // /api/stt は 'file'想定
          const stt = await fetch("/api/stt", { method: "POST", body: form });

          // 返却が JSON かを厳密チェック（HTMLエラー等を拾う）
          const ctype = stt.headers.get("content-type") || "";
          if (!ctype.includes("application/json")) {
            throw new Error(await stt.text());
          }
          const j = (await stt.json()) as { text?: string; error?: string };
          if (!stt.ok || !j.text) throw new Error(j.error || "音声を認識できませんでした");

          // 会話にユーザーを追加
          const userText = j.text.trim();
          setTurns((t) => [...t, { who: "user", text: userText }]);

          // ---- AI 返答
          const r = await fetch("/api/roleplay/reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scene, level, user: userText, contextId }),
          });
          const jr = (await r.json()) as ReplyResp | { error?: string };
          if (!r.ok || !("ai" in jr)) throw new Error(("error" in jr && jr.error) || "返答の生成に失敗しました");

          setIdeal((prev) => jr.ideal ?? prev);
          setContextId(jr.contextId ?? contextId);
          setTurns((t) => [...t, { who: "ai", text: (jr as ReplyResp).ai }]);
          await speak((jr as ReplyResp).ai);

          // ラウンド前進
          setRound((n) => {
            const next = Math.min(n + 1, MAX_ROUNDS);
            if (next >= MAX_ROUNDS || (jr as ReplyResp).done) {
              onRoleplayCompleted?.({});
            }
            return next;
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "エラーが発生しました";
          push({ kind: "error", title: "処理に失敗しました", message: msg });
        }
      };
      rec.start();
      setRecorder(rec);
      setRecording(true);
    } else {
      // stop
      recorder?.stop();
      recorder?.stream.getTracks().forEach((t) => t.stop());
      setRecorder(null);
      setRecording(false);
    }
  };

  // 模範解答（start/replyで来ない場合のフォールバック）
  const ensureIdeal = async () => {
    if (ideal) {
      setShowIdeal((v) => !v);
      return;
    }
    try {
      // 最後の AI 発話を自前で検索（findLast 非依存）
      const lastAi = (() => {
        for (let i = turns.length - 1; i >= 0; i--) {
          if (turns[i].who === "ai") return turns[i].text;
        }
        return "";
      })();

      const r = await fetch("/api/roleplay/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene, level, question: lastAi }),
      });

      // JSON 以外（HTML等）の場合はテキストをそのままエラー表示
      const ctype = r.headers.get("content-type") || "";
      if (!ctype.includes("application/json")) {
        throw new Error(await r.text());
      }

      // {model} / {ideal} どちらでも受ける
      const j = (await r.json()) as { model?: string; ideal?: string; error?: string };
      const answer = j.model ?? j.ideal;

      if (!r.ok || !answer) {
        throw new Error(j.error || "模範解答を取得できませんでした");
      }

      setIdeal(answer);
      setShowIdeal(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "エラーが発生しました";
      push({ kind: "error", title: "模範解答の取得に失敗", message: msg });
    }
  };

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm text-gray-600">
        AIが最初に質問します。聞いたあとに返答してください。（シーン: {scene} / 最大 {MAX_ROUNDS} ターン）
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={start}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90"
        >
          🤖 最初の質問を聞く
        </button>

        <button
          type="button"
          onClick={toggleRec}
          className={`rounded-lg px-4 py-2 text-sm border hover:bg-gray-50 ${
            recording ? "bg-red-600 text-white border-red-600" : ""
          }`}
        >
          {recording ? "■ 録音停止" : "🎙 録音開始"}
        </button>

        <button
          type="button"
          onClick={ensureIdeal}
          className="rounded-lg px-4 py-2 text-sm border hover:bg-gray-50"
        >
          💡 模範解答を表示
        </button>
      </div>

      {/* 会話ログ */}
      <div className="mt-4 rounded-xl border p-4">
        <div className="text-sm text-gray-600">ロールプレイ</div>
        <div className="mt-1 text-xs text-gray-500">進行: {round}/{MAX_ROUNDS}</div>
        <audio ref={audioRef} controls className="mt-3 w-full" />
        <ul className="mt-3 space-y-2 text-sm">
          {turns.map((t, i) => (
            <li key={i} className={t.who === "ai" ? "text-gray-900" : "text-gray-700"}>
              <span className="inline-block w-10 text-xs font-semibold text-gray-500">
                {t.who === "ai" ? "AI" : "You"}
              </span>
              <span>{t.text}</span>
            </li>
          ))}
        </ul>

        {/* 模範解答 */}
        {showIdeal && ideal && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
            <div className="text-amber-800 font-semibold">模範解答</div>
            <p className="mt-1 text-amber-900">{ideal}</p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onRoleplayCompleted?.({})}
        className="mt-3 rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
      >
        ✅ ロールプレイ達成
      </button>
    </div>
  );
}

/* ========= ③ 重要表現の復習（1ステップに統合） ========= */
function ReviewBlock({ genre, level, phrases }: { genre: Genre; level: CEFR; phrases: Phrase[] }) {
  const list = phrases.slice(0, 5);
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm text-gray-600">
        本日のまとめ（ジャンル: {genre} / レベル: {cefrLabel[level]}）
      </div>
      {list.length === 0 ? (
        <div className="mt-2 text-sm text-gray-500">復習用の表現がありません。</div>
      ) : (
        <ul className="mt-2 list-disc pl-5 text-sm space-y-1 text-gray-700">
          {list.map((p, i) => (
            <li key={`${p.en}-${i}`}>
              <span className="font-medium">{p.en}</span>{" "}
              <span className="text-gray-500">— {p.ja}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 text-xs text-gray-500">
        ヒント：主語・時制・ていねい度を意識して音読 → 現場に合わせて言い換え練習。
      </div>
    </div>
  );
}
