import { chengyu, shici, wordContent } from './kaogong'
import { buildPracticeRows } from './practice'
import type { PracticeRow } from './practice'

export type { PracticeRow, WordItem, TextSegment } from './practice'

// ===== 考公词库 =====
// 每行是一道题：词 + 空格 + 释义，词和释义都要手打
export const kaogongChengyuData = buildPracticeRows(chengyu)
export const kaogongShiciData = buildPracticeRows(shici)
export const kaogongWordData = buildPracticeRows(wordContent)
export const kaogongAllData = buildPracticeRows(chengyu.concat(shici, wordContent))

export interface WordBank {
    key: string
    label: string
    short: string
    description: string
    total: number
    rows: PracticeRow[]
}

export const wordBanks: WordBank[] = [
    {
        key: 'chengyu',
        label: '考公必会成语',
        short: '必会成语',
        description: '近五年行测考频最高的 100 个成语，释义与侧重点一并录入',
        total: kaogongChengyuData.length,
        rows: kaogongChengyuData
    },
    {
        key: 'shici',
        label: '高频实词辨析',
        short: '高频实词',
        description: '456 组易混实词，共 913 词；对照辨析，一次记清',
        total: kaogongShiciData.length,
        rows: kaogongShiciData
    },
    {
        key: 'word',
        label: 'Word 自定义词库',
        short: '自定义',
        description: '把 .docx 放进 content 目录，运行 kaogong:word 即可导入',
        total: kaogongWordData.length,
        rows: kaogongWordData
    },
    {
        key: 'all',
        label: '考公全部词库',
        short: '全部',
        description: '成语、实词与自定义词库合并练习',
        total: kaogongAllData.length,
        rows: kaogongAllData
    }
]
