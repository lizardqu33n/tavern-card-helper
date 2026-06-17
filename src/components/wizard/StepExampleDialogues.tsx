/**
 * Step 5: Example Dialogues (optional).
 * Shows the AI how the character speaks. Uses <START>, {{user}}, and actual character names.
 * Supports AI generation with real-time streaming progress.
 */
import { useState, useCallback, useRef } from 'react';
import { TextArea } from '../shared/TextArea';
import { Button } from '../shared/Button';
import { AIProgressPanel, type AIProgressStatus } from '../shared/AIProgressPanel';
import { useAIGenerate } from '../../hooks/useAIGenerate';

interface StepExampleDialoguesProps {
  exampleDialogues: string;
  cardName: string;
  characterDescriptions: string;
  existingWorldbookContext?: string;
  onChange: (dialogues: string) => void;
}

export function StepExampleDialogues({ exampleDialogues, cardName, characterDescriptions, existingWorldbookContext, onChange }: StepExampleDialoguesProps) {
  const { generateExampleDialoguesStreaming } = useAIGenerate();
  const [aiStatus, setAiStatus] = useState<AIProgressStatus>('idle');
  const [aiText, setAiText] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const retryCountRef = useRef(0);

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
      const fullText = await generateExampleDialoguesStreaming(
        cardName,
        characterDescriptions,
        (chunk) => {
          setAiText((prev) => prev + chunk);
        },
        existingWorldbookContext,
      );

      // ── Empty response detection ──────────────────────────────────
      const trimmed = fullText.trim();
      if (trimmed.length < 30) {
        retryCountRef.current = isRetry ? retryCountRef.current + 1 : 1;
        const currentRetry = retryCountRef.current;
        setRetryCount(currentRetry);
        if (currentRetry <= 2) {
          setAiText(`⚠️ AI 返回内容过短（${trimmed.length} 字），自动重试中 (${currentRetry}/2)...\n\n`);
          setTimeout(() => handleStreamGenerate(true), 1000);
          return;
        } else {
          setAiStatus('error');
          setAiError(`AI 连续 3 次返回空内容。请检查 API 配置或角色描述后重试。`);
          return;
        }
      }

      setAiStatus('done');
      setPendingResult(fullText);
    } catch (err: unknown) {
      setAiStatus('error');
      setAiError(err instanceof Error ? err.message : '生成失败');
    }
  }, [cardName, characterDescriptions, existingWorldbookContext, generateExampleDialoguesStreaming]);

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">示例对话 <span className="text-sm font-normal text-slate-500">（可选）</span></h2>
          <p className="text-sm text-slate-400 mt-1">
            示例对话可以教会 AI 角色的说话方式。用 {'<START>'} 分隔不同的对话组。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleStreamGenerate(false)}
            disabled={aiStatus === 'generating'}
          >
            {aiStatus === 'generating'
              ? (retryCount > 0 ? `⏳ 重试中 (${retryCount}/2)...` : '⏳ 生成中...')
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

      {/* AI Progress Panel */}
      {aiStatus !== 'idle' && (
        <div className="mb-4">
          <AIProgressPanel
            status={aiStatus}
            text={aiText}
            error={aiError}
            title={retryCount > 0 ? `AI 示例对话生成 (重试 ${retryCount}/2)` : 'AI 示例对话生成'}
            onClear={handleClear}
          />
        </div>
      )}

      <TextArea
        value={exampleDialogues}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`<START>\n{{user}}: Hello there!\n角色名: *looks up* Oh, greetings. I didn't expect company.\n\n<START>\n{{user}}: Tell me about yourself.\n角色名: *sighs* It's a long story...`}
        rows={12}
        className="font-mono"
      />
      <p className="mt-2 text-xs text-slate-500">
        格式：每组对话以 {'<START>'} 开头，然后 {'{{user}}'}: 消息，角色名: 回复（用角色设定名称，不要用 {'{{char}}'}）。写 2-3 组简短对话。
      </p>
    </div>
  );
}