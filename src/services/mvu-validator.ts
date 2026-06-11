/**
 * MVU Validator & Fixer — detects and auto-corrects common MVU configuration issues.
 *
 * Two layers:
 *   1. Deterministic checks (pure logic, no AI)
 *   2. AI-powered semantic checks (optional, uses LLM)
 *
 * Issue severity:
 *   - error:   Must fix, will cause runtime failure
 *   - warning: Should fix, may cause unexpected behavior
 *   - info:    Suggestion for improvement
 */
import type { MvuConfig, MvuVariable, MvuVariableKind } from '../constants/defaults';
import { generateId } from '../constants/defaults';

// ── Issue types ──────────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface MvuIssue {
  id: string;
  severity: IssueSeverity;
  category: string;
  variableId?: string;       // which variable is affected (if any)
  message: string;           // human-readable description
  fixLabel?: string;         // label for the fix button
  autoFixable: boolean;       // can be auto-fixed without AI
}

export interface MvuFixResult {
  issues: MvuIssue[];
  fixedCount: number;
  fixed: MvuIssue[];         // issues that were auto-fixed
  remaining: MvuIssue[];     // issues that still need manual or AI fix
}

// ── Deterministic validation ─────────────────────────────────────────────

/**
 * Run all deterministic checks on the MVU config.
 * Returns a list of issues found.
 */
