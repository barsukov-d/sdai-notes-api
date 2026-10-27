import { test } from "node:test"
import assert from "node:assert/strict"
import { createApp } from "./app.js"

async function withServer(fn, seed) {
  const server = (seed ? createApp(seed) : createApp()).listen(0, "127.0.0.1")
  await new Promise((ok) => server.once("listening", ok))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await fn(base)
  } finally {
    server.close()
  }
}

test("список заметок и счётчики", async () => {
  await withServer(async (base) => {
    const body = await (await fetch(`${base}/api/notes`)).json()
    assert.equal(body.total, 3)
    assert.equal(body.active, 2)
  })
})

test("фильтр «сделано»", async () => {
  await withServer(async (base) => {
    const body = await (await fetch(`${base}/api/notes?filter=done`)).json()
    assert.deepEqual(body.notes.map((n) => n.id), [1])
  })
})

test("добавление и отметка «сделано»", async () => {
  await withServer(async (base) => {
    const created = await fetch(`${base}/api/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Новая заметка" }),
    })
    assert.equal(created.status, 201)
    const note = await created.json()
    const patched = await fetch(`${base}/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true }),
    })
    assert.equal((await patched.json()).done, true)
  })
})

test("пустой текст отклоняется", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "  " }),
    })
    assert.equal(res.status, 400)
  })
})

test("версия сервера", async () => {
  await withServer(async (base) => {
    const body = await (await fetch(`${base}/api/version`)).json()
    assert.match(body.version, /^\d+\.\d+\.\d+$/)
  })
})

const statsSeed = () => [
  { id: 1, text: "Старая", done: false, createdAt: "2026-10-20T09:00:00.000Z" },
  { id: 2, text: "Самая новая", done: false, createdAt: "2026-10-22T10:00:00.000Z" },
  { id: 3, text: "Средняя", done: true, createdAt: "2026-10-21T08:00:00.000Z" },
]

test("сводка: сделано, всего и дата последней заметки", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { done: 1, total: 3, lastNoteAt: "2026-10-22T10:00:00.000Z" })
  }, statsSeed())
})

test("сводка на пустом хранилище", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), '{"done":0,"total":0,"lastNoteAt":null}')
  }, [])
})

test("сводка после отметки «сделано» и удаления", async () => {
  await withServer(async (base) => {
    await fetch(`${base}/api/notes/1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true }),
    })
    let stats = await (await fetch(`${base}/api/stats`)).json()
    assert.deepEqual(stats, { done: 2, total: 3, lastNoteAt: "2026-10-22T10:00:00.000Z" })

    assert.equal((await fetch(`${base}/api/notes/2`, { method: "DELETE" })).status, 204)
    stats = await (await fetch(`${base}/api/stats`)).json()
    assert.deepEqual(stats, { done: 2, total: 2, lastNoteAt: "2026-10-21T08:00:00.000Z" })
  }, statsSeed())
})
