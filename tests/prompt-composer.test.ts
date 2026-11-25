import { describe, expect, it } from 'vitest'
import { SkillLoader } from '../src/main/orchestrator/skill-loader'
import { PromptComposer } from '../src/main/orchestrator/prompt-composer'

describe('PromptComposer', () => {
  const loader = new SkillLoader()
  const composer = new PromptComposer(loader)

  it('composes scratch prompts for all 3 creation modes', () => {
    const longP = composer.composeFromScratch({ mode: 'long-novel', title: '长安雪', userIdea: '唐代探案' })
    expect(longP.attachedSkillIds).toContain('story-outline-architect')
    expect(longP.userDraftPrompt).toContain('Story DNA')

    const shortP = composer.composeFromScratch({ mode: 'short-webnovel', subTemplate: 'short-flash', title: '投票风波' })
    expect(shortP.attachedSkillIds).toContain('webnovel-short-studio')
    expect(shortP.userDraftPrompt).toContain('4 问脑洞压测')

    const dramaP = composer.composeFromScratch({ mode: 'drama-script', subTemplate: 'drama-shadiao', title: '沙雕逆袭' })
    expect(dramaP.attachedSkillIds).toContain('ai-drama-script-studio')
    expect(dramaP.userDraftPrompt).toContain('红果 40×')
  })

  it('composes complete-from-outline, reverse-outline, and annotation prompts', () => {
    const files = [
      {
        id: '1',
        sourcePath: 'a.docx',
        fileName: '单大纲.docx',
        ext: '.docx',
        role: 'outline' as const,
        previewText: '',
        markdownContent: '# 大纲',
        charCount: 500
      }
    ]
    const comp = composer.composeFromImport({
      mode: 'long-novel',
      intent: 'complete-from-outline',
      projectTitle: '测试作品',
      files
    })
    expect(comp.userDraftPrompt).toContain('单份大纲')
    expect(comp.userDraftPrompt).toContain('文风与声口卡')

    const rev = composer.composeFromImport({
      mode: 'long-novel',
      intent: 'reverse-outline',
      projectTitle: '测试作品',
      files
    })
    expect(rev.userDraftPrompt).toContain('逆向拆解')

    const ann = composer.composeAnnotationRevision({
      mode: 'long-novel',
      filePath: '正文/第001章.md',
      chapterText: '正文内容',
      annotations: [
        {
          id: 'a1',
          filePath: '正文/第001章.md',
          quote: '片段',
          from: 0,
          to: 2,
          category: 'style',
          author: '作者',
          body: '改成短句',
          replies: [],
          resolved: false,
          createdAt: 1
        }
      ]
    })
    expect(ann.userDraftPrompt).toContain('改成短句')
  })
})
