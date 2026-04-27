import * as functions from 'firebase-functions'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ── Generate Template via Claude API ──────────────────────────
export const generateTemplate = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.set(CORS_HEADERS).status(204).send('')
      return
    }
    res.set(CORS_HEADERS)

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const { title, description, type, count, difficulty, language } = req.body

    if (!title) {
      res.status(400).json({ error: 'title is required' })
      return
    }

    const langMap: Record<string, string> = {
      'zh-TW': '繁體中文',
      'zh-CN': '简体中文',
      'en': 'English',
      'vi': 'Tiếng Việt',
    }
    const langLabel = langMap[language] || '繁體中文'

    const isSurvey = type === 'survey'

    const systemPrompt = isSurvey
      ? `你是一位專業的問卷設計師，專注於論壇與教育訓練的滿意度調查。
請根據使用者提供的活動資訊，生成一份結構完整、問法中性的滿意度調查問卷。
輸出必須為純 JSON，不要加任何說明文字。`
      : `你是一位專業的教學評量設計師，專注於知識測驗與能力評估。
請根據使用者提供的課程資訊，生成一份有明確正確答案的知識測驗題組。
輸出必須為純 JSON，不要加任何說明文字。`

    const difficultyMap: Record<string, string> = { easy: '簡單', medium: '中等', hard: '困難' }

    const userPrompt = isSurvey
      ? `請生成一份滿意度問卷，要求如下：

活動名稱：${title}
活動描述：${description || '無'}
題目數量：${count} 題
輸出語言：${langLabel}

題目類型分配：
- 量表題（scale，1-5分）：${Math.floor(count * 0.5)} 題（課程內容、講師表現、場地安排等）
- 單選題（single）：${Math.floor(count * 0.3)} 題
- 簡答題（text）：${count - Math.floor(count * 0.5) - Math.floor(count * 0.3)} 題（開放意見）

請以以下 JSON 格式輸出（不要有任何其他文字）：
{
  "title": "模板名稱",
  "questions": [
    {
      "type": "scale|single|multiple|text",
      "text": { "${language}": "題目內容" },
      "options": { "${language}": ["選項1", "選項2"] },
      "required": true
    }
  ]
}`
      : `請生成一份知識測驗題組，要求如下：

課程名稱：${title}
課程描述：${description || '無'}
題目數量：${count} 題
難度：${difficultyMap[difficulty] || '中等'}
輸出語言：${langLabel}

題目類型分配：
- 單選題（single）：${Math.floor(count * 0.7)} 題
- 多選題（multiple）：${Math.floor(count * 0.2)} 題
- 簡答題（text）：${count - Math.floor(count * 0.7) - Math.floor(count * 0.2)} 題

請以以下 JSON 格式輸出（不要有任何其他文字），每題必須有 correctAnswer 和 explanation：
{
  "title": "模板名稱",
  "questions": [
    {
      "type": "single|multiple|text",
      "text": { "${language}": "題目內容" },
      "options": { "${language}": ["A. 選項1", "B. 選項2", "C. 選項3", "D. 選項4"] },
      "correctAnswer": "0",
      "score": 10,
      "explanation": { "${language}": "解析說明" },
      "required": true
    }
  ]
}`

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const raw = message.content[0].type === 'text' ? message.content[0].text : ''

      // Extract JSON from response
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('AI 回傳格式錯誤')

      const parsed = JSON.parse(jsonMatch[0])
      res.status(200).json(parsed)
    } catch (err: any) {
      functions.logger.error('generateTemplate error', err)
      res.status(500).json({ error: err.message || 'Internal error' })
    }
  })
