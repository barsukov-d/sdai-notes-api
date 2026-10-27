import express from "express"
import { readFileSync } from "node:fs"

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))

/**
 * Приложение «Заметки команды»: хранит заметки в памяти процесса.
 * Экспортируется отдельно от запуска, чтобы тесты работали без сети.
 */
export function createApp(seed = defaultNotes()) {
  const app = express()
  app.use(express.json())

  let notes = seed.map((n) => ({ ...n }))
  let nextId = notes.reduce((max, n) => Math.max(max, n.id), 0) + 1

  app.get("/api/health", (_req, res) => res.json({ ok: true }))
  app.get("/api/version", (_req, res) => res.json({ version }))

  app.get("/api/notes", (req, res) => {
    const filter = String(req.query.filter ?? "all")
    const list =
      filter === "active" ? notes.filter((n) => !n.done) : filter === "done" ? notes.filter((n) => n.done) : notes
    res.json({ notes: list, total: notes.length, active: notes.filter((n) => !n.done).length })
  })

  app.get("/api/stats", (_req, res) => {
    const lastCreatedAt = notes.reduce(
      (latest, n) => (latest === null || Date.parse(n.createdAt) > Date.parse(latest) ? n.createdAt : latest),
      null,
    )
    res.json({ done: notes.filter((n) => n.done).length, total: notes.length, lastCreatedAt })
  })

  app.post("/api/notes", (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : ""
    if (text === "") return res.status(400).json({ error: "Текст заметки не может быть пустым" })
    if (text.length > 200) return res.status(400).json({ error: "Не длиннее 200 символов" })
    const note = { id: nextId++, text, done: false, createdAt: new Date().toISOString() }
    notes.push(note)
    res.status(201).json(note)
  })

  app.patch("/api/notes/:id", (req, res) => {
    const note = notes.find((n) => n.id === Number(req.params.id))
    if (!note) return res.status(404).json({ error: "Заметка не найдена" })
    if (typeof req.body?.done === "boolean") note.done = req.body.done
    res.json(note)
  })

  app.delete("/api/notes/:id", (req, res) => {
    const before = notes.length
    notes = notes.filter((n) => n.id !== Number(req.params.id))
    if (notes.length === before) return res.status(404).json({ error: "Заметка не найдена" })
    res.status(204).end()
  })

  return app
}

export function defaultNotes() {
  return [
    { id: 1, text: "Согласовать макет главной страницы", done: true, createdAt: "2026-10-20T09:00:00.000Z" },
    { id: 2, text: "Подготовить демо для заказчика", done: false, createdAt: "2026-10-21T10:30:00.000Z" },
    { id: 3, text: "Проверить выгрузку отчёта", done: false, createdAt: "2026-10-22T14:15:00.000Z" },
  ]
}
