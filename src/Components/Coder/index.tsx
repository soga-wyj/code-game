import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import Row, { RowRefMethods } from '../Row'
import type { PracticeRow } from '../../data'
import styles from './index.less'

export interface PracticeStats {
    elapsed: number
    speed: number
    accuracy: number
    typed: number
    errors: number
    done: number
    total: number
}

export interface CoderProps {
    rows: PracticeRow[]
    paused: boolean
    onStats: (stats: PracticeStats) => void
    onFinish: (stats: PracticeStats) => void
    onResume: () => void
}

export interface CoderMethots {
    start: () => void
    pause: () => void
    resume: () => void
    skip: () => void
    snapshot: () => PracticeStats
}

interface RowRecord {
    typed: number
    errors: number
}

function Coder(props: CoderProps, ref: React.Ref<CoderMethots>) {
    const { rows, paused, onStats, onFinish, onResume } = props
    const viewportRef = useRef<HTMLDivElement>(null)
    const recordsRef = useRef(new Map<number, RowRecord>())
    const activeIndexRef = useRef(-1)
    const startAtRef = useRef(0) // 当前计时段的起点
    const elapsedRef = useRef(0) // 暂停前已经累计的秒数
    const runningRef = useRef(false)
    const pausedRef = useRef(false)
    const finishedRef = useRef(false)
    const [running, setRunning] = useState(false)

    const rowRefs = useMemo(
        () => rows.map(() => React.createRef<RowRefMethods>()),
        [rows]
    )

    // 计时 = 已累计时长 + 当前计时段，暂停后不再增长
    const elapsedNow = useCallback(() => (
        runningRef.current
            ? elapsedRef.current + (Date.now() - startAtRef.current) / 1000
            : elapsedRef.current
    ), [])

    const computeStats = useCallback((elapsedSeconds?: number) => {
        let typed = 0
        let errors = 0
        let done = 0
        recordsRef.current.forEach((record, index) => {
            typed += record.typed
            errors += record.errors
            if (record.typed >= (rows[index]?.target.length || 0)) done++
        })
        const elapsed = elapsedSeconds != null ? elapsedSeconds : elapsedNow()
        return {
            elapsed,
            speed: elapsed > 0 ? Math.round(typed / elapsed * 60) : 0,
            accuracy: typed > 0 ? Math.round((1 - errors / typed) * 100) : 100,
            typed,
            errors,
            done,
            total: rows.length
        }
    }, [rows, elapsedNow])

    const finish = useCallback(() => {
        if (finishedRef.current) return
        finishedRef.current = true
        const elapsed = elapsedNow()
        elapsedRef.current = elapsed
        runningRef.current = false
        pausedRef.current = false
        setRunning(false)
        const finalStats = computeStats(elapsed)
        onStats(finalStats)
        onFinish(finalStats)
    }, [computeStats, elapsedNow, onFinish, onStats])

    const scrollToRow = useCallback((index: number, smooth = true) => {
        const viewport = viewportRef.current
        if (!viewport) return
        const rowEl = viewport.querySelector(`[data-row="${index}"]`) as HTMLElement | null
        if (!rowEl) return
        // 当前行放在偏上的位置，下方留出空间给输入法候选窗和软键盘
        const top = rowEl.offsetTop - viewport.clientHeight * 0.26
        viewport.scrollTo({
            top: Math.max(0, top),
            behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto'
        })
    }, [])

    const activate = useCallback((index: number) => {
        const rowRef = rowRefs[index]
        if (!rowRef) return
        activeIndexRef.current = index
        rowRef.current?.setIsRead(false)
        // 等 readOnly 状态落到 DOM 之后再聚焦，避免输入被只读状态挡掉
        window.setTimeout(() => {
            rowRef.current?.focus()
            scrollToRow(index)
        }, 0)
    }, [rowRefs, scrollToRow])

    const next = useCallback((index: number) => {
        rowRefs[index]?.current?.setIsRead(true)
        const nextIndex = index + 1
        if (nextIndex >= rows.length) {
            finish()
            return
        }
        activate(nextIndex)
    }, [activate, finish, rowRefs, rows.length])

    const prev = useCallback((index: number) => {
        rowRefs[index]?.current?.setIsRead(true)
        const prevIndex = index - 1
        if (prevIndex < 0) { // 第一题退无可退，保持可输入
            rowRefs[index]?.current?.setIsRead(false)
            rowRefs[index]?.current?.focus()
            return
        }
        activate(prevIndex)
    }, [activate, rowRefs])

    const handlers = useMemo(
        () => rows.map((_, index) => ({
            next: () => next(index),
            prev: () => prev(index)
        })),
        [next, prev, rows]
    )

    const report = useCallback((index: number, typedLength: number, errorCount: number) => {
        recordsRef.current.set(index, { typed: typedLength, errors: errorCount })
    }, [])

    const focusActive = useCallback(() => {
        if (!runningRef.current || pausedRef.current) return
        rowRefs[activeIndexRef.current]?.current?.focus()
    }, [rowRefs])

    const start = useCallback(() => {
        if (runningRef.current || rows.length === 0) return
        recordsRef.current.clear()
        elapsedRef.current = 0
        startAtRef.current = Date.now()
        runningRef.current = true
        pausedRef.current = false
        finishedRef.current = false
        setRunning(true)
        activate(0)
        onStats(computeStats())
    }, [activate, computeStats, onStats, rows.length])

    const pause = useCallback(() => {
        if (!runningRef.current || pausedRef.current) return
        elapsedRef.current = elapsedNow()
        runningRef.current = false
        pausedRef.current = true
        setRunning(false)
        const rowRef = rowRefs[activeIndexRef.current]
        rowRef?.current?.setIsRead(true)
        rowRef?.current?.blur()
        onStats(computeStats())
    }, [computeStats, elapsedNow, onStats, rowRefs])

    const resume = useCallback(() => {
        if (runningRef.current || !pausedRef.current || finishedRef.current) return
        pausedRef.current = false
        runningRef.current = true
        startAtRef.current = Date.now()
        setRunning(true)
        activate(activeIndexRef.current)
        onStats(computeStats())
    }, [activate, computeStats, onStats])

    const skip = useCallback(() => {
        if (!runningRef.current || pausedRef.current) return
        const index = activeIndexRef.current
        if (index < 0) return
        // 跳过的题不计入本次统计
        recordsRef.current.delete(index)
        next(index)
    }, [next])

    const snapshot = useCallback(() => computeStats(), [computeStats])

    useImperativeHandle(ref, () => ({ start, pause, resume, skip, snapshot }), [start, pause, resume, skip, snapshot])

    useEffect(() => {
        if (!running) return
        const tick = () => onStats(computeStats())
        tick()
        const timer = window.setInterval(tick, 500)
        return () => window.clearInterval(timer)
    }, [running, computeStats, onStats])

    // 软键盘弹出 / 收起时重新对齐当前行，避免被键盘挡住
    useEffect(() => {
        const visualViewport = window.visualViewport
        if (!visualViewport) return
        const onResize = () => {
            if (!runningRef.current || pausedRef.current) return
            scrollToRow(activeIndexRef.current, false)
        }
        visualViewport.addEventListener('resize', onResize)
        return () => visualViewport.removeEventListener('resize', onResize)
    }, [scrollToRow])

    return (<div className={styles.root}>
        <div className={styles.viewport} ref={viewportRef} onClick={focusActive}>
            <ul className={styles.list}>
                {
                    rows.map((row, index) => (
                        <Row
                            key={row.index}
                            ref={rowRefs[index]}
                            row={row}
                            next={handlers[index].next}
                            prev={handlers[index].prev}
                            report={report}
                        />
                    ))
                }
            </ul>
        </div>

        {
            paused && (
                <div className={styles.paused}>
                    <p className={styles.pausedTitle}>已暂停</p>
                    <p className={styles.pausedHint}>按 Esc 或点下方按钮继续计时</p>
                    <button type="button" className={styles.resume} onClick={onResume}>继续练习</button>
                </div>
            )
        }
    </div>)
}

export default React.forwardRef<CoderMethots, CoderProps>(Coder)
