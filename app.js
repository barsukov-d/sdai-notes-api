import express from "express"
import pg from "pg"
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
  mountDbCheck(app)
  app.get("/api/version", (_req, res) => res.json({ version }))

  app.get("/api/notes", (req, res) => {
    const filter = String(req.query.filter ?? "all")
    const list =
      filter === "active" ? notes.filter((n) => !n.done) : filter === "done" ? notes.filter((n) => n.done) : notes
    res.json({ notes: list, total: notes.length, active: notes.filter((n) => !n.done).length })
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

/**
 * Проверка доступа к базе (ALL-8, 7в): страница /api/db-check и заметки в базе из
 * CHECK_DB_URL. Адрес и текст ошибки подключения наружу и в журнал не попадают:
 * в тексте ошибки бывает адрес. Обычные заметки выше живут в памяти, как раньше.
 */
function mountDbCheck(app, url = process.env.CHECK_DB_URL) {
  const pool = url ? new pg.Pool({ connectionString: url, max: 3 }) : null
  pool?.on("error", () => console.error("db: соединение оборвалось"))
  const ready = pool
    ? pool.query("CREATE TABLE IF NOT EXISTS db_notes (id serial PRIMARY KEY, text text NOT NULL)").then(
        () => true,
        () => false,
      )
    : Promise.resolve(false)

  app.get("/api/health/db", async (_req, res) => {
    if (!pool) return res.status(503).json({ ok: false, db: "none", text: "нет базы" })
    try {
      const { rows } = await pool.query("SELECT value FROM marker LIMIT 1")
      res.json({ ok: true, db: "connected", marker: rows[0]?.value ?? null })
    } catch {
      console.error("db: запрос не выполнен")
      res.status(503).json({ ok: false, db: "error", text: "база не отвечает" })
    }
  })
  const needDb = async (res) => {
    if (await ready) return true
    res.status(503).json({ error: "нет базы" })
    return false
  }
  app.get("/api/db-notes", async (_req, res) => {
    if (!(await needDb(res))) return
    const { rows } = await pool.query("SELECT id, text FROM db_notes ORDER BY id")
    res.json({ notes: rows })
  })
  app.post("/api/db-notes", async (req, res) => {
    if (!(await needDb(res))) return
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : ""
    if (text === "" || text.length > 200) return res.status(400).json({ error: "Текст от 1 до 200 символов" })
    const { rows } = await pool.query("INSERT INTO db_notes (text) VALUES ($1) RETURNING id, text", [text])
    res.status(201).json(rows[0])
  })
  app.get("/api/db-check", (_req, res) => res.type("html").send(DB_CHECK_PAGE))
}

const DB_CHECK_PAGE = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Заметки в базе</title>
<p id="status" data-testid="db-status"></p><h1>Заметки в базе</h1>
<p data-testid="db-caption">Заметки хранятся в базе данных</p>
<form id="f"><input id="t" data-testid="note-text" placeholder="Текст заметки" required>
<button data-testid="note-add">Добавить</button></form><ul id="l" data-testid="notes"></ul>
<script>
const load = async () => {
  const h = await (await fetch("/api/health/db")).json()
  document.getElementById("status").textContent = h.ok ? "База подключена" : "Нет базы"
  const r = await fetch("/api/db-notes")
  const l = document.getElementById("l")
  l.replaceChildren()
  if (r.ok) for (const n of (await r.json()).notes) { const li = document.createElement("li"); li.textContent = n.text; l.append(li) }
}
document.getElementById("f").addEventListener("submit", async (e) => {
  e.preventDefault()
  const t = document.getElementById("t")
  await fetch("/api/db-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t.value }) })
  t.value = ""
  await load()
})
load()
</script></html>`
