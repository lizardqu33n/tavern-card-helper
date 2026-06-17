/**
 * Step 4: First Message - the character's opening message.
 * Supports AI generation with real-time streaming progress, word count control,
 * custom writing requirements, and empty response detection with auto-retry.
 */
import { useState, useCallback, useRef } from 'react';
import { TextArea } from '../shared/TextArea';
import { Button } from '../shared/Button';
import { AIProgressPanel, type AIProgressStatus } from '../shared/AIProgressPanel';
import { useAIGenerate } from '../../hooks/useAIGenerate';

interface StepFirstMessageProps {
  firstMessage: string;
  cardName: string;
  characterDescriptions: string;
  worldbookContext: string;
  onChange: (message: string) => void;
}

const WORD_COUNT_PRESETS = [
  { label: '不限', value: 0 },
  { label: '200 字', value: 200 },
  { label: '500 字', value: 500 },
  { label: '800 字', value: 800 },
  { label: '1200 字', value: 1200 },
];

/** Minimum acceptable content length for a valid response */
const MIN_RESPONSE_LENGTH = 50;
/** Maximum number of auto-retries when AI returns empty/too-short content */
const MAX_AUTO_RETRIES = 2;

export function StepFirstMessage({ firstMessage, cardName, characterDescriptions, worldbookContext, onChange }: StepFirstMessageProps) {
  const { generateFirstMessageStreaming } = useAIGenerate();
  const [aiStatus, setAiStatus] = useState<AIProgressStatus>('idle');
  const [aiText, setAiText] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<string | null>(null);
  const [targetWordCount, setTargetWordCount] = useState(0);
  const [writingRequirements, setWritingRequirements] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const retryCountRef = useRef(0);
  const [showRequirements, setShowRequirements] = useState(false);

  const handleStreamGenerate = useCallback(async (isRetry = false) => {
    if (!isRetry) {
      retryCountRef.current = 0;
      setRetryCount(0);
    }
    setAiStatus('generating');
    setAiText('');
    setAiError(null);
    setPendingResult(null);

    try {
      const fullText = await generateFirstMessageStreaming(
        cardName,
        characterDescriptions,
        '', // no scene hint for quick generate
        (chunk) => {
          setAiText((prev) => prev + chunk);
        },
        targetWordCount || undefined,
        worldbookContext,
        writingRequirements || undefined,
      );

      // ── Empty response detection ──────────────────────────────────────
      const trimmed = fullText.trim();
      if (trimmed.length < MIN_RESPONSE_LENGTH) {
        retryCountRef.current = isRetry ? retryCountRef.current + 1 : 1;
        const currentRetry = retryCountRef.current;
        setRetryCount(currentRetry);
        if (currentRetry <= MAX_AUTO_RETRIES) {
          // Auto-retry
          setAiText(`⚠️ AI 返回内容过短（${trimmed.length} 字），自动重试中 (${currentRetry}/${MAX_AUTO_RETRIES})...\n\n`);
          setTimeout(() => handleStreamGenerate(true), 1000);
          return;
        } else {
          // Exhausted retries
          setAiStatus('error');
          setAiError(`AI 连续 ${MAX_AUTO_RETRIES + 1} 次返回空内容或过短内容（${trimmed.length} 字）。请检查：\n1. API 配置是否正确\n2. 模型是否支持当前 token 数量\n3. 角色描述是否为空\n\n你可以尝试：\n- 补充角色描述后重新生成\n- 手动撰写开场白\n- 更换 AI 模型`);
          return;
        }
      }

      setAiStatus('done');
      setPendingResult(fullText);
    } catch (err: unknown) {
      setAiStatus('error');
      setAiError(err instanceof Error ? err.message : '生成失败');
    }
  }, [cardName, characterDescriptions, generateFirstMessageStreaming, targetWordCount, worldbookContext, writingRequirements]);

  const handleAccept = useCallback(() => {
    if (pendingResult) {
      onChange(pendingResult);
      setPendingResult(null);
    }
    setAiStatus('idle');
    setAiText('');
  }, [pendingResult, onChange]);

  const handleReject = useCallback(() => {
    setPendingResult(null);
    setAiStatus('idle');
    setAiText('');
  }, []);

  const handleClear = useCallback(() => {
    setAiStatus('idle');
    setAiText('');
    setAiError(null);
    setPendingResult(null);
    setRetryCount(0);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">开场白</h2>
          <p className="text-sm text-slate-400 mt-1">
            角色在对话开始时发出的第一条消息。可用 {'{{user}}'} 作为用户占位符，角色直接使用设定名称。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowRequirements(!showRequirements)}
          >
            {showRequirements ? '收起要求' : (writingRequirements.trim() ? '📝 写作要求 ✅' : '📝 写作要求')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleStreamGenerate(false)}
            disabled={aiStatus === 'generating'}
          >
            {aiStatus === 'generating'
              ? (retryCount > 0 ? `⏳ 重试中 (${retryCount}/${MAX_AUTO_RETRIES})...` : '⏳ 生成中...')
              : '✨ AI 生成'
            }
          </Button>
          {pendingResult && (
            <>
              <Button size="sm" onClick={handleAccept}>✅ 采纳</Button>
              <Button size="sm" variant="ghost" onClick={handleReject}>丢弃</Button>
            </>
          )}
        </div>
      </div>

      {/* Writing requirements panel */}
      {showRequirements && (
        <div className="mb-4 rounded-xl border-2 border-amber-600/50 bg-amber-950/20 p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-amber-300">⚠️ 开场白内容要求（最高优先级）</h3>
            </div>
            {writingRequirements.trim() && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-800/40 text-emerald-300">✅ 已填写，AI 将严格遵守</span>
            )}
          </div>
          <div className="rounded-lg bg-amber-900/20 border border-amber-700/30 px-3 py-2">
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              <strong>重要：</strong>这里写的内容会<strong>覆盖</strong>角色设定的优先级。AI 会按照你的要求来写开场白的具体情节、场景和对话，而不是泛泛地基于角色设定自由发挥。写得越具体，效果越好。
            </p>
          </div>
          <textarea
            value={writingRequirements}
            onChange={(e) => setWritingRequirements(e.target.value)}
            placeholder={"例如：\n- 开场白场景：深夜的酒吧，角色独自坐在角落喝酒\n- 用户走进酒吧，角色主动搭话\n- 语气要带点懒漫和不耐烦，但眼底有光\n- 必须包含一句对话：角色对 {{user}} 说\"这么晚了还来？\"\n- 结尾要留悬念，暗示角色有不可告人的过去"}
            className="w-full h-32 rounded-lg border border-amber-600/40 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 resize-y focus:border-amber-500 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-slate-500">
              💡 提示：场景、情节、对话、语气、必须包含的元素都可以写在这里。
            </p>
            {writingRequirements.trim() && (
              <span className="text-[10px] text-slate-500 shrink-0">{writingRequirements.length} 字</span>
            )}
          </div>
        </div>
      )}

      {/* Word count presets */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-slate-400 shrink-0">目标字数：</span>
        <div className="flex flex-wrap gap-1.5">
          {WORD_COUNT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => setTargetWordCount(preset.value)}
              className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                targetWordCount === preset.value
                  ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI Progress Panel */}
      {aiStatus !== 'idle' && (
        <div className="mb-4">
          <AIProgressPanel
            status={aiStatus}
            text={aiText}
            error={aiError}
            title={retryCount > 0 ? `AI 开场白生成 (重试 ${retryCount}/${MAX_AUTO_RETRIES})` : 'AI 开场白生成'}
            onClear={handleClear}
          />
        </div>
      )}

      <TextArea
        value={firstMessage}
        onChange={(e) => onChange(e.target.value)}
        placeholder="角色名缓缓睁开眼睛，冰冷的石板地面贴在背上..."
        rows={10}
        className="font-mono"
      />
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-slate-500">
          提示：好的开场白通常设置场景、包含感官细节，并给用户一个回应的钩子。
        </p>
        {firstMessage && (
          <span className="text-xs text-slate-500 shrink-0 ml-4">
            当前 {firstMessage.length} 字
          </span>
        )}
      </div>
    </div>
  );
}
