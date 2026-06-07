import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Download, Sparkles, BookMarked } from 'lucide-react';
import { Button } from '../components/shared/Button';
import { TextArea } from '../components/shared/TextArea';
import {
  analyzeNovelText,
  exportAnalysisAsJson,
  saveAnalysisLorebookImport,
  splitNovelText,
  type NovelAnalysisResult,
  type NovelChunk,
} from '../services/novel-analysis-service';

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

export function NovelAnalysisPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [chunks, setChunks] = useState<NovelChunk[]>([]);
  const [analysis, setAnalysis] = useState<NovelAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalChars = useMemo(() => text.trim().length, [text]);

  const handleChunk = () => {
    setError('');
    setAnalysis(null);
    const nextChunks = splitNovelText(text);
    setChunks(nextChunks);
    if (nextChunks.length === 0) setError('请先输入或上传小说文本');
  };

  const handleAnalyze = async () => {
    setError('');
    const nextChunks = chunks.length > 0 ? chunks : splitNovelText(text);
    setChunks(nextChunks);
    if (nextChunks.length === 0) {
      setError('请先输入或上传小说文本');
      return;
    }

    setLoading(true);
    try {
      const result = await analyzeNovelText(title, nextChunks);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '小说分析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setError('');
    setAnalysis(null);
    const content = await file.text();
    setText(content);
    setTitle(file.name.replace(/\.[^.]+$/, ''));
    setChunks(splitNovelText(content));
  };

  const handleExport = () => {
    if (!analysis) return;
    downloadText(`${title || 'novel-analysis'}.json`, exportAnalysisAsJson(title, chunks, analysis));
  };

  const handleImportToWizard = () => {
    if (!analysis) return;
    saveAnalysisLorebookImport(title, analysis);
    navigate('/wizard?fromNovelAnalysis=1');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">
      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <div className="rounded-2xl border border-emerald-700/30 bg-emerald-950/20 p-5 shadow-lg shadow-emerald-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BookMarked className="text-emerald-300" size={22} />
              <h1 className="text-2xl font-bold text-slate-100">小说分析提取</h1>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              参考 World-Agent 的智能切块与深度勘探思路，提取人物、地点、势力、时间线和可转世界书素材。
            </p>
          </div>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <FileText size={16} /> 上传 TXT
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-900/35 p-4 backdrop-blur-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">小说标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="可选，例如：斗罗大陆"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <TextArea
            label="小说文本"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setAnalysis(null);
              setChunks([]);
            }}
            placeholder="粘贴小说正文，或上传 .txt 文件。系统会自动识别 第X章 / 番外 / 序章 等章节标题。"
            className="min-h-[360px]"
          />

          {error && (
            <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleChunk} disabled={!text.trim()}>
              智能切块
            </Button>
            <Button onClick={handleAnalyze} disabled={loading || !text.trim()}>
              <Sparkles size={16} /> {loading ? '分析中...' : 'AI 分析提取'}
            </Button>
            <Button variant="ghost" onClick={handleExport} disabled={!analysis}>
              <Download size={16} /> 导出结果
            </Button>
            <Button variant="secondary" onClick={handleImportToWizard} disabled={!analysis || (analysis?.lorebookEntries.length ?? 0) === 0}>
              导入到世界书
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <Stat label="文本字数" value={totalChars} />
            <Stat label="切块数量" value={chunks.length} />
            <Stat label="人物" value={analysis?.characters.length ?? '-'} />
            <Stat label="世界书素材" value={analysis?.lorebookEntries.length ?? '-'} />
          </div>

          <div className="rounded-xl border border-slate-700/50 bg-slate-900/35 p-4 backdrop-blur-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">切块预览</h2>
            {chunks.length === 0 ? (
              <p className="text-sm text-slate-500">暂无切块。点击“智能切块”后查看章节结构。</p>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {chunks.slice(0, 20).map((chunk) => (
                  <div key={chunk.id} className="rounded-lg bg-slate-800/60 px-3 py-2 text-xs">
                    <div className="font-medium text-slate-200">#{chunk.id} {chunk.title}</div>
                    <div className="mt-1 text-slate-500">{chunk.content.length} 字</div>
                  </div>
                ))}
                {chunks.length > 20 && <div className="text-xs text-slate-500">仅显示前 20 个切块</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {analysis && (
        <div className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-900/35 p-4 backdrop-blur-sm animate-fade-in-up">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">分析结果</h2>
            <p className="mt-1 text-sm text-slate-400">{analysis.genre} · {analysis.tone}</p>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-medium text-emerald-300">摘要</h3>
            <p className="whitespace-pre-wrap rounded-lg bg-slate-800/50 p-3 text-sm text-slate-300">{analysis.summary}</p>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium text-emerald-300">人物</h3>
              <div className="space-y-2">
                {analysis.characters.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="rounded-lg border border-slate-700/40 bg-slate-800/40 p-3 text-sm">
                    <div className="font-semibold text-slate-100">{item.name} <span className="text-xs text-slate-500">{item.role}</span></div>
                    <div className="mt-1 text-slate-400">特征：{item.traits?.join('、') || '无'}</div>
                    <div className="mt-1 text-slate-500">依据：{item.evidence}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-emerald-300">时间线</h3>
              <div className="space-y-2">
                {analysis.timeline.map((item) => (
                  <div key={item.order} className="rounded-lg border border-slate-700/40 bg-slate-800/40 p-3 text-sm">
                    <div className="font-semibold text-slate-100">{item.order}. {item.event}</div>
                    <div className="mt-1 text-slate-500">影响：{item.impact}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-emerald-300">世界书素材</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {analysis.lorebookEntries.map((entry, index) => (
                <div key={`${entry.name}-${index}`} className="rounded-lg border border-slate-700/40 bg-slate-800/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-100">{entry.name}</span>
                    <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] text-emerald-300">{entry.category}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">触发词：{entry.keys?.join('、')}</div>
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-950/40 p-2 text-xs text-slate-300">{entry.content}</pre>
                </div>
              ))}
            </div>
          </section>

          {analysis.cleaningNotes.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-amber-300">清洗提示</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400">
                {analysis.cleaningNotes.map((note, index) => <li key={index}>{note}</li>)}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
