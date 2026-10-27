import { test } from "node:test"
import assert from "node:assert/strict"
import { createApp } from "./app.js"

async function withServer(fn, seed) {
  const server = createApp(seed).listen(0, "127.0.0.1")
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

const json = { "content-type": "application/json" }

async function addNote(base, text) {
  const res = await fetch(`${base}/api/notes`, { method: "POST", headers: json, body: JSON.stringify({ text }) })
  return res.json()
}

test("сводка: пустое хранилище", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { done: 0, total: 0, lastNoteAt: null })
  }, [])
})

test("сводка: сделано и всего по всем заметкам", async () => {
  await withServer(async (base) => {
    const a = await addNote(base, "Первая")
    const b = await addNote(base, "Вторая")
    await addNote(base, "Третья")
    await fetch(`${base}/api/notes/${a.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ done: true }) })
    let res = await fetch(`${base}/api/stats`)
    assert.equal(res.status, 200)
    let body = await res.json()
    assert.deepEqual(Object.keys(body).sort(), ["done", "lastNoteAt", "total"])
    assert.equal(body.done, 1)
    assert.equal(body.total, 3)
    await fetch(`${base}/api/notes/${b.id}`, { method: "DELETE" })
    body = await (await fetch(`${base}/api/stats`)).json()
    assert.equal(body.done, 1)
    assert.equal(body.total, 2)
  }, [])
})

test("сводка: дата самой новой заметки", async () => {
  await withServer(async (base) => {
    const first = await addNote(base, "Первая")
    await new Promise((ok) => setTimeout(ok, 5))
    const second = await addNote(base, "Вторая")
    let body = await (await fetch(`${base}/api/stats`)).json()
    assert.equal(body.lastNoteAt, second.createdAt)
    assert.ok(!Number.isNaN(new Date(body.lastNoteAt).getTime()))
    await fetch(`${base}/api/notes/${first.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ done: true }) })
    body = await (await fetch(`${base}/api/stats`)).json()
    assert.equal(body.lastNoteAt, second.createdAt)
  }, [])
})

test("сводка по начальным заметкам", async () => {
  await withServer(async (base) => {
    const body = await (await fetch(`${base}/api/stats`)).json()
    assert.deepEqual(body, { done: 1, total: 3, lastNoteAt: "2026-10-22T14:15:00.000Z" })
  })
})
