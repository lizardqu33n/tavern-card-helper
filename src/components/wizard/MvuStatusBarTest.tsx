/**
 * MvuStatusBarTest - Interactive test panel for MVU status bar and regex beautification.
 *
 * Simulates how the status bar would look and behave in SillyTavern:
 *   - Live preview of the status bar with editable variable values
 *   - Raw MVU output simulation (<UpdateVariable> blocks)
 *   - Regex match/replace visualization
 *   - Variable update simulation (drag sliders, toggle booleans)
 */
import { useState, useMemo, useCallback } from 'react';
import type { MvuVariable, MvuConfig } from '../../constants/defaults';
import {
  buildStatusBarHtml,
  buildStatusBarCss,
  buildMvuLoadingBeautifyHtml,
  buildMvuDoneBeautifyHtml,
  buildAllRegexScripts,
} from '../../services/mvu-generator';
import { Button } from '../shared/Button';

interface MvuStatusBarTestProps {
  mvu: MvuConfig;
}

/** Build a test-friendly version of the status bar with actual values instead of macros */
function buildTestStatusBarHtml(variables: MvuVariable[], values: Record<string, unknown>): string {
  const displayVars = variables.filter(v => !v.hidden && !v.path.some(s => s.startsWith('$')));
  const css = buildStatusBarCss();

  const rows = displayVars.map(v => {
    const dotPath = v.path.join('.');
    const label = v.path.at(-1) ?? v.path.join('.');
    const val = values[dotPath] ?? v.defaultValue ?? '';
    const displayVal = typeof val === 'boolean' ? (val ? '✅ 是' : '❌ 否') : String(val);

    // Color coding for numbers
    let valueStyle = '';
    if (v.kind === 'number') {
      const numVal = Number(val) || 0;
      const max = v.max ?? 100;
      const min = v.min ?? 0;
      const pct = max > min ? ((numVal - min) / (max - min)) * 100 : 50;
      if (pct > 70) valueStyle = 'color: #34d399;';
      else if (pct > 30) valueStyle = 'color: #fbbf24;';
      else valueStyle = 'color: #f87171;';
    }

    return `    <div class="status-row">
      <span class="status-label">${label}</span>
      <strong class="status-value" style="${valueStyle}">${displayVal}</strong>
    </div>`;
  }).join('\n');

  return `<style>${css}</style>
<div class="mvu-status-card">
  <div class="status-header">📊 状态面板</div>
${rows}
</div>`;
}

/** Build simulated raw MVU output (what AI would output) */
function buildSimulatedMvuOutput(variables: MvuVariable[], values: Record<string, unknown>): string {
  const patches = variables
    .filter(v => !v.hidden && !v.readonly && !v.path.some(s => s.startsWith('$') || s.startsWith('_')))
    .map(v => {
      const path = '/' + v.path.join('/');
      const val = values[v.path.join('.')] ?? v.defaultValue ?? '';
      return `      { "op": "replace", "path": "${path}", "value": ${JSON.stringify(val)} }`;
    });

  return `<UpdateVariable>
<Analysis>The character's status has been updated based on the recent interaction.</Analysis>
<JSONPatch>
[
${patches.join(',\n')}
]
</JSONPatch>
</UpdateVariable>`;
}