export function validateMvuConfig(config: MvuConfig): MvuIssue[] {
  const issues: MvuIssue[] = [];

  if (!config.enabled || config.variables.length === 0) return issues;

  // 1. Duplicate path check
  const pathSet = new Map<string, string>(); // path -> first variable id
  for (const v of config.variables) {
    const dotPath = v.path.join('.');
    if (pathSet.has(dotPath)) {
      issues.push({
        id: generateId(),
        severity: 'error',
        category: '路径冲突',
        variableId: v.id,
        message: `变量路径 "${dotPath}" 与另一个变量重复`,
        fixLabel: '删除重复项',
        autoFixable: true,
      });
    } else {
      pathSet.set(dotPath, v.id);
    }
  }

  // 2. Path segment validation
  for (const v of config.variables) {
    // Empty path
    if (v.path.length === 0) {
      issues.push({
        id: generateId(),
        severity: 'error',
        category: '路径错误',
        variableId: v.id,
        message: '变量路径不能为空',
        fixLabel: '设为 "未命名"',
        autoFixable: true,
      });
      continue;
    }

    // Empty segments
    const emptySegs = v.path.filter(s => !s.trim());
    if (emptySegs.length > 0) {
      issues.push({
        id: generateId(),
        severity: 'error',
        category: '路径错误',
        variableId: v.id,
        message: `路径含空段: [${v.path.map(s => `"${s}"`).join(', ')}]`,
        fixLabel: '移除空段',
        autoFixable: true,
      });
    }

    // Special characters in path segments (excluding _ and $ prefixes)
    for (const seg of v.path) {
      if (seg && /[./\\[\]{}()@#&*!?<>|"'`~^]/.test(seg.replace(/^[_$]/, ''))) {
        issues.push({
          id: generateId(),
          severity: 'warning',
          category: '路径命名',
          variableId: v.id,
          message: `路径段 "${seg}" 含特殊字符，可能导致解析问题`,
          fixLabel: '清理字符',
          autoFixable: true,
        });
        break; // one warning per variable
      }
    }

    // Path too deep (>5 levels)
    if (v.path.length > 5) {
      issues.push({
        id: generateId(),
        severity: 'info',
        category: '路径深度',
        variableId: v.id,
        message: `路径深度 ${v.path.length} 层，建议不超过 5 层`,
        autoFixable: false,
      });
    }
  }

  // 3. Type mismatch: default value vs kind
  for (const v of config.variables) {
    const dv = v.defaultValue;
    switch (v.kind) {
      case 'number':
        if (dv !== undefined && dv !== null && typeof dv !== 'number') {
          issues.push({
            id: generateId(),
            severity: 'error',
            category: '类型不匹配',
            variableId: v.id,
            message: `"${v.path.join('.')}" 类型为 number，但默认值是 ${typeof dv}: ${JSON.stringify(dv)}`,
            fixLabel: '设为 0',
            autoFixable: true,
          });
        }
        if (v.min !== undefined && v.max !== undefined && v.min > v.max) {
          issues.push({
            id: generateId(),
            severity: 'error',
            category: '范围错误',
            variableId: v.id,
            message: `"${v.path.join('.')}" 最小值 ${v.min} > 最大值 ${v.max}`,
            fixLabel: '交换 min/max',
            autoFixable: true,
          });
        }
        if (typeof dv === 'number' && v.min !== undefined && dv < v.min) {
          issues.push({
            id: generateId(),
            severity: 'warning',
            category: '默认值越界',
            variableId: v.id,
            message: `"${v.path.join('.')}" 默认值 ${dv} < 最小值 ${v.min}`,
            fixLabel: `设为 ${v.min}`,
            autoFixable: true,
          });
        }
        if (typeof dv === 'number' && v.max !== undefined && dv > v.max) {
          issues.push({
            id: generateId(),
            severity: 'warning',
            category: '默认值越界',
            variableId: v.id,
            message: `"${v.path.join('.')}" 默认值 ${dv} > 最大值 ${v.max}`,
            fixLabel: `设为 ${v.max}`,
            autoFixable: true,
          });
        }
        break;

      case 'boolean':
        if (dv !== undefined && dv !== null && typeof dv !== 'boolean') {
          issues.push({
            id: generateId(),
            severity: 'error',
            category: '类型不匹配',
            variableId: v.id,
            message: `"${v.path.join('.')}" 类型为 boolean，但默认值是 ${typeof dv}: ${JSON.stringify(dv)}`,
            fixLabel: '设为 false',
            autoFixable: true,
          });
        }
        break;

      case 'enum':
        if (!v.enumValues || v.enumValues.length === 0) {
          issues.push({
            id: generateId(),
            severity: 'error',
            category: '枚举缺失',
            variableId: v.id,
            message: `"${v.path.join('.')}" 类型为 enum 但未定义枚举值`,
            fixLabel: '添加默认枚举值',
            autoFixable: true,
          });
        } else if (dv !== undefined && dv !== null && dv !== '' && !v.enumValues.includes(String(dv))) {
          issues.push({
            id: generateId(),
            severity: 'warning',
            category: '枚举值无效',
            variableId: v.id,
            message: `"${v.path.join('.')}" 默认值 "${dv}" 不在枚举列表中`,
            fixLabel: `设为 "${v.enumValues[0]}"`,
            autoFixable: true,
          });
        }
        break;
    }
  }

  // 4. Missing description
  const noDescVars = config.variables.filter(v => !v.description.trim() && !v.hidden);
  if (noDescVars.length > 0) {
    issues.push({
      id: generateId(),
      severity: 'info',
      category: '缺少说明',
      message: `${noDescVars.length} 个变量缺少描述（不影响功能，但建议填写）`,
      autoFixable: false,
    });
  }

  // 5. Hidden/readonly prefix consistency
  for (const v of config.variables) {
    const lastSeg = v.path.at(-1) ?? '';
    if (lastSeg.startsWith('$') && !v.hidden) {
      issues.push({
        id: generateId(),
        severity: 'warning',
        category: '前缀不一致',
        variableId: v.id,
        message: `"${lastSeg}" 以 $ 开头但未标记为隐藏`,
        fixLabel: '标记为隐藏',
        autoFixable: true,
      });
    }
    if (lastSeg.startsWith('_') && !v.readonly) {
      issues.push({
        id: generateId(),
        severity: 'warning',
        category: '前缀不一致',
        variableId: v.id,
        message: `"${lastSeg}" 以 _ 开头但未标记为只读`,
        fixLabel: '标记为只读',
        autoFixable: true,
      });
    }
  }

  // 6. Status bar checks
  if (config.statusBarEnabled) {
    // Check HTML for unclosed tags
    const html = config.statusBarHtml || '';
    const openDivs = (html.match(/<div[\s>]/g) || []).length;
    const closeDivs = (html.match(/<\/div>/g) || []).length;
    if (openDivs !== closeDivs) {
      issues.push({
        id: generateId(),
        severity: 'error',
        category: 'HTML 错误',
        message: `状态栏 HTML 中 <div> 标签数量不匹配 (${openDivs} 开 / ${closeDivs} 闭)`,
        fixLabel: '重新生成',
        autoFixable: false,
      });
    }

    // Check CSS for common issues
    const css = config.statusBarCss || '';
    if (css.includes('{') && !css.includes('}')) {
      issues.push({
        id: generateId(),
        severity: 'error',
        category: 'CSS 错误',
        message: '状态栏 CSS 中花括号未闭合',
        fixLabel: '重新生成',
        autoFixable: false,
      });
    }

    // Check if status bar references undefined variables
    if (config.statusBarMode === 'safe_macro') {
      const macroRefs = html.match(/\{\{format_message_variable::([^}]+)\}\}/g) || [];
      for (const ref of macroRefs) {
        const path = ref.replace('{{format_message_variable::', '').replace('}}', '');
        // Remove stat_data prefix
        const varPath = path.replace(/^stat_data\./, '');
        const exists = config.variables.some(v => v.path.join('.') === varPath);
        if (!exists) {
          issues.push({
            id: generateId(),
            severity: 'warning',
            category: '状态栏引用',
            message: `状态栏引用了不存在的变量: "${varPath}"`,
            autoFixable: false,
          });
        }
      }
    }

    // Empty status bar
    if (!html.trim()) {
      issues.push({
        id: generateId(),
        severity: 'warning',
        category: '状态栏为空',
        message: '状态栏已启用但 HTML 内容为空，请点击"生成预览"',
        fixLabel: '生成预览',
        autoFixable: false,
      });
    }
  }

  // 7. Story beautification checks
  if (config.storyBeautifyEnabled) {
    if (!config.storyBeautifyTag.trim()) {
      issues.push({
        id: generateId(),
        severity: 'error',
        category: '正文美化',
        message: '正文美化已启用但未填写标签名',
        fixLabel: '设为 "story_view"',
        autoFixable: true,
      });
    }
    if (config.storyBeautifyTag && /\s/.test(config.storyBeautifyTag)) {
      issues.push({
        id: generateId(),
        severity: 'error',
        category: '正文美化',
        message: `标签名 "${config.storyBeautifyTag}" 含空格，HTML 标签不能有空格`,
        fixLabel: '移除空格',
        autoFixable: true,
      });
    }
  }

  return issues;
}

