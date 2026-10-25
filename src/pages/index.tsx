import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Coder, { CoderMethots, PracticeStats } from '../Components/Coder'
import History from '../Components/History'
import { wordBanks } from '../data'
import type { PracticeRecord } from '../utils/history'
import {
    clearRecords,
    createRecord,
    loadBankKey,
    loadRecords,
    saveBankKey,
    saveRecords
} from '../utils/history'
import { formatTime } from '../utils/format'
import styles from './index.less'

type Status = 'idle' | 'running' | 'done'
type TimerState = 'idle' | 'running' | 'paused' | 'done'

function emptyStats(total: number): PracticeStats {
    return { elapsed: 0, speed: 0, accuracy: 100, typed: 0, errors: 0, done: 0, total }
}

export default function Index() {
    const initialBank = useMemo(() => {
        const saved = loadBankKey()
        return wordBanks.find(item => item.key === saved) || wordBanks[0]
    }, [])
    const [bankKey, setBankKey] = useState(initialBank.key)
    const bank = wordBanks.find(item => item.key === bankKey) || wordBanks[0]
    const [session, setSession] = useState(0)
    const [status, setStatus] = useState<Status>('idle')
    const [paused, setPaused] = useState(false)
    const [stats, setStats] = useState<PracticeStats>(() => emptyStats(initialBank.total))
    const [records, setRecords] = useState<PracticeRecord[]>(() => loadRecords())
    const [historyOpen, setHistoryOpen] = useState(false)
    const coderRef = useRef<CoderMethots>(null)
    // 记录上次写入的场次，避免同一场练习重复入库
    const recordedRef = useRef(-1)

    const handleStats = useCallback((next: PracticeStats) => setStats(next), [])

    const pushRecord = useCallback((record: PracticeRecord) => {
        setRecords(previous => {
            const next = [record, ...previous].slice(0, 60)
            saveRecords(next)
            return next
        })
    }, [])

    const handleFinish = useCallback((finalStats: PracticeStats) => {
        setStats(finalStats)
        setStatus('done')
        setPaused(false)
        if (recordedRef.current !== session) {
            recordedRef.current = session
            pushRecord(createRecord(bank.key, bank.short, finalStats, true))
        }
    }, [bank, pushRecord, session])

    const startPractice = useCallback(() => {
        if (!bank.rows.length) return
        // 中途重开也留一条记录，成绩不会被悄悄丢掉
        const current = coderRef.current?.snapshot()
        if (status === 'running' && current && current.typed > 0 && recordedRef.current !== session) {
            recordedRef.current = session
            pushRecord(createRecord(bank.key, bank.short, current, false))
        }
        setStats(emptyStats(bank.total))
        setPaused(false)
        setStatus('running')
        setSession(value => value + 1)
    }, [bank, pushRecord, session, status])

    // 换库或重开时 Coder 会重新挂载，挂载完成后再开始计时并聚焦第一题
    useEffect(() => {
        if (session > 0 && status === 'running') {
            coderRef.current?.start()
        }
    }, [session, status])

    const resumePractice = useCallback(() => {
        coderRef.current?.resume()
        setPaused(false)
    }, [])

    const togglePause = useCallback(() => {
        if (status !== 'running') return
        if (paused) {
            resumePractice()
            return
        }
        coderRef.current?.pause()
        setPaused(true)
    }, [paused, resumePractice, status])

    const openHistory = useCallback(() => {
        if (status === 'running' && !paused) {
            coderRef.current?.pause()
            setPaused(true)
        }
        setHistoryOpen(true)
    }, [paused, status])

    const closeHistory = useCallback(() => setHistoryOpen(false), [])

    const clearHistory = useCallback(() => {
        clearRecords()
        setRecords([])
    }, [])

    const skipCurrent = useCallback(() => coderRef.current?.skip(), [])

    // Esc 暂停 / 继续；记录面板打开时交给面板自己处理
    useEffect(() => {
        if (status !== 'running' || historyOpen) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.isComposing) return
            event.preventDefault()
            togglePause()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [status, historyOpen, togglePause])

    // 切到别的标签页时自动停表，回来不会把离开的时间算进成绩
    useEffect(() => {
        if (status !== 'running' || paused) return
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                coderRef.current?.pause()
                setPaused(true)
            }
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
        return () => document.removeEventListener('visibilitychange', onVisibilityChange)
    }, [status, paused])

    function selectBank(key: string) {
        if (key === bankKey) return
        const target = wordBanks.find(item => item.key === key)
        if (!target) return
        const current = coderRef.current?.snapshot()
        if (status === 'running' && current && current.typed > 0 && recordedRef.current !== session) {
            recordedRef.current = session
            pushRecord(createRecord(bank.key, bank.short, current, false))
        }
        setBankKey(key)
        saveBankKey(key)
        setSession(0)
        setStatus('idle')
        setPaused(false)
        setStats(emptyStats(target.total))
    }

    const percent = stats.total > 0 ? Math.min(100, stats.done / stats.total * 100) : 0
    const timerState: TimerState = status === 'done' ? 'done' : status === 'idle' ? 'idle' : paused ? 'paused' : 'running'
    const timerLabel = timerState === 'done' ? '本次用时' : timerState === 'paused' ? '已暂停' : '计时'
    const startLabel = status === 'idle' ? '开始练习' : status === 'running' ? '重新开始' : '再练一次'
    const hint = status === 'idle'
        ? '点击「开始练习」后开始计时；词和释义之间按一次空格。'
        : status === 'done'
            ? '这一遍完成了，成绩已记入练习记录。错字留在纸上，记忆留在心里。'
            : paused
                ? '已暂停。按 Esc 或点「继续」接着打。'
                : '依次打出「词 + 释义」，打完后自动进入下一题；打错的字会在「手迹」里标红，Esc 暂停。'

    return (<div className={styles.page}>
        <header className={styles.masthead}>
            <div className={styles.brand}>
                <span className={styles.seal} aria-hidden="true">公</span>
                <div>
                    <h1 className={styles.title}>言语字帖</h1>
                    <p className={styles.tagline}>考公成语与实词辨析，边打边记</p>
                </div>
            </div>
            <div className={styles.mastheadSide}>
                <nav className={styles.banks} aria-label="选择词库">
                    {
                        wordBanks.map(item => (
                            <button
                                key={item.key}
                                type="button"
                                className={styles.bank}
                                data-active={item.key === bankKey}
                                onClick={() => selectBank(item.key)}
                            >
                                {item.short}
                                <span className={styles.bankCount}>{item.total}</span>
                            </button>
                        ))
                    }
                </nav>
                <button
                    type="button"
                    className={styles.historyBtn}
                    onClick={openHistory}
                    aria-haspopup="dialog"
                >
                    记录
                    {records.length > 0 && <span className={styles.historyCount}>{records.length}</span>}
                </button>
            </div>
        </header>

        <main className={styles.sheet}>
            <aside className={styles.rail} aria-hidden="true">
                <span className={styles.railText}>行测 · 言语理解</span>
            </aside>

            <section className={styles.sheetMain}>
                <div className={styles.sheetHead}>
                    <div className={styles.headMain}>
                        <h2 className={styles.sheetTitle}>
                            {bank.label}
                            {status === 'done' && <span className={styles.stamp}>完成</span>}
                        </h2>
                        <p className={styles.sheetDesc}>{bank.description}</p>
                    </div>
                    <button
                        type="button"
                        className={styles.primary}
                        onClick={startPractice}
                        disabled={!bank.rows.length}
                    >
                        {startLabel}
                    </button>
                </div>

                <div className={styles.statsRow}>
                    <div className={`${styles.stat} ${styles.timerStat}`} data-state={timerState}>
                        <span className={styles.statLabel}>{timerLabel}</span>
                        <span className={styles.timerValue}>
                            {formatTime(stats.elapsed)}
                            {
                                status === 'running' && (
                                    <button
                                        type="button"
                                        className={styles.pauseBtn}
                                        onClick={togglePause}
                                        aria-label={paused ? '继续计时' : '暂停计时'}
                                    >{paused ? '继续' : '暂停'}</button>
                                )
                            }
                        </span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statLabel}>速度</span>
                        <span className={styles.statValue}>{stats.speed}<small>字/分</small></span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statLabel}>正确率</span>
                        <span className={styles.statValue}>
                            {stats.typed > 0 ? <>{stats.accuracy}<small>%</small></> : <span className={styles.dash}>—</span>}
                        </span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statLabel}>进度</span>
                        <span className={styles.statValue}>{stats.done}<small>/{stats.total}</small></span>
                    </div>
                    <div className={styles.stat}>
                        <span className={styles.statLabel}>错字</span>
                        <span className={styles.statValue} data-error={stats.errors > 0}>{stats.errors}</span>
                    </div>
                </div>

                <div className={styles.progress} aria-hidden="true">
                    <span style={{ width: `${percent}%` }} />
                </div>

                {
                    bank.rows.length > 0
                        ? <Coder
                            key={`${bank.key}-${session}`}
                            ref={coderRef}
                            rows={bank.rows}
                            paused={paused}
                            onStats={handleStats}
                            onFinish={handleFinish}
                            onResume={resumePractice}
                        />
                        : <div className={styles.empty}>
                            <p>这个词库还没有内容。</p>
                            <p>
                                把 .docx 放进 <code>src/data/kaogong/content</code>，
                                再运行 <code>npm run kaogong:word</code>，重新打开页面就能练。
                            </p>
                        </div>
                }

                <footer className={styles.sheetFoot}>
                    <span className={styles.hint}>{hint}</span>
                    {
                        status === 'running' && !paused && (
                            <button type="button" className={styles.skip} onClick={skipCurrent}>跳过本题</button>
                        )
                    }
                </footer>
            </section>
        </main>

        <History
            open={historyOpen}
            records={records}
            onClose={closeHistory}
            onClear={clearHistory}
        />
    </div>)
}