export function MvuStatusBarTest({ mvu }: MvuStatusBarTestProps) {
  const displayVars = useMemo(
    () => mvu.variables.filter(v => !v.hidden && !v.path.some(s => s.startsWith('$'))),
    [mvu.variables],
  );

  // Editable variable values
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const v of mvu.variables) {
      init[v.path.join('.')] = v.defaultValue ?? (v.kind === 'number' ? 0 : v.kind === 'boolean' ? false : '');
    }
    return init;
  });

  const [showRawOutput, setShowRawOutput] = useState(false);
  const [showRegexTest, setShowRegexTest] = useState(false);
  const [showBeautifyPreview, setShowBeautifyPreview] = useState(false);

  const updateValue = useCallback((path: string, value: unknown) => {
    setValues(prev => ({ ...prev, [path]: value }));
  }, []);

  // Generate test HTML
  const testHtml = useMemo(() => buildTestStatusBarHtml(mvu.variables, values), [mvu.variables, values]);
  const rawOutput = useMemo(() => buildSimulatedMvuOutput(mvu.variables, values), [mvu.variables, values]);
  const beautifyLoading = useMemo(() => buildMvuLoadingBeautifyHtml(), []);
  const beautifyDone = useMemo(() => buildMvuDoneBeautifyHtml(), []);
  const regexScripts = useMemo(() => buildAllRegexScripts(mvu), [mvu]);

  // Test regex matching
  const regexTestResult = useMemo(() => {
    const results: Array<{ name: string; regex: string; matched: boolean; matchPreview: string }> = [];
    for (const script of regexScripts) {
      try {
        const re = new RegExp(script.findRegex, 'g');
        const match = re.exec(rawOutput);
        results.push({
          name: script.scriptName,
          regex: script.findRegex,
          matched: !!match,
          matchPreview: match ? match[0].slice(0, 120) + (match[0].length > 120 ? '...' : '') : '(无匹配)',
        });
      } catch {
        results.push({
          name: script.scriptName,
          regex: script.findRegex,
          matched: false,
          matchPreview: '(正则语法错误)',
        });
      }
    }
    return results;
  }, [regexScripts, rawOutput]);

  if (!mvu.enabled || mvu.variables.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
        <p className="text-sm text-slate-500 italic">请先启用 MVU 并添加变量后再测试。</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cyan-700/50 bg-slate-800/50 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-lg">🧪</span>
        <h3 className="text-sm font-semibold text-cyan-300">MVU 状态栏测试</h3>
        <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-800/40 text-cyan-300">模拟器</span>
      </div>

      {/* ── Variable value editors ─────────────────────────────────────── */}
      <div>
        <p className="text-xs text-slate-400 mb-2">调整变量值，实时预览状态栏效果：</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {displayVars.map(v => {
            const dotPath = v.path.join('.');
            const label = v.path.at(-1) ?? dotPath;
            const val = values[dotPath] ?? '';

            return (
              <div key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-900/50 border border-slate-700/50">
                <span className="text-xs text-slate-400 w-20 truncate shrink-0" title={dotPath}>{label}</span>
                {v.kind === 'number' ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="range"
                      min={v.min ?? 0}
                      max={v.max ?? 100}
                      step={1}
                      value={Number(val) || 0}
                      onChange={(e) => updateValue(dotPath, Number(e.target.value))}
                      className="flex-1 accent-cyan-500 h-1.5"
                    />
                    <span className="text-xs text-cyan-300 w-8 text-right font-mono">{String(val)}</span>
                  </div>
                ) : v.kind === 'boolean' ? (
                  <button
                    onClick={() => updateValue(dotPath, !val)}
                    className={`text-xs px-2 py-0.5 rounded ${val ? 'bg-emerald-800/40 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}
                  >
                    {val ? '✅ 是' : '❌ 否'}
                  </button>
                ) : v.kind === 'enum' && v.enumValues?.length ? (
                  <select
                    value={String(val)}
                    onChange={(e) => updateValue(dotPath, e.target.value)}
                    className="text-xs bg-slate-700 text-slate-300 border border-slate-600 rounded px-1.5 py-0.5 flex-1"
                  >
                    {v.enumValues.map(ev => (
                      <option key={ev} value={ev}>{ev}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={String(val)}
                    onChange={(e) => updateValue(dotPath, e.target.value)}
                    className="text-xs bg-slate-700 text-slate-300 border border-slate-600 rounded px-1.5 py-0.5 flex-1"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Live status bar preview ────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-400">状态栏实时预览：</p>
          <span className="text-[10px] text-slate-600">模拟 SillyTavern 渲染效果</span>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-4">
          <div
            dangerouslySetInnerHTML={{ __html: testHtml }}
            className="mvu-test-container"
          />
        </div>
      </div>

      {/* ── Raw MVU output toggle ──────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setShowRawOutput(!showRawOutput)}
          className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
        >
          <span className={`transition-transform ${showRawOutput ? 'rotate-90' : ''}`}>▶</span>
          查看 AI 原始输出 (UpdateVariable)
        </button>
        {showRawOutput && (
          <div className="mt-2 rounded-lg border border-slate-700 bg-slate-950/80 p-3">
            <p className="text-[10px] text-slate-500 mb-1">↓ 这是 AI 回复中会包含的原始变量更新块：</p>
            <pre className="text-xs text-amber-300/80 font-mono whitespace-pre-wrap overflow-x-auto">{rawOutput}</pre>
          </div>
        )}
      </div>

      {/* ── Regex test toggle ──────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setShowRegexTest(!showRegexTest)}
          className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
        >
          <span className={`transition-transform ${showRegexTest ? 'rotate-90' : ''}`}>▶</span>
          正则匹配测试 ({regexScripts.length} 条规则)
        </button>
        {showRegexTest && (
          <div className="mt-2 space-y-2">
            {regexTestResult.length === 0 ? (
              <p className="text-xs text-slate-500 italic">无正则脚本（需启用 MVU 和状态栏）</p>
            ) : (
              regexTestResult.map((r, i) => (
                <div key={i} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${r.matched ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.matched ? '✅ 匹配成功' : '❌ 未匹配'}
                    </span>
                    <span className="text-xs text-slate-300">{r.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono break-all">
                    <span className="text-slate-400">findRegex: </span>{r.regex}
                  </div>
                  <div className="text-[10px] font-mono break-all">
                    <span className="text-slate-400">匹配结果: </span>
                    <span className={r.matched ? 'text-emerald-400/80' : 'text-slate-600'}>{r.matchPreview}</span>
                  </div>
                </div>
              ))
            )}
            <p className="text-[10px] text-slate-500">
              💡 正则脚本会嵌入角色卡的 <code className="text-cyan-400">extensions.regex_scripts</code> 中，
              导入 SillyTavern 后由正则扩展自动匹配并替换为美化 HTML。
            </p>
          </div>
        )}
      </div>

      {/* ── Beautification preview toggle ──────────────────────────────── */}
      <div>
        <button
          onClick={() => setShowBeautifyPreview(!showBeautifyPreview)}
          className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
        >
          <span className={`transition-transform ${showBeautifyPreview ? 'rotate-90' : ''}`}>▶</span>
          美化效果预览（变量更新面板）
        </button>
        {showBeautifyPreview && (
          <div className="mt-2 space-y-3">
            <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-4">
              <p className="text-[10px] text-slate-500 mb-2">↓ 变量更新中（shimmer 加载态）：</p>
              <div dangerouslySetInnerHTML={{ __html: beautifyLoading }} />
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-4">
              <p className="text-[10px] text-slate-500 mb-2">↓ 变量更新完成（可折叠面板）：</p>
              <div dangerouslySetInnerHTML={{ __html: beautifyDone }} />
            </div>
            <p className="text-[10px] text-slate-500">
              💡 在 SillyTavern 中，当 AI 输出 <code className="text-amber-400">&lt;UpdateVariable&gt;</code> 块时，
              正则脚本会自动将其替换为以上美化面板。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