// ── Auto-fix ─────────────────────────────────────────────────────────────

/**
 * Apply all auto-fixable corrections to the MVU config.
 * Returns the corrected config and a report of what was fixed.
 */
export function autoFixMvuConfig(config: MvuConfig): { config: MvuConfig; fixed: MvuIssue[]; remaining: MvuIssue[] } {
  const issues = validateMvuConfig(config);
  const autoFixable = issues.filter(i => i.autoFixable);
  const remaining = issues.filter(i => !i.autoFixable);
  const fixed: MvuIssue[] = [];

  if (autoFixable.length === 0) return { config, fixed, remaining };

  // Deep clone variables to avoid mutation
  let vars = config.variables.map(v => ({ ...v, path: [...v.path] }));

  for (const issue of autoFixable) {
    const vid = issue.variableId;
    const vIdx = vid ? vars.findIndex(v => v.id === vid) : -1;

    switch (issue.category) {
      case '路径冲突': {
        // Remove the duplicate (keep the first one)
        if (vIdx >= 0) {
          vars = vars.filter(v => v.id !== vid);
          fixed.push(issue);
        }
        break;
      }
      case '路径错误': {
        if (vIdx >= 0) {
          if (issue.message.includes('不能为空')) {
            vars[vIdx].path = ['未命名'];
          } else {
            vars[vIdx].path = vars[vIdx].path.filter(s => s.trim());
          }
          fixed.push(issue);
        }
        break;
      }
      case '路径命名': {
        if (vIdx >= 0) {
          vars[vIdx].path = vars[vIdx].path.map(s =>
            s.replace(/[./\\[\]{}()@#&*!?<>|"'`~^]/g, '').trim() || s
          );
          fixed.push(issue);
        }
        break;
      }
      case '类型不匹配': {
        if (vIdx >= 0) {
          const v = vars[vIdx];
          if (v.kind === 'number') v.defaultValue = 0;
          else if (v.kind === 'boolean') v.defaultValue = false;
          else v.defaultValue = '';
          fixed.push(issue);
        }
        break;
      }
      case '范围错误': {
        if (vIdx >= 0) {
          const v = vars[vIdx];
          if (v.min !== undefined && v.max !== undefined) {
            [v.min, v.max] = [v.max, v.min]; // swap
          }
          fixed.push(issue);
        }
        break;
      }
      case '默认值越界': {
        if (vIdx >= 0) {
          const v = vars[vIdx];
          if (issue.message.includes('< 最小值') && v.min !== undefined) v.defaultValue = v.min;
          else if (issue.message.includes('> 最大值') && v.max !== undefined) v.defaultValue = v.max;
          fixed.push(issue);
        }
        break;
      }
      case '枚举缺失': {
        if (vIdx >= 0) {
          vars[vIdx].enumValues = ['选项A', '选项B'];
          if (!vars[vIdx].defaultValue) vars[vIdx].defaultValue = '选项A';
          fixed.push(issue);
        }
        break;
      }
      case '枚举值无效': {
        if (vIdx >= 0 && vars[vIdx].enumValues?.length) {
          vars[vIdx].defaultValue = vars[vIdx].enumValues![0];
          fixed.push(issue);
        }
        break;
      }
      case '前缀不一致': {
        if (vIdx >= 0) {
          if (issue.message.includes('$ 开头')) vars[vIdx].hidden = true;
          else if (issue.message.includes('_ 开头')) vars[vIdx].readonly = true;
          fixed.push(issue);
        }
        break;
      }
      case '正文美化': {
        if (issue.message.includes('未填写标签名')) {
          config = { ...config, storyBeautifyTag: 'story_view' };
          fixed.push(issue);
        } else if (issue.message.includes('含空格')) {
          config = { ...config, storyBeautifyTag: config.storyBeautifyTag.replace(/\s+/g, '_') };
          fixed.push(issue);
        }
        break;
      }
    }
  }

  return {
    config: { ...config, variables: vars },
    fixed,
    remaining,
  };
}

/**
 * Get a human-readable summary of validation results.
 */
export function summarizeIssues(issues: MvuIssue[]): string {
  if (issues.length === 0) return '✅ 未发现任何问题';
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const infos = issues.filter(i => i.severity === 'info').length;
  const fixable = issues.filter(i => i.autoFixable).length;
  const parts: string[] = [];
  if (errors) parts.push(`${errors} 个错误`);
  if (warnings) parts.push(`${warnings} 个警告`);
  if (infos) parts.push(`${infos} 个建议`);
  if (fixable) parts.push(`(${fixable} 个可自动修复)`);
  return `发现 ${parts.join('，')}`;
}

/**
 * Fix a single issue and return the updated config.
 */
export function fixSingleIssue(config: MvuConfig, issue: MvuIssue): MvuConfig {
  if (!issue.autoFixable) return config;
  const vars = config.variables.map(v => ({ ...v, path: [...v.path] }));
  const vid = issue.variableId;
  const vIdx = vid ? vars.findIndex(v => v.id === vid) : -1;

  let newConfig = { ...config };

  switch (issue.category) {
    case '路径冲突':
      if (vIdx >= 0) newConfig.variables = vars.filter(v => v.id !== vid);
      break;
    case '路径错误':
      if (vIdx >= 0) {
        if (issue.message.includes('不能为空')) vars[vIdx].path = ['未命名'];
        else vars[vIdx].path = vars[vIdx].path.filter(s => s.trim());
        newConfig.variables = vars;
      }
      break;
    case '路径命名':
      if (vIdx >= 0) {
        vars[vIdx].path = vars[vIdx].path.map(s =>
          s.replace(/[./\\[\]{}()@#&*!?<>|"'`~^]/g, '').trim() || s
        );
        newConfig.variables = vars;
      }
      break;
    case '类型不匹配':
      if (vIdx >= 0) {
        const v = vars[vIdx];
        if (v.kind === 'number') v.defaultValue = 0;
        else if (v.kind === 'boolean') v.defaultValue = false;
        else v.defaultValue = '';
        newConfig.variables = vars;
      }
      break;
    case '范围错误':
      if (vIdx >= 0) {
        const v = vars[vIdx];
        if (v.min !== undefined && v.max !== undefined) [v.min, v.max] = [v.max, v.min];
        newConfig.variables = vars;
      }
      break;
    case '默认值越界':
      if (vIdx >= 0) {
        const v = vars[vIdx];
        if (issue.message.includes('< 最小值') && v.min !== undefined) v.defaultValue = v.min;
        else if (issue.message.includes('> 最大值') && v.max !== undefined) v.defaultValue = v.max;
        newConfig.variables = vars;
      }
      break;
    case '枚举缺失':
      if (vIdx >= 0) {
        vars[vIdx].enumValues = ['选项A', '选项B'];
        if (!vars[vIdx].defaultValue) vars[vIdx].defaultValue = '选项A';
        newConfig.variables = vars;
      }
      break;
    case '枚举值无效':
      if (vIdx >= 0 && vars[vIdx].enumValues?.length) {
        vars[vIdx].defaultValue = vars[vIdx].enumValues![0];
        newConfig.variables = vars;
      }
      break;
    case '前缀不一致':
      if (vIdx >= 0) {
        if (issue.message.includes('$ 开头')) vars[vIdx].hidden = true;
        else if (issue.message.includes('_ 开头')) vars[vIdx].readonly = true;
        newConfig.variables = vars;
      }
      break;
    case '正文美化':
      if (issue.message.includes('未填写标签名')) {
        newConfig.storyBeautifyTag = 'story_view';
      } else if (issue.message.includes('含空格')) {
        newConfig.storyBeautifyTag = newConfig.storyBeautifyTag.replace(/\s+/g, '_');
      }
      break;
    case '状态栏为空':
      // Can't auto-fix, needs regeneration
      break;
  }

  return newConfig;
}

/**
 * Apply a single AI correction to the config.
 * Handles rename, change_type, add_range, add_variable, remove_variable, update_default, improve_description.
 */
export function applyAiCorrection(
  config: MvuConfig,
  correction: { path: string; action: string; suggestion: Record<string, unknown> },
): MvuConfig {
  const vars = config.variables.map(v => ({ ...v, path: [...v.path] }));
  const vIdx = vars.findIndex(v => v.path.join('.') === correction.path);

  switch (correction.action) {
    case 'rename': {
      if (vIdx >= 0 && correction.suggestion.path) {
        const newPath = String(correction.suggestion.path).split('.').filter(Boolean);
        if (newPath.length > 0) vars[vIdx].path = newPath;
      }
      break;
    }
    case 'change_type': {
      if (vIdx >= 0 && correction.suggestion.kind) {
        const newKind = correction.suggestion.kind as MvuVariableKind;
        vars[vIdx].kind = newKind;
        if (correction.suggestion.defaultValue !== undefined) {
          vars[vIdx].defaultValue = correction.suggestion.defaultValue;
        } else {
          vars[vIdx].defaultValue = newKind === 'number' ? 0 : newKind === 'boolean' ? false : '';
        }
        if (correction.suggestion.enumValues) {
          vars[vIdx].enumValues = correction.suggestion.enumValues as string[];
        }
      }
      break;
    }
    case 'add_range': {
      if (vIdx >= 0) {
        if (correction.suggestion.min !== undefined) vars[vIdx].min = Number(correction.suggestion.min);
        if (correction.suggestion.max !== undefined) vars[vIdx].max = Number(correction.suggestion.max);
      }
      break;
    }
    case 'add_variable': {
      const newVar: MvuVariable = {
        id: generateId(),
        path: String(correction.suggestion.path || correction.path).split('.').filter(Boolean),
        kind: (correction.suggestion.kind as MvuVariableKind) || 'number',
        defaultValue: correction.suggestion.defaultValue ?? 0,
        description: String(correction.suggestion.description || ''),
        enumValues: correction.suggestion.enumValues as string[] | undefined,
        min: correction.suggestion.min as number | undefined,
        max: correction.suggestion.max as number | undefined,
      };
      vars.push(newVar);
      break;
    }
    case 'remove_variable': {
      if (vIdx >= 0) vars.splice(vIdx, 1);
      break;
    }
    case 'update_default': {
      if (vIdx >= 0 && correction.suggestion.defaultValue !== undefined) {
        vars[vIdx].defaultValue = correction.suggestion.defaultValue;
      }
      break;
    }
    case 'improve_description': {
      if (vIdx >= 0 && correction.suggestion.description) {
        vars[vIdx].description = String(correction.suggestion.description);
      }
      break;
    }
  }

  return { ...config, variables: vars };
}

/**
 * Group issues by category for organized display.
 */
export function groupIssuesByCategory(issues: MvuIssue[]): Array<{ category: string; issues: MvuIssue[] }> {
  const map = new Map<string, MvuIssue[]>();
  for (const issue of issues) {
    const list = map.get(issue.category) || [];
    list.push(issue);
    map.set(issue.category, list);
  }
  // Sort: errors first, then warnings, then info
  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
  return Array.from(map.entries())
    .map(([category, catIssues]) => ({
      category,
      issues: catIssues.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)),
    }))
    .sort((a, b) => {
      const aMax = Math.min(...a.issues.map(i => severityOrder[i.severity] ?? 9));
      const bMax = Math.min(...b.issues.map(i => severityOrder[i.severity] ?? 9));
      return aMax - bMax;
    });
}
